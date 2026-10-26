"""Real PostgreSQL proof, restricted to the explicit synthetic test service."""
import importlib.util
import json
import os
import pathlib
import subprocess
import tempfile
import unittest
import uuid

ROOT = pathlib.Path(__file__).parents[2]
spec = importlib.util.spec_from_file_location("release_runner_pg", ROOT / "scripts/production/release_runner.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


@unittest.skipUnless(os.environ.get("YUBIE_RELEASE_PG_CONTAINER"), "isolated synthetic PostgreSQL service required")
class ReleasePostgres(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.environ.get("YUBIE_RELEASE_ALLOW_LOCAL_PG") != "synthetic":
            raise RuntimeError("Explicit synthetic service approval required")
        cls.container = os.environ["YUBIE_RELEASE_PG_CONTAINER"]
        cls.commands = runner.Commands()
        cls.commands.run(runner.DOCKER + ["exec", cls.container, "/bin/sh", "-c", '[ "$POSTGRES_USER" = yubie ] && [ "$POSTGRES_DB" = yubie_test ]'])
        cls.admin = runner.Postgres(cls.commands, cls.container)

    def setUp(self):
        self.name = "release_test_" + uuid.uuid4().hex
        self.admin.query("CREATE DATABASE " + self.name + ";")
        self.pg = runner.Postgres(self.commands, self.container, self.name)
        self.pg.query("CREATE TABLE schema_migrations(version text PRIMARY KEY,applied_at timestamptz DEFAULT now());")
        self.versions = []
        for path in sorted((ROOT / "packages/persistence/migrations").glob("*.sql")):
            self.pg.query(path.read_text() + "\nINSERT INTO schema_migrations(version) VALUES('" + path.name + "');")
            self.versions.append(path.name)
        self.pg.query("INSERT INTO inventory_lots(id,product_id,size_id,lot_code,quantity_on_hand,expiry_date,status,created_at,updated_at) VALUES('synthetic_a','flour','250g','SYNTHETIC-A',1,'2030-01-01','received',now(),now());")

    def tearDown(self):
        self.admin.query("DROP DATABASE " + self.name + " WITH (FORCE);")

    def test_backup_snapshot_survives_concurrent_inventory_write(self):
        owner = self
        class ConcurrentWriter(runner.Commands):
            def run(self, args, **kwargs):
                if any("exec pg_dump" in arg for arg in args):
                    owner.pg.query("INSERT INTO inventory_lots(id,product_id,size_id,lot_code,quantity_on_hand,expiry_date,status,created_at,updated_at) VALUES('synthetic_b','flour','250g','SYNTHETIC-B',1,'2030-01-01','received',now(),now());")
                return super().run(args, **kwargs)
        pg = runner.Postgres(ConcurrentWriter(), self.container, self.name)
        journal = []
        with tempfile.TemporaryDirectory() as directory:
            proof = pg.backup_and_restore(pathlib.Path(directory), journal.append)
            self.assertEqual(proof["counts"]["lots"], 1)
            self.assertEqual(proof["preUpgradeMigrations"], self.versions)
            self.assertEqual(proof["scratchRestore"], "PASS")
        self.assertEqual(self.pg.summary()["counts"]["lots"], 2)
        scratch = journal[-1]["scratch"]["name"]
        self.assertEqual(self.admin.query("SELECT count(*) FROM pg_database WHERE datname='" + scratch + "';"), "0")

    def test_restore_failure_cleans_only_its_own_scratch(self):
        class RestoreFailure(runner.Commands):
            def run(self, args, **kwargs):
                if any("exec pg_restore" in arg for arg in args):
                    raise runner.Blocked("SYNTHETIC_RESTORE_FAILURE")
                return super().run(args, **kwargs)
        pg = runner.Postgres(RestoreFailure(), self.container, self.name)
        journal = []
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(runner.Blocked):
                pg.backup_and_restore(pathlib.Path(directory), journal.append)
        self.assertEqual(self.pg.summary()["counts"]["lots"], 1)
        self.assertEqual(self.admin.query("SELECT count(*) FROM pg_database WHERE datname='" + journal[-1]["scratch"]["name"] + "';"), "0")

    def test_old_worker_completions_cannot_accept_a_stalled_replacement(self):
        self.assertTrue(hasattr(runner, "worker_evidence_sql"), "replacement-specific worker evidence is missing")
        self.pg.query("CREATE SCHEMA pgboss; CREATE TABLE pgboss.schedule(name text); CREATE TABLE pgboss.job(name text,state text,started_on timestamptz,completed_on timestamptz); INSERT INTO pgboss.schedule VALUES('payment.reconcile'),('payment.notifications'); INSERT INTO pgboss.job VALUES('payment.notifications','completed',now()-interval '20 seconds',now()-interval '10 seconds'),('payment.reconcile','completed',now()-interval '20 seconds',now()-interval '10 seconds');")
        since = self.pg.query("SELECT to_char(now()-interval '5 seconds','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"');")
        sql = runner.worker_evidence_sql(since)
        evidence = json.loads(self.pg.query(sql))
        with self.assertRaises(runner.Blocked):runner.validate_worker_evidence(evidence, "preview")
        self.pg.query("INSERT INTO pgboss.job VALUES('payment.notifications','completed',now()-interval '4 seconds',now()-interval '1 second');")
        evidence = json.loads(self.pg.query(sql))
        runner.validate_worker_evidence(evidence, "preview")
        with self.assertRaises(runner.Blocked):runner.validate_worker_evidence(evidence, "ipaymu")

    def test_recorded_versions_do_not_hide_missing_schema_objects(self):
        sql = (ROOT / "scripts/production/schema_checks.sql").read_text()
        runner.P.validate_schema(self.versions, self.pg.summary()["migrations"], json.loads(self.pg.query(sql)))
        self.pg.query("DROP INDEX idempotency_keys_resource;")
        with self.assertRaises(runner.Blocked):
            runner.P.validate_schema(self.versions, self.pg.summary()["migrations"], json.loads(self.pg.query(sql)))


if __name__ == "__main__":
    unittest.main()
