"""Pinned host release. Only the installed zero-argument wrapper is delegated.

No secrets are printed, evaluated as shell code, or accepted from a caller.
PostgreSQL inspection returns aggregates only. Production is never a restore
target; scratch ownership is rechecked before cleanup.
"""
import datetime
import hashlib
import json
import os
import pathlib
import re
import select
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import types
import urllib.request
import uuid

# Compile the wrapper-verified source directly; never load an unsealed .pyc.
P = types.ModuleType("yubie_release_policy")
_policy_path = pathlib.Path(__file__).with_name("release_policy.py")
exec(compile(_policy_path.read_bytes(), str(_policy_path), "exec"), P.__dict__)
Blocked = P.Blocked

STATE = pathlib.Path("/var/lib/yubie-release")
BACKUPS = pathlib.Path("/var/backups/yubie-commerce")
PRODUCTION = pathlib.Path("/opt/yubie/production/docker-compose.prod.yml")
PRODUCTION_ENV = pathlib.Path("/etc/yubie/production.env")
REGISTRY = pathlib.Path("/etc/yubie/registry")
DOCKER = ["/usr/bin/docker", "--host", "unix:///var/run/docker.sock", "--config", str(REGISTRY)]
CLEAN_ENV = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8"}
SUMMARY_SQL = """SELECT json_build_object(
 'migrations',(SELECT coalesce(json_agg(version ORDER BY version),'[]'::json) FROM schema_migrations),
 'counts',json_build_object('orders',(SELECT count(*) FROM orders),'payments',(SELECT count(*) FROM order_payments),
 'paymentEvents',(SELECT count(*) FROM payment_events),'lots',(SELECT count(*) FROM inventory_lots),
 'reservations',(SELECT count(*) FROM inventory_reservations),'movements',(SELECT count(*) FROM inventory_movements)),
 'negativeStock',(SELECT count(*) FROM inventory_lots WHERE quantity_on_hand<0),
 'unresolved',(SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM
 (SELECT provider,count(*) AS count FROM order_payments WHERE status='pending' OR reconciliation_state IN
 ('ambiguous','ambiguous_create','pending_reconciliation','attach_failed','provider_mismatch','late_success_after_terminal','multiple_successful_transactions','other_payment_unresolved') GROUP BY provider) x),
 'criticalExceptions',(SELECT count(*) FROM order_payments p JOIN orders o ON o.id=p.order_id WHERE
 p.reconciliation_state IN ('provider_mismatch','late_success_after_terminal','multiple_successful_transactions','other_payment_unresolved') OR
 (p.status='succeeded' AND o.status NOT IN ('paid','processing','shipped','completed'))),
 'databaseBytes',pg_database_size(current_database())
);"""


def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)


