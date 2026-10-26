"""One-time operator bootstrap. Never delegate this installer in sudoers.

The operator first copies this file and the bundle to root-private storage and
checks their hashes against protected CI output. No password is an input.
"""
import hashlib
import fcntl
import io
import json
import os
import pathlib
import pwd
import re
import stat
import subprocess
import sys
import tarfile
import tempfile

STATE = pathlib.Path("/var/lib/yubie-release")
BACKUPS = pathlib.Path("/var/backups/yubie-commerce")
PRODUCTION = pathlib.Path("/opt/yubie/production")


class InstallBlocked(Exception):
    pass


def require(condition, code):
    if not condition:
        raise InstallBlocked(code)


def file_digest(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def trusted(path):
    current = pathlib.Path(path)
    require(current.is_absolute() and ".." not in current.parts, "TRUSTED_PATH")
    while True:
        info = current.lstat()
        require(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022, "ROOT_CONTROL_REQUIRED")
        if current == pathlib.Path("/"):
            break
        current = current.parent


def root_directory(path, mode):
    if not path.exists():
        trusted(path.parent)
        path.mkdir(mode=mode)
        os.chmod(path, mode)
    trusted(path)
    require(path.is_dir(), "DIRECTORY_REQUIRED")
    require(not path.stat().st_mode & (0o777 ^ mode), "DIRECTORY_PERMISSIONS")


def verify_archive(path, digest):
    require(re.fullmatch(r"[a-f0-9]{64}", digest) and file_digest(path) == digest, "BUNDLE_DIGEST")
    contents = {}
    total = 0
    with tarfile.open(path, "r:gz") as archive:
        for member in archive:
            name = member.name
            require(member.isreg() and len(contents) < 256 and name not in contents, "ARCHIVE_ENTRY")
            require(re.fullmatch(r"(?:release-manifest\.json|scripts/production/[a-z_]+\.(?:py|sql)|infrastructure/docker-compose\.prod\.yml|packages/persistence/migrations/[0-9]{4}_[a-z0-9_]+\.sql)", name), "ARCHIVE_PATH")
            total += member.size
            require(0 <= member.size <= 2 * 1024**2 and total <= 20 * 1024**2, "ARCHIVE_SIZE")
            contents[name] = archive.extractfile(member).read()
    require("release-manifest.json" in contents, "MANIFEST_MISSING")
    manifest = json.loads(contents["release-manifest.json"])
    require(manifest.get("schemaVersion") == 1 and re.fullmatch(r"[a-f0-9]{40}", manifest.get("sourceSha", "")), "MANIFEST_SOURCE")
    require(isinstance(manifest.get("files"), dict), "MANIFEST_FILES")
    require(set(contents) == set(manifest["files"]) | {"release-manifest.json"}, "ARCHIVE_MATERIAL_SET")
    for name, expected in manifest["files"].items():
        require(hashlib.sha256(contents[name]).hexdigest() == expected, "ARCHIVE_MATERIAL_DIGEST")
    for role in ("api", "worker"):
        require(re.fullmatch(r"ghcr\.io/yubiefood-id/yubie-" + role + r"@sha256:[a-f0-9]{64}", manifest.get(role + "Image", "")), "MANIFEST_IMAGE")
    require({"scripts/production/release_runner.py", "scripts/production/release_policy.py", "scripts/production/schema_checks.sql", "scripts/production/install_release.py", "infrastructure/docker-compose.prod.yml"} <= contents.keys(), "INSTALLER_MATERIAL_MISSING")
    return manifest, contents


def wrapper_source(sha, digest, files):
    require(re.fullmatch(r"[a-f0-9]{40}", sha) and re.fullmatch(r"[a-f0-9]{64}", digest), "WRAPPER_IDENTITY")
    return '''#!/usr/bin/python3 -I
import hashlib,os,pathlib,stat,sys
if len(sys.argv)!=1:raise SystemExit(64)
if os.geteuid()!=0:raise SystemExit(77)
root=pathlib.Path("/opt/yubie/releases/''' + sha + '''")
def read(path):
 current=path
 while True:
  info=current.lstat()
  if stat.S_ISLNK(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise SystemExit(77)
  if current==pathlib.Path("/"):break
  current=current.parent
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,"rb") as stream:
  info=os.fstat(stream.fileno())
  if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:raise SystemExit(77)
  return stream.read()
if hashlib.sha256(read(root/"release-manifest.json")).hexdigest()!=''' + repr(digest) + ''':raise SystemExit(77)
for name,digest in ''' + repr(files) + '''.items():
 if hashlib.sha256(read(root/name)).hexdigest()!=digest:raise SystemExit(77)
os.execve("/usr/bin/python3",["python3","-I","-B",str(root/"scripts/production/release_runner.py"),str(root/"release-manifest.json"),''' + repr(digest) + '''],{"PATH":"/usr/sbin:/usr/bin:/sbin:/bin","LANG":"C.UTF-8"})
'''


def write_immutable(path, content, mode):
    trusted(path.parent)
    if path.exists():
        trusted(path)
        require(path.is_file() and path.stat().st_nlink == 1 and path.read_bytes() == content, "IMMUTABLE_RELEASE_EXISTS")
        os.chmod(path, mode)
        return
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, "wb") as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


