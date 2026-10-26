"""Root and sudoers integration. Only run inside the disposable test image."""
import hashlib
import fcntl
import datetime
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import tarfile
import unittest

ISOLATED = os.geteuid() == 0 and os.environ.get("YUBIE_RELEASE_ROOT_FIXTURE") == "isolated" and pathlib.Path("/.dockerenv").exists() and not pathlib.Path("/var/run/docker.sock").exists()


@unittest.skipUnless(ISOLATED, "disposable root fixture without host Docker socket required")
class RootInstaller(unittest.TestCase):
    def test_only_the_fixed_guarded_wrapper_is_delegated(self):
        root = pathlib.Path("/fixture")
        root.mkdir(mode=0o700, exist_ok=True)
        spec = importlib.util.spec_from_file_location("installer", "/src/scripts/production/install_release.py")
        installer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(installer)
        previous = b"services: {}\n"
        production = pathlib.Path("/opt/yubie/production")
        production.mkdir(parents=True)
        os.chown(production, 1001, 1001)
        compose = production / "docker-compose.prod.yml"
        compose.write_bytes(previous)
        os.chown(compose, 1001, 1001)
        old_writer = os.open(compose, os.O_WRONLY)
        pathlib.Path("/etc/yubie").mkdir(mode=0o700)
        pathlib.Path("/etc/yubie/production.env").write_text("YUBIE_ENV=production\nYUBIE_CHECKOUT_ADMISSION=disabled\nCOMMERCE_PROVIDER=preview\n")
        pathlib.Path("/etc/yubie/production.env").chmod(0o600)
        pathlib.Path("/opt/yubie/releases").mkdir(mode=0o755)
        contents = {"scripts/production/" + name: pathlib.Path("/src/scripts/production", name).read_bytes() for name in ("release_runner.py", "release_policy.py", "install_release.py", "schema_checks.sql")}
        contents["infrastructure/docker-compose.prod.yml"] = b"api: ${YUBIE_API_IMAGE:-ghcr.io/yubiefood-id/yubie-api:${RELEASE_SHA}}\nworker: ${YUBIE_WORKER_IMAGE:-ghcr.io/yubiefood-id/yubie-worker:${RELEASE_SHA}}\nsha: ${RELEASE_SHA}\n"
        sha = "a" * 40
        manifest = {"schemaVersion": 1, "sourceSha": sha, "apiImage": "ghcr.io/yubiefood-id/yubie-api@sha256:" + "b" * 64, "workerImage": "ghcr.io/yubiefood-id/yubie-worker@sha256:" + "c" * 64,
                    "files": {key: hashlib.sha256(value).hexdigest() for key, value in contents.items()}, "migrations": ["0023_inventory_approvals.sql", "0024_payment_notification_inbox.sql", "0025_checkout_recovery_binding.sql"], "acceptedPriorComposeSha256": [hashlib.sha256(previous).hexdigest()]}
        contents["release-manifest.json"] = json.dumps(manifest).encode()
        archive = root / "backend.tgz"
        with tarfile.open(archive, "w:gz") as tar:
            for name, data in contents.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
        archive.chmod(0o600)
        proof = installer.install(archive, hashlib.sha256(archive.read_bytes()).hexdigest())
        self.assertEqual(proof["result"], "WRAPPER_INSTALLED_NO_DEPLOYMENT_AUTHORIZATION")
        self.assertEqual(compose.read_bytes(), previous)
        self.assertEqual(compose.stat().st_uid, 0)
        self.assertEqual(production.stat().st_uid, 0)
        os.write(old_writer, b"tampered through old descriptor")
        os.close(old_writer)
        self.assertEqual(compose.read_bytes(), previous)
        wrapper = proof["wrapper"]
        def user(*args, **kwargs):
            return subprocess.run(["/usr/sbin/runuser", "-u", "yubie-deploy", "--", *args], capture_output=True, text=True, **kwargs)
        # No host Docker daemon exists in this fixture. The fake external CLI
        # records only its sanitized process environment, then fails preflight.
        docker = pathlib.Path("/usr/bin/docker")
        docker.write_text('#!/usr/bin/python3 -I\nimport json,os,pathlib\npathlib.Path("/fixture/docker-env.json").write_text(json.dumps(dict(os.environ)))\nraise SystemExit(20)\n')
        docker.chmod(0o755)
        config = pathlib.Path("/etc/yubie/registry/config.json")
        config.write_text("{}")
        config.chmod(0o600)
        baseline = user("sudo", "-n", wrapper)
        self.assertEqual(baseline.returncode, 77, baseline.stderr)
        self.assertIn("COMMAND_FAILED:docker:20", baseline.stdout)
        self.assertEqual(compose.read_bytes(), previous)
        self.assertFalse(pathlib.Path("/var/lib/yubie-release", sha, "journal.json").exists())
        for args in [(wrapper, "extra"), ("/bin/bash", "-c", "true"), ("/usr/bin/docker", "info"), ("/usr/bin/python3", "-c", "pass")]:
            result = user("sudo", "-n", *args)
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        forbidden = user("sudo", "-n", "-E", wrapper)
        self.assertEqual(forbidden.returncode, 1)
        result = user("env", "PYTHONPATH=/fixture/evil", "COMPOSE_FILE=/fixture/evil.yml", "DOCKER_HOST=tcp://untrusted.invalid:2375", "sudo", "-n", wrapper)
        self.assertEqual(result.returncode, 77)
        environment = json.loads((root / "docker-env.json").read_text())
        self.assertFalse({"PYTHONPATH", "COMPOSE_FILE", "DOCKER_HOST"} & environment.keys())
        source = pathlib.Path("/opt/yubie/releases", sha)
        source.chmod(0o777)
        self.assertEqual(user("sudo", "-n", wrapper).returncode, 77)
        source.chmod(0o755)
        policy = source / "scripts/production/release_policy.py"
        original = policy.read_bytes()
        policy.unlink()
        policy.symlink_to(root / "evil.py")
        self.assertEqual(user("sudo", "-n", wrapper).returncode, 77)
        policy.unlink()
        policy.write_bytes(original)
        policy.chmod(0o444)
        self.assertEqual(compose.read_bytes(), previous)

        # Keep real privilege/path/authorization/journal behavior. Replace only
        # external Docker/DB preflight, unavailable in this socket-free fixture.
        runner_path = source / "scripts/production/release_runner.py"
        spec = importlib.util.spec_from_file_location("installed_runner", runner_path)
        runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runtime)
        class PreflightFixture(runtime.Release):
            def inspect(self, temporary):
                self.provider = "preview"
                self.env_digest = hashlib.sha256(pathlib.Path("/etc/yubie/production.env").read_bytes()).hexdigest()
                self.preflight = {"containers": {"api": {"imageId": "sha256:" + "1" * 64}, "worker": {"imageId": "sha256:" + "2" * 64}}}
                return self.preflight
        manifest_hash = hashlib.sha256(contents["release-manifest.json"]).hexdigest()
        release = PreflightFixture(source / "release-manifest.json", manifest_hash)
        backups = pathlib.Path("/var/backups/yubie-commerce")
        before = list(backups.iterdir())
        with self.assertRaisesRegex(runtime.Blocked, "AUTHORIZATION_REQUIRED"):
            release.execute()
        self.assertEqual(list(backups.iterdir()), before)
        operation = pathlib.Path("/var/lib/yubie-release", sha)
        self.assertFalse((operation / "journal.json").exists())
        now = datetime.datetime.now(datetime.timezone.utc)
        authorization = {"manifestSha256": "f" * 64, "action": "backend_disabled_release", "approvedBy": "synthetic-operator", "approvalRef": "synthetic-root-test", "notBefore": (now - datetime.timedelta(minutes=1)).isoformat(), "expiresAt": (now + datetime.timedelta(minutes=30)).isoformat(), "expectedApiImageId": "sha256:" + "1" * 64, "expectedWorkerImageId": "sha256:" + "2" * 64, "expectedProvider": "preview"}
        auth = operation / "authorization.json"
        auth.write_text(json.dumps(authorization))
        auth.chmod(0o600)
        with self.assertRaisesRegex(runtime.Blocked, "AUTHORIZATION_BINDING"):
            release.execute()
        self.assertEqual(list(backups.iterdir()), before)
        authorization["manifestSha256"] = manifest_hash
        auth.write_text(json.dumps(authorization))
        with self.assertRaisesRegex(runtime.Blocked, "COMMAND_FAILED"):
            release.execute()
        journal = json.loads((operation / "journal.json").read_text())
        self.assertEqual(journal["stage"], "failed")
        self.assertEqual([item["stage"] for item in journal["history"]], ["preflight", "failed"])
        backup_count = len(list(backups.iterdir()))
        with self.assertRaisesRegex(runtime.Blocked, "PARTIAL_RELEASE_REQUIRES_REVIEW"):
            release.execute()
        self.assertEqual(len(list(backups.iterdir())), backup_count)
        self.assertEqual(compose.read_bytes(), previous)
        with open("/var/lib/yubie-release/deployment.lock", "rb") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(installer.InstallBlocked, "DEPLOYMENT_BUSY"):
                installer.install(archive, hashlib.sha256(archive.read_bytes()).hexdigest())



if __name__ == "__main__":
    unittest.main()
