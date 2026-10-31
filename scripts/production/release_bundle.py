"""Publish digest-bound release materials from an exact clean Git checkout."""
import argparse
import gzip
import hashlib
import io
import json
import pathlib
import re
import subprocess
import sys
import tarfile
import types

MATERIALS = ["scripts/production/release_runner.py", "scripts/production/release_policy.py", "scripts/production/install_release.py", "scripts/production/schema_checks.sql", "infrastructure/docker-compose.prod.yml"]
# Compose bytes the installer may find already deployed at /opt/yubie/production.
# The release runner swaps in its own rendered compose at the end of every
# successful deploy, so after each deploy append the new live hash (the last
# entry of the deployed release manifest's acceptedPriorComposeSha256) here.
PRIOR_COMPOSE_SHA256 = [
    "180f6ad41cbcbf2864ba23b240b9ed6b5174ca14f5e0e3c91e139368309c240c",  # pre-088312e era compose
    "19e96bfab5399eada4b4ef2db738dcc4120ca25541afe89a59ce34bbaf2101fc",  # rendered by release 088312e53e7d6c968d8227e71a589d5a17633439
    "6d178eac90fdc455e2fd245c59ae433b6a1cc7ff67fe64a3cdd7b1a70dc533e9",  # rendered by release 667f9ab59e3349cf6247ec58efb5f4e7f23a894d
    "ad292f5d303ba4aeeb1c17c78ea9eae8ec08af30311f9c4927dcde5bc96de681",  # rendered by release b23890073a9eb05be8f1d8149eabce556e88db78
]


def require(condition, code):
    if not condition:
        raise ValueError(code)


def archive(path, contents):
    with open(path, "xb") as output, gzip.GzipFile(fileobj=output, mode="wb", mtime=0, filename="") as zipped, tarfile.open(fileobj=zipped, mode="w|") as tar:
        for name, value in sorted(contents.items()):
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = len(value), 0o444, 0
            tar.addfile(info, io.BytesIO(value))
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def build(root, sha, api, worker, output):
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    require(actual == sha and re.fullmatch(r"[a-f0-9]{40}", sha), "EXACT_SOURCE_SHA_REQUIRED")
    require(not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=root).strip(), "SOURCE_DIRTY")
    for role, image in (("api", api), ("worker", worker)):
        require(re.fullmatch(r"ghcr\.io/yubiefood-id/yubie-" + role + r"@sha256:[a-f0-9]{64}", image), "PINNED_IMAGE_REQUIRED")
    migrations = sorted((root / "packages/persistence/migrations").glob("*.sql"))
    files = MATERIALS + [str(path.relative_to(root)) for path in migrations]
    # No caller-selected or untracked executable can enter a privileged bundle.
    tracked = set(subprocess.check_output(["git", "ls-files"], cwd=root, text=True).splitlines())
    require(set(files) <= tracked, "UNTRACKED_RELEASE_MATERIAL")
    require(all(not (root / name).is_symlink() for name in files), "SYMLINK_RELEASE_MATERIAL")
    contents = {name: subprocess.check_output(["git", "show", sha + ":" + name], cwd=root) for name in files}
    subprocess.run(["node", "apps/web/scripts/verify-release.mjs", sha], cwd=root, check=True, stdout=subprocess.DEVNULL)
    web_manifest = json.loads((root / "apps/web/dist/client/release-manifest.json").read_text())
    require(web_manifest["releaseSha"] == sha and web_manifest["dirty"] is False and web_manifest["launchProfile"] == "DIRECT_COMMERCE_PRODUCTION", "WEB_RELEASE_IDENTITY")
    output.mkdir(parents=True, exist_ok=False)
    web_files = {"apps/web/wrangler.prod.jsonc": (root / "apps/web/wrangler.prod.jsonc").read_bytes()}
    for directory in (root / "apps/web/dist/client", root / "apps/web/dist/server"):
        for path in directory.rglob("*"):
            require(not path.is_symlink(), "WEB_SYMLINK")
            if path.is_file():
                web_files[str(path.relative_to(root))] = path.read_bytes()
    web_sha = archive(output / "web.tgz", web_files)
    manifest = {"schemaVersion": 1, "sourceSha": sha, "apiImage": api, "workerImage": worker,
                "files": {name: hashlib.sha256(value).hexdigest() for name, value in contents.items()},
                "migrations": [path.name for path in migrations], "webArtifact": {**web_manifest, "archiveSha256": web_sha},
                "acceptedPriorComposeSha256": [*PRIOR_COMPOSE_SHA256, "7befdcf8332861ea8620ca731721a921aa07100032ae7d1d3fc53f0b997b7c4c"]}
    # Also allow idempotent bootstrap after this exact release has been deployed.
    policy = types.ModuleType("frozen_release_policy")
    exec(compile(contents["scripts/production/release_policy.py"], "release_policy.py", "exec"), policy.__dict__)
    policy.validate_manifest(manifest)
    rendered = policy.render_compose(contents["infrastructure/docker-compose.prod.yml"], manifest)
    manifest["acceptedPriorComposeSha256"].append(hashlib.sha256(rendered).hexdigest())
    contents["release-manifest.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    backend_sha = archive(output / "backend.tgz", contents)
    installer = contents["scripts/production/install_release.py"]
    (output / "install_release.py").write_bytes(installer)
    installer_sha = hashlib.sha256(installer).hexdigest()
    (output / "release-manifest.json").write_bytes(contents["release-manifest.json"])
    checksums = {"backend.tgz": backend_sha, "web.tgz": web_sha, "install_release.py": installer_sha}
    (output / "SHA256SUMS").write_text("".join(digest + "  " + name + "\n" for name, digest in checksums.items()))
    instructions = f'''# Run only in the operator's existing authenticated ROOT VPS session.
# First stage the verified CI artifact files under /home/yubie-deploy/yubie-release-{sha}/ using scp from WSL.
# Source paths are untrusted; copy to private root storage before checking/executing.
umask 077
release_setup=$(mktemp -d /root/yubie-bootstrap-{sha}.XXXXXXXX)
install -o root -g root -m 600 /home/yubie-deploy/yubie-release-{sha}/install_release.py "$release_setup/install_release.py"
install -o root -g root -m 600 /home/yubie-deploy/yubie-release-{sha}/backend.tgz "$release_setup/backend.tgz"
printf '%s  %s\\n' '{installer_sha}' "$release_setup/install_release.py" | sha256sum --check --status && \\
printf '%s  %s\\n' '{backend_sha}' "$release_setup/backend.tgz" | sha256sum --check --status && \\
/usr/bin/python3 -I "$release_setup/install_release.py" "$release_setup/backend.tgz" {backend_sha}
# This installs only the guarded capability; it does not authorize deployment.
# Check the printed wrapper with sudo -n from WSL. Missing authorization must block writes.
'''
    (output / "OWNER_SETUP.sh.txt").write_text(instructions)
    require(not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=root).strip(), "SOURCE_CHANGED_DURING_PACKAGING")
    print(json.dumps({"sourceSha": sha, "checksums": checksums, "manifestSha256": hashlib.sha256(contents["release-manifest.json"]).hexdigest()}, indent=2))
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ("sha", "api-image", "worker-image", "output"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    try:
        build(pathlib.Path(__file__).resolve().parents[2], args.sha, args.api_image, args.worker_image, pathlib.Path(args.output))
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(json.dumps({"result": "BLOCKED", "code": str(error) if isinstance(error, ValueError) else type(error).__name__}))
        raise SystemExit(77)