def install(bundle, digest):
    require(os.geteuid() == 0, "INTERACTIVE_OPERATOR_ROOT_REQUIRED")
    trusted(bundle)
    require(bundle.is_file() and bundle.stat().st_nlink == 1 and not bundle.stat().st_mode & 0o077, "PRIVATE_BUNDLE_REQUIRED")
    manifest, contents = verify_archive(bundle, digest)
    root_directory(STATE, 0o700)
    write_immutable(STATE / "deployment.lock", b"", 0o600)
    fd = os.open(STATE / "deployment.lock", os.O_RDWR | os.O_NOFOLLOW)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise InstallBlocked("DEPLOYMENT_BUSY") from None
        return _install_materials(manifest, contents)
    finally:
        os.close(fd)


def _install_materials(manifest, contents):
    sha = manifest["sourceSha"]
    for directory, mode in ((STATE, 0o700), (BACKUPS, 0o700), (pathlib.Path("/opt/yubie/releases"), 0o755), (pathlib.Path("/etc/yubie/registry"), 0o700)):
        root_directory(directory, mode)
    source = pathlib.Path("/opt/yubie/releases") / sha
    root_directory(source, 0o755)
    for name, content in contents.items():
        path = source / name
        missing = []
        parent = path.parent
        while parent != source:
            missing.append(parent)
            parent = parent.parent
        for directory in reversed(missing):
            root_directory(directory, 0o755)
        write_immutable(path, content, 0o444)
    operation = STATE / sha
    root_directory(operation, 0o700)
    write_immutable(STATE / "deployment.lock", b"", 0o600)
    # Freeze only the Yubie production directory. Preserve Compose bytes using a
    # new root-owned inode, so an old user write descriptor cannot alter it later.
    trusted(PRODUCTION.parent)
    info = PRODUCTION.lstat()
    deploy_uid = pwd.getpwnam("yubie-deploy").pw_uid
    require(stat.S_ISDIR(info.st_mode) and info.st_uid in (0, deploy_uid), "PRODUCTION_DIRECTORY")
    os.chown(PRODUCTION, 0, 0)
    os.chmod(PRODUCTION, 0o755)
    compose = PRODUCTION / "docker-compose.prod.yml"
    fd = os.open(compose, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid in (0, deploy_uid) and info.st_nlink == 1, "PRODUCTION_COMPOSE")
        previous = stream.read()
    require(hashlib.sha256(previous).hexdigest() in manifest["acceptedPriorComposeSha256"], "PRODUCTION_COMPOSE_NOT_REVIEWED")
    temporary_fd, temporary = tempfile.mkstemp(dir=PRODUCTION)
    with os.fdopen(temporary_fd, "wb") as stream:
        os.fchmod(stream.fileno(), 0o444)
        stream.write(previous)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, compose)
    require(hashlib.sha256(compose.read_bytes()).digest() == hashlib.sha256(previous).digest(), "COMPOSE_PRESERVATION")
    manifest_digest = hashlib.sha256(contents["release-manifest.json"]).hexdigest()
    wrapper = pathlib.Path("/usr/local/sbin") / ("yubie-release-" + sha)
    write_immutable(wrapper, wrapper_source(sha, manifest_digest, manifest["files"]).encode(), 0o555)
    rule = ("Defaults!" + str(wrapper) + " env_reset\nDefaults!" + str(wrapper) + ' secure_path="/usr/sbin:/usr/bin:/sbin:/bin"\n'
            + "yubie-deploy ALL=(root) NOPASSWD: NOSETENV: " + str(wrapper) + ' ""\n').encode()
    sudoers = pathlib.Path("/etc/sudoers.d") / ("yubie-release-" + sha)
    trusted(sudoers.parent)
    fd, temporary = tempfile.mkstemp(prefix=".yubie-", dir=sudoers.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), 0o440)
            stream.write(rule)
            stream.flush()
            os.fsync(stream.fileno())
        subprocess.run(["/usr/sbin/visudo", "-cf", temporary], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        write_immutable(sudoers, rule, 0o440)
        subprocess.run(["/usr/sbin/visudo", "-c"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        if sudoers.exists() and sudoers.read_bytes() == rule:
            sudoers.unlink()
        raise InstallBlocked("SUDOERS_VALIDATION_FAILED") from None
    finally:
        os.unlink(temporary)
    template = {"manifestSha256": manifest_digest, "action": "backend_disabled_release", "approvedBy": "REQUIRED", "approvalRef": "REQUIRED", "notBefore": "REQUIRED_UTC", "expiresAt": "REQUIRED_UTC_WITHIN_ONE_HOUR", "expectedApiImageId": "REQUIRED_FROM_PREFLIGHT", "expectedWorkerImageId": "REQUIRED_FROM_PREFLIGHT", "expectedProvider": "REQUIRED_FROM_PREFLIGHT"}
    write_immutable(operation / "authorization-template.json", (json.dumps(template, indent=2) + "\n").encode(), 0o600)
    return {"result": "WRAPPER_INSTALLED_NO_DEPLOYMENT_AUTHORIZATION", "sourceSha": sha, "manifestSha256": manifest_digest,
            "wrapper": str(wrapper), "productionComposeBytesPreserved": True, "sudoersValidated": True,
            "operatorNext": "Run wrapper preflight; verify registry access and report. Only then create root-private authorization.json after release approval.",
            "existingInteractiveSudoMembership": "unchanged; review separately"}


if __name__ == "__main__":
    os.umask(0o077)
    try:
        require(len(sys.argv) == 3, "BUNDLE_AND_PUBLISHED_DIGEST_REQUIRED")
        print(json.dumps(install(pathlib.Path(sys.argv[1]), sys.argv[2]), indent=2))
    except (InstallBlocked, OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"result": "BLOCKED", "code": str(error) if isinstance(error, InstallBlocked) else type(error).__name__}))
        raise SystemExit(77)