def atomic_json(path, data):
    path = pathlib.Path(path)
    fd, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            os.fchmod(stream.fileno(), 0o600)
            json.dump(data, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Commands:
    def __init__(self):
        self.log = []

    def run(self, args, *, data=None, output=None, timeout=120):
        entry = {"atUtc": utcnow().isoformat(), "argv": list(args)}
        if isinstance(data, bytes):
            entry["stdinSha256"] = hashlib.sha256(data).hexdigest()
        self.log.append(entry)
        try:
            result = subprocess.run(args, input=data if isinstance(data, bytes) else None,
                                    stdin=data if hasattr(data, "read") else None,
                                    stdout=output if output else subprocess.PIPE,
                                    stderr=subprocess.PIPE, env=CLEAN_ENV, cwd="/", timeout=timeout)
            entry["exitCode"] = result.returncode
        except (subprocess.TimeoutExpired, OSError):
            entry["exitCode"] = "timeout_or_unavailable"
            raise Blocked("COMMAND_UNAVAILABLE:" + pathlib.Path(args[0]).name) from None
        P.require(result.returncode == 0, "COMMAND_FAILED:" + pathlib.Path(args[0]).name + ":" + str(result.returncode))
        return result.stdout if result.stdout is not None else b""


def check_scratch_identity(name, oid, marker, actual):
    P.require(re.fullmatch(r"yubie_restore_[a-f0-9]{32}", name), "SCRATCH_NAME")
    P.require(actual.get("oid") == oid and actual.get("marker") == marker, "SCRATCH_IDENTITY_CHANGED")


def validate_worker_evidence(evidence, provider):
    P.require(all(evidence.get(key) is True for key in ("reconcileSchedule", "notificationSchedule", "recentNotificationCompletion")), "WORKER_QUEUE_NOT_READY")
    P.require(evidence.get("notificationExceptions") == 0 and evidence.get("notificationPending", -1) >= 0 and evidence.get("notificationOldestSeconds", 999999) <= 180, "NOTIFICATION_BACKLOG_NOT_READY")
    if provider != "ipaymu":
        P.require(evidence.get("notificationPending") == 0, "INBOX_PROVIDER_MISMATCH")
    if provider != "preview":
        P.require(evidence.get("recentReconciliation") is True, "RECONCILIATION_NOT_READY")


def worker_evidence_sql(started_at):
    P.require(re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z", started_at), "WORKER_START_TIME")
    since = "'" + started_at + "'::timestamptz"
    return """SELECT json_build_object(
 'reconcileSchedule',EXISTS(SELECT 1 FROM pgboss.schedule WHERE name='payment.reconcile'),
 'notificationSchedule',EXISTS(SELECT 1 FROM pgboss.schedule WHERE name='payment.notifications'),
 'recentNotificationCompletion',EXISTS(SELECT 1 FROM pgboss.job WHERE name='payment.notifications' AND state='completed' AND started_on>=""" + since + " AND completed_on>=" + since + """ AND completed_on>now()-interval '3 minutes'),
 'recentReconciliation',EXISTS(SELECT 1 FROM pgboss.job WHERE name='payment.reconcile' AND state='completed' AND started_on>=""" + since + " AND completed_on>=" + since + """ AND completed_on>now()-interval '7 minutes'),
 'notificationPending',(SELECT count(*) FROM payment_notification_inbox WHERE processed_at IS NULL),
 'notificationOldestSeconds',(SELECT coalesce(extract(epoch FROM now()-min(received_at)),0) FROM payment_notification_inbox WHERE processed_at IS NULL),
 'notificationExceptions',(SELECT count(*) FROM payment_notification_inbox WHERE processed_at IS NULL AND last_error_code IS NOT NULL));"""


class Postgres:
    def __init__(self, commands, container, database=None):
        P.require(re.fullmatch(r"[a-f0-9]{12,64}", container), "POSTGRES_CONTAINER_ID")
        P.require(database is None or re.fullmatch(r"[a-z][a-z0-9_]{0,62}", database), "DATABASE_NAME")
        self.commands, self.container, self.database = commands, container, database

    def psql(self, database=None):
        db = database or self.database
        return DOCKER + ["exec", "-i", self.container, "/bin/sh", "-c",
                         'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" --dbname "${1:-$POSTGRES_DB}"', "sh"] + ([db] if db else [])

    def query(self, sql, database=None):
        return self.commands.run(self.psql(database), data=("SET statement_timeout='30s';\n" + sql + "\n").encode()).decode().strip()

    def summary(self, database=None):
        return json.loads(self.query(SUMMARY_SQL, database))

    def clean_scratch(self, scratch):
        name, oid, marker = scratch["name"], scratch["oid"], scratch["marker"]
        P.require(re.fullmatch(r"yubie_restore_[a-f0-9]{32}", name), "SCRATCH_NAME")
        actual = json.loads(self.query("SELECT json_build_object('oid',oid::text,'marker',shobj_description(oid,'pg_database')) FROM pg_database WHERE datname='" + name + "';") or "null")
        if actual is None:
            return
        check_scratch_identity(name, oid, marker, actual)
        self.commands.run(DOCKER + ["exec", self.container, "/bin/sh", "-c", 'exec dropdb -U "$POSTGRES_USER" -- "$1"', "sh", name])

    def backup_and_restore(self, directory, journal):
        """Export one MVCC snapshot for dump and verification metadata."""
        directory = pathlib.Path(directory)
        archive = directory / "postgres.dump"
        exporter = subprocess.Popen(self.psql(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL, env=CLEAN_ENV, cwd="/", bufsize=0)
        self.commands.log.append({"atUtc": utcnow().isoformat(), "argv": self.psql(), "purpose": "export_read_only_snapshot"})
        scratch = None
        try:
            exporter.stdin.write(("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL idle_in_transaction_session_timeout='15min';\nSELECT pg_export_snapshot();\n" + SUMMARY_SQL + "\n").encode())
            exporter.stdin.flush()
            def line():
                P.require(bool(select.select([exporter.stdout], [], [], 45)[0]), "SNAPSHOT_TIMEOUT")
                value = exporter.stdout.readline().decode().strip()
                P.require(bool(value), "SNAPSHOT_CLOSED")
                return value
            snapshot = line()
            P.require(re.fullmatch(r"[A-Fa-f0-9-]{1,64}", snapshot), "SNAPSHOT_ID")
            baseline = json.loads(line())
            P.require(baseline["negativeStock"] == 0, "NEGATIVE_INVENTORY")
            args = DOCKER + ["exec", self.container, "/bin/sh", "-c",
                            'exec pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" --snapshot "$1" --dbname "${2:-$POSTGRES_DB}"', "sh", snapshot] + ([self.database] if self.database else [])
            with archive.open("xb") as stream:
                os.fchmod(stream.fileno(), 0o600)
                self.commands.run(args, output=stream, timeout=600)
                stream.flush()
                os.fsync(stream.fileno())
            exporter.stdin.write(b"COMMIT;\n\\q\n")
            exporter.stdin.flush()
            exporter.wait(timeout=10)
            P.require(exporter.returncode == 0, "SNAPSHOT_EXPORT_FAILED")
            with archive.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            atomic_json(directory / "backup-integrity.json", {"sha256": digest, "baseline": baseline})
            name = "yubie_restore_" + uuid.uuid4().hex
            marker = "yubie-release:" + uuid.uuid4().hex
            journal({"stage": "restore_verification", "scratch": {"name": name, "oid": None, "marker": marker}, "backupSha256": digest})
            self.commands.run(DOCKER + ["exec", self.container, "/bin/sh", "-c", 'exec createdb -T template0 -U "$POSTGRES_USER" -- "$1"', "sh", name])
            self.query("COMMENT ON DATABASE " + name + " IS '" + marker + "';")
            oid = self.query("SELECT oid::text FROM pg_database WHERE datname='" + name + "';")
            scratch = {"name": name, "oid": oid, "marker": marker}
            journal({"stage": "restore_verification", "scratch": scratch, "backupSha256": digest})
            with archive.open("rb") as stream:
                P.require(hashlib.file_digest(stream, "sha256").hexdigest() == digest, "BACKUP_CHANGED")
            with archive.open("rb") as stream:
                self.commands.run(DOCKER + ["exec", "-i", self.container, "/bin/sh", "-c", 'exec pg_restore --no-owner --no-privileges --exit-on-error -U "$POSTGRES_USER" --dbname "$1"', "sh", name], data=stream, timeout=600)
            restored = self.summary(name)
            P.require(restored["migrations"] == baseline["migrations"] and restored["counts"] == baseline["counts"] and restored["negativeStock"] == 0, "RESTORE_PROOF_MISMATCH")
            result = {"backupSha256": digest, "preUpgradeMigrations": baseline["migrations"], "counts": baseline["counts"], "scratchRestore": "PASS"}
            atomic_json(directory / "restore-proof.json", result)
            return result
        finally:
            if exporter.poll() is None:
                try:
                    exporter.stdin.write(b"ROLLBACK;\n\\q\n")
                    exporter.stdin.flush()
                    exporter.wait(timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    exporter.terminate()
            if exporter.stdin:
                exporter.stdin.close()
            if exporter.stdout:
                exporter.stdout.close()
            if scratch:
                self.clean_scratch(scratch)


class Release:
    def __init__(self, manifest_path, manifest_digest):
        P.require(os.geteuid() == 0, "ROOT_WRAPPER_REQUIRED")
        self.manifest_path = pathlib.Path(manifest_path)
        self.digest = manifest_digest
        self.manifest = json.loads(P.read_trusted(self.manifest_path, manifest_digest))
        P.validate_manifest(self.manifest)
        self.source = pathlib.Path("/opt/yubie/releases") / self.manifest["sourceSha"]
        P.require(self.manifest_path == self.source / "release-manifest.json", "MANIFEST_LOCATION")
        for name, digest in self.manifest["files"].items():
            P.read_trusted(self.source / name, digest)
        P.require(pathlib.Path(__file__) == self.source / "scripts/production/release_runner.py", "RUNNER_LOCATION")
        self.commands = Commands()
        self.operation = STATE / self.manifest["sourceSha"]
        self.journal_path = self.operation / "journal.json"
        self.provider = None
        self.preflight = None

    def checkpoint(self, values):
        previous = json.loads(P.read_trusted(self.journal_path)) if self.journal_path.exists() else {}
        history = previous.get("history", []) + [{"stage": values.get("stage"), "atUtc": utcnow().isoformat()}]
        atomic_json(self.journal_path, {**previous, **values, "history": history, "manifestSha256": self.digest, "atUtc": utcnow().isoformat()})
        atomic_json(self.operation / "commands.json", self.commands.log)

    def containers(self):
        ids = self.commands.run(DOCKER + ["ps", "-aq", "--filter", "label=com.docker.compose.project=yubie-prod"]).decode().split()
        P.require(ids and all(re.fullmatch(r"[a-f0-9]{12,64}", value) for value in ids), "PROJECT_CONTAINERS_MISSING")
        rows = json.loads(self.commands.run(DOCKER + ["inspect", *ids]))
        result = {}
        for row in rows:
            labels = row["Config"].get("Labels", {})
            P.require(labels.get("com.docker.compose.project") == "yubie-prod", "FOREIGN_CONTAINER")
            service = labels.get("com.docker.compose.service")
            P.require(service in ("api", "worker", "postgres", "migrate", "bot"), "UNEXPECTED_PROJECT_SERVICE")
            if service in result:
                # One-shot `compose run` containers do not replace the service.
                if labels.get("com.docker.compose.oneoff", "False").lower() == "true":
                    continue
                P.require(result[service]["Config"].get("Labels", {}).get("com.docker.compose.oneoff", "False").lower() == "true", "DUPLICATE_SERVICE")
            result[service] = row
        P.require({"api", "worker", "postgres", "migrate"} <= result.keys(), "BASELINE_SERVICE_MISSING")
        P.require(all(result[key]["State"]["Running"] for key in ("api", "worker", "postgres")), "BASELINE_NOT_RUNNING")
        P.require("bot" not in result or not result["bot"]["State"]["Running"], "BOT_RUNNING")
        return result

    @staticmethod
    def environment(row):
        return dict(entry.split("=", 1) for entry in row["Config"].get("Env", []) if "=" in entry)

    def inspect(self, temporary):
        P.check_trusted_path(PRODUCTION)
        P.check_trusted_path(REGISTRY)
        env_bytes = P.read_trusted(PRODUCTION_ENV)
        P.require(PRODUCTION_ENV.stat().st_mode & 0o077 == 0, "ENV_PERMISSIONS")
        env = pathlib.Path(temporary) / "production.env"
        env.write_bytes(env_bytes)
        env.chmod(0o600)
        self.env_digest = hashlib.sha256(env_bytes).hexdigest()
        composed = P.render_compose(P.read_trusted(self.source / "infrastructure/docker-compose.prod.yml"), self.manifest)
        self.compose = pathlib.Path(temporary) / "docker-compose.prod.yml"
        self.compose.write_bytes(composed)
        self.compose.chmod(0o600)
        self.dc = DOCKER + ["compose", "--project-directory", str(self.source), "--env-file", str(env), "-p", "yubie-prod", "-f", str(self.compose)]
        resolved = json.loads(self.commands.run(self.dc + ["config", "--format", "json"]))
        self.provider = P.validate_compose(resolved, self.manifest)
        rows = self.containers()
        for service in ("api", "worker"):
            current = self.environment(rows[service])
            P.require(current.get("YUBIE_ENV") == "production" and current.get("COMMERCE_PROVIDER") == self.provider, "LIVE_CONFIGURATION_DRIFT")
        P.require(self.environment(rows["api"]).get("YUBIE_CHECKOUT_ADMISSION") == "disabled", "LIVE_ADMISSION_NOT_FROZEN")
        P.require(self.environment(rows["worker"]).get("SUPPORT_PROVIDER") == "disabled", "LIVE_SUPPORT_NOT_DISABLED")
        self.pg = Postgres(self.commands, rows["postgres"]["Id"])
        database = self.pg.summary()
        database["serverVersionNumber"] = int(self.pg.query("SHOW server_version_num;"))
        if self.pg.query("SELECT to_regclass('public.payment_notification_inbox') IS NOT NULL;") == "t":
            database["pendingNotifications"] = int(self.pg.query("SELECT count(*) FROM payment_notification_inbox WHERE processed_at IS NULL;"))
        self.preflight = {"sourceSha": self.manifest["sourceSha"], "manifestSha256": self.digest, "provider": self.provider,
                          "flags": {"YUBIE_ENV": "production", "YUBIE_CHECKOUT_ADMISSION": "disabled", "INVENTORY_MODE": "lots", "SUPPORT_PROVIDER": "disabled"},
                          "containers": {key: {"id": row["Id"], "imageId": row["Image"], "imageRef": row["Config"]["Image"], "state": row["State"]["Status"], "exitCode": row["State"].get("ExitCode"), "health": row["State"].get("Health", {}).get("Status", "not_configured"), "environmentNames": sorted(self.environment(row))} for key, row in rows.items()},
                          "database": database, "productionComposeSha256": hashlib.sha256(P.read_trusted(PRODUCTION)).hexdigest()}
        P.require(rows["migrate"]["State"]["Status"] == "exited" and rows["migrate"]["State"]["ExitCode"] == 0, "PREVIOUS_MIGRATION_FAILED_OR_RUNNING")
        expected = self.manifest["migrations"]
        P.require(database["migrations"] in (expected[:22], expected), "UNREVIEWED_SCHEMA_BASELINE")
        P.require(170000 <= database["serverVersionNumber"] < 180000, "UNREVIEWED_POSTGRES_VERSION")
        P.require(database["negativeStock"] == 0 and database["criticalExceptions"] == 0, "FINANCIAL_OR_STOCK_EXCEPTION")
        P.require(all(item["provider"] == self.provider for item in database["unresolved"]), "UNRESOLVED_OTHER_PROVIDER")
        P.require(self.provider == "ipaymu" or database.get("pendingNotifications", 0) == 0, "UNRESOLVED_INBOX_PROVIDER")
        P.require(shutil.disk_usage(BACKUPS).free > 3 * database["databaseBytes"] + 4 * 1024**3, "INSUFFICIENT_RESTORE_SPACE")
        P.read_trusted(REGISTRY / "config.json")
        P.require((REGISTRY / "config.json").stat().st_mode & 0o077 == 0, "REGISTRY_CREDENTIAL_PERMISSIONS")
        for role in ("api", "worker"):
            self.commands.run(DOCKER + ["manifest", "inspect", self.manifest[role + "Image"]], timeout=45)
        return self.preflight

    def authorize(self):
        path = self.operation / "authorization.json"
        P.require(path.exists(), "BLOCKED_OPERATOR_AUTHORIZATION_REQUIRED")
        auth = json.loads(P.read_trusted(path))
        P.validate_authorization(auth, self.digest, utcnow())
        for key, service in (("expectedApiImageId", "api"), ("expectedWorkerImageId", "worker")):
            P.require(auth.get(key) == self.preflight["containers"][service]["imageId"], "AUTHORIZED_BASELINE_CHANGED")
        P.require(auth.get("expectedProvider") == self.provider, "AUTHORIZED_PROVIDER_CHANGED")
        P.require(hashlib.sha256(P.read_trusted(PRODUCTION_ENV)).hexdigest() == self.env_digest, "PRODUCTION_ENV_CHANGED")

    def verify_schema(self):
        versions = self.pg.summary()["migrations"]
        checks = json.loads(self.pg.query(P.read_trusted(self.source / "scripts/production/schema_checks.sql").decode()))
        P.validate_schema(self.manifest["migrations"], versions, checks)
        return {"migrations": versions, "checks": checks}

    def verify_runtime(self):
        rows = self.containers()
        for service in ("api", "worker"):
            image = json.loads(self.commands.run(DOCKER + ["image", "inspect", self.manifest[service + "Image"]]))[0]
            P.require(rows[service]["Image"] == image["Id"] and rows[service]["Config"]["Image"] == self.manifest[service + "Image"], "RUNTIME_IMAGE_MISMATCH")
            P.require(image["Config"].get("Labels", {}).get("org.opencontainers.image.revision") == self.manifest["sourceSha"], "RUNTIME_REVISION_MISMATCH")
            env = self.environment(rows[service])
            P.require(env.get("RELEASE_SHA") == self.manifest["sourceSha"] and env.get("COMMERCE_PROVIDER") == self.provider, "RUNTIME_ENV_MISMATCH")
        api = rows["api"]["Id"]
        script = r'''const headers={"x-api-proxy-token":process.env.API_PROXY_TOKEN,"content-type":"application/json"};
const health=await fetch("http://127.0.0.1:8787/healthz");const h=await health.json();if(!health.ok||h.releaseSha!==process.env.RELEASE_SHA)throw Error("health");
const ready=await fetch("http://127.0.0.1:8787/readyz");const r=await ready.json();if(!ready.ok||r.details?.database!=="connected"||r.details?.commerceProvider!==process.env.COMMERCE_PROVIDER)throw Error("readiness");
const freeze=await fetch("http://127.0.0.1:8787/v1/checkouts",{method:"POST",headers,body:"{}"});if(freeze.status!==503||(await freeze.json()).code!=="CHECKOUT_DISABLED")throw Error("freeze");
const available=await fetch("http://127.0.0.1:8787/v1/catalog/availability",{headers});const a=await available.json();if(!available.ok||a.data?.length!==9||!a.data.every(x=>Number.isSafeInteger(x.maxQuantity)&&x.maxQuantity>=0))throw Error("availability");
const privateRead=await fetch("http://127.0.0.1:8787/v1/account/orders",{headers});if(![401,403].includes(privateRead.status))throw Error("privacy");
console.log(JSON.stringify({releaseSha:h.releaseSha,ready:true,admission:"disabled",variants:a.data.length,customerBoundary:true}));'''
        http = json.loads(self.commands.run(DOCKER + ["exec", api, "node", "--input-type=module", "-e", script], timeout=45))
        env = self.environment(rows["api"])
        P.require(env.get("YUBIE_CHECKOUT_ADMISSION") == "disabled", "POST_DEPLOY_ADMISSION")
        return {"containers": {s: {"imageId": rows[s]["Image"], "imageRef": rows[s]["Config"]["Image"]} for s in ("api", "worker")}, "http": http}

    def worker_ready(self):
        row = self.containers()["worker"]
        P.require(row["Config"]["Image"] == self.manifest["workerImage"] and self.environment(row).get("RELEASE_SHA") == self.manifest["sourceSha"], "WORKER_IDENTITY_NOT_READY")
        evidence = json.loads(self.pg.query(worker_evidence_sql(row["State"]["StartedAt"])))
        evidence["containerId"] = row["Id"]
        evidence["startedAt"] = row["State"]["StartedAt"]
        validate_worker_evidence(evidence, self.provider)
        return evidence

    def execute(self):
        for directory in (STATE, BACKUPS, self.operation):
            P.check_trusted_path(directory)
            P.require(directory.stat().st_mode & 0o077 == 0, "PRIVATE_DIRECTORY_PERMISSIONS")
        with P.deployment_lock(STATE / "deployment.lock"), tempfile.TemporaryDirectory(dir=STATE, prefix="preflight-") as temporary:
            self.inspect(temporary)
            existing = json.loads(P.read_trusted(self.journal_path)) if self.journal_path.exists() else None
            decision = P.journal_decision(existing, self.digest)
            if decision == "verify":
                return {"result": "ALREADY_DEPLOYED_VERIFIED", "runtime": self.verify_runtime(), "schema": self.verify_schema(), "worker": self.worker_ready(), "commands": self.commands.log}
            self.authorize()
            operation_id = uuid.uuid4().hex
            backup = BACKUPS / operation_id
            backup.mkdir(mode=0o700)
            self.checkpoint({"stage": "preflight", "backupDirectory": str(backup), "preflight": self.preflight})
            try:
                for service in ("api", "worker"):
                    image = self.manifest[service + "Image"]
                    self.commands.run(DOCKER + ["pull", image], timeout=600)
                    data = json.loads(self.commands.run(DOCKER + ["image", "inspect", image]))[0]
                    P.require(data["Config"].get("Labels", {}).get("org.opencontainers.image.revision") == self.manifest["sourceSha"] and image in data.get("RepoDigests", []), "PUBLISHED_IMAGE_PROVENANCE")
                (backup / "production.env").write_bytes(P.read_trusted(PRODUCTION_ENV))
                (backup / "production.env").chmod(0o600)
                (backup / "docker-compose.prod.yml").write_bytes(P.read_trusted(PRODUCTION))
                (backup / "docker-compose.prod.yml").chmod(0o600)
                proof = self.pg.backup_and_restore(backup, self.checkpoint)
                self.authorize()
                self.checkpoint({"stage": "migration_started", "restore": proof})
                self.commands.run(self.dc + ["run", "--rm", "--no-deps", "migrate"], timeout=600)
                schema = self.verify_schema()
                self.authorize()
                self.checkpoint({"stage": "worker_started", "schema": schema})
                self.commands.run(self.dc + ["up", "-d", "--no-deps", "worker"], timeout=180)
                deadline = time.monotonic() + 360
                while True:
                    try:
                        worker = self.worker_ready()
                        P.require(self.pg.summary()["criticalExceptions"] == 0, "WORKER_FINANCIAL_EXCEPTION")
                        break
                    except Blocked:
                        P.require(time.monotonic() < deadline, "WORKER_READINESS_TIMEOUT")
                        time.sleep(5)
                # Baseline authorization was checked before changing the worker.
                P.validate_authorization(json.loads(P.read_trusted(self.operation / "authorization.json")), self.digest, utcnow())
                P.require(hashlib.sha256(P.read_trusted(PRODUCTION_ENV)).hexdigest() == self.env_digest, "PRODUCTION_ENV_CHANGED")
                self.checkpoint({"stage": "api_started", "worker": worker})
                self.commands.run(self.dc + ["up", "-d", "--no-deps", "api"], timeout=180)
                deadline = time.monotonic() + 120
                while True:
                    try:
                        runtime = self.verify_runtime()
                        break
                    except Blocked:
                        P.require(time.monotonic() < deadline, "API_READINESS_TIMEOUT")
                        time.sleep(3)
                P.require(self.pg.summary()["criticalExceptions"] == 0, "POST_DEPLOY_FINANCIAL_EXCEPTION")
                fd, name = tempfile.mkstemp(dir=PRODUCTION.parent)
                with os.fdopen(fd, "wb") as stream:
                    stream.write(self.compose.read_bytes())
                    stream.flush()
                    os.fsync(stream.fileno())
                    os.fchmod(stream.fileno(), 0o444)
                os.replace(name, PRODUCTION)
                receipt = {"result": "BACKEND_DEPLOYED_DISABLED", "sourceSha": self.manifest["sourceSha"], "manifestSha256": self.digest,
                           "images": {k: self.manifest[k + "Image"] for k in ("api", "worker")}, "runtime": runtime, "schema": schema, "restore": proof, "worker": worker,
                           "rollback": "requires qualified schema-compatible images; never restore over orders", "livePaymentEnabled": False, "atUtc": utcnow().isoformat(), "commands": self.commands.log}
                self.checkpoint({"stage": "complete", "receipt": receipt})
                atomic_json(self.operation / "receipt.json", receipt)
                return receipt
            except BaseException:
                self.checkpoint({"stage": "failed", "recovery": "STOP. Preserve PSP, callbacks, worker, database and backup. Qualified forward repair or compatible rollback required."})
                raise


def main():
    os.umask(0o077)
    def interrupted(_signal, _frame):
        raise Blocked("INTERRUPTED")
    signal.signal(signal.SIGTERM, interrupted)
    if len(sys.argv) != 3:
        print(json.dumps({"result": "BLOCKED", "code": "INSTALLED_WRAPPER_REQUIRED"}))
        return 64
    release = None
    try:
        release = Release(sys.argv[1], sys.argv[2])
        print(json.dumps(release.execute(), indent=2))
        return 0
    except (Blocked, OSError, ValueError, KeyError, TypeError) as error:
        code = str(error) if isinstance(error, Blocked) else type(error).__name__
        print(json.dumps({"result": "BLOCKED", "code": code, "preflight": release.preflight if release else None, "commands": release.commands.log if release else []}, indent=2))
        return 77


if __name__ == "__main__":
    raise SystemExit(main())
