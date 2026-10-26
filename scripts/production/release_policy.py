"""Safety rules for a pinned host release; no provider credentials live here."""
import contextlib
import datetime
import fcntl
import hashlib
import os
import pathlib
import re
import stat


class Blocked(Exception):
    """A release invariant failed; callers must stop rollout."""


SCHEMA_CHECKS = {
    "skuPolicies", "lotApprovalColumns", "fulfillmentHold", "onboardingSnapshot",
    "shippingApprovals", "appendOnlyTrigger", "notificationInbox",
    "notificationDueIndex", "recoveryForeignKey", "recoveryIndex",
}


def require(condition, code):
    if not condition:
        raise Blocked(code)


def validate_manifest(data):
    require(data.get("schemaVersion") == 1, "MANIFEST_VERSION")
    require(re.fullmatch(r"[a-f0-9]{40}", data.get("sourceSha", "")), "SOURCE_SHA")
    for role in ("api", "worker"):
        require(re.fullmatch(r"ghcr\.io/yubiefood-id/yubie-" + role + r"@sha256:[a-f0-9]{64}", data.get(role + "Image", "")), "IMAGE_DIGEST")
    files = data.get("files")
    require(isinstance(files, dict) and {
        "scripts/production/release_runner.py", "scripts/production/release_policy.py",
        "infrastructure/docker-compose.prod.yml",
    } <= files.keys(), "MANIFEST_FILES")
    for name, digest in files.items():
        path = pathlib.PurePosixPath(name)
        require(not path.is_absolute() and ".." not in path.parts and str(path) == name, "MATERIAL_PATH")
        require(re.fullmatch(r"[a-f0-9]{64}", digest), "MATERIAL_DIGEST")
    migrations = data.get("migrations")
    require(isinstance(migrations, list) and migrations == sorted(set(migrations)), "MIGRATION_SET")
    require(all(re.fullmatch(r"[0-9]{4}_[a-z0-9_]+\.sql", version) for version in migrations), "MIGRATION_NAME")
    require({"0023_inventory_approvals.sql", "0024_payment_notification_inbox.sql", "0025_checkout_recovery_binding.sql"} <= set(migrations), "MIGRATION_TARGET")


def check_trusted_path(path, uid=0, boundary=pathlib.Path("/")):
    path, boundary = pathlib.Path(path), pathlib.Path(boundary)
    require(path.is_absolute() and boundary.is_absolute() and ".." not in path.parts, "TRUSTED_PATH")
    require(path == boundary or boundary in path.parents, "TRUSTED_BOUNDARY")
    current = path
    while True:
        info = current.lstat()
        require(not stat.S_ISLNK(info.st_mode), "SYMLINK")
        require(info.st_uid == uid and not info.st_mode & 0o022, "WRITABLE_OR_FOREIGN_PATH")
        if current != path:
            require(stat.S_ISDIR(info.st_mode), "PARENT_NOT_DIRECTORY")
        if current == boundary:
            return
        current = current.parent


def read_trusted(path, digest=None, uid=0, boundary=pathlib.Path("/")):
    check_trusted_path(path, uid, boundary)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == uid and not info.st_mode & 0o022, "UNTRUSTED_FILE")
        content = stream.read()
    if digest is not None:
        require(hashlib.sha256(content).hexdigest() == digest, "MATERIAL_CHANGED")
    return content


def validate_authorization(auth, digest, now):
    require(auth.get("manifestSha256") == digest and auth.get("action") == "backend_disabled_release", "AUTHORIZATION_BINDING")
    require(all(isinstance(auth.get(key), str) and auth[key].strip() and not auth[key].upper().startswith(("REQUIRED", "UNSET", "TODO")) for key in ("approvedBy", "approvalRef")), "AUTHORIZATION_OWNER")
    try:
        start = datetime.datetime.fromisoformat(auth["notBefore"].replace("Z", "+00:00"))
        end = datetime.datetime.fromisoformat(auth["expiresAt"].replace("Z", "+00:00"))
        require(start.tzinfo is not None and end.tzinfo is not None and start <= now < end and end - start <= datetime.timedelta(hours=1), "AUTHORIZATION_WINDOW")
    except (KeyError, ValueError, TypeError):
        raise Blocked("AUTHORIZATION_WINDOW") from None


def validate_schema(expected, actual, checks):
    require(sorted(actual) == sorted(expected), "EXACT_MIGRATIONS_REQUIRED")
    require(SCHEMA_CHECKS <= checks.keys() and all(checks[key] is True for key in SCHEMA_CHECKS), "SCHEMA_OBJECTS_REQUIRED")


def render_compose(template, manifest):
    value = template.decode("utf-8")
    for expression, replacement in {
        "${YUBIE_API_IMAGE:-ghcr.io/yubiefood-id/yubie-api:${RELEASE_SHA}}": manifest["apiImage"],
        "${YUBIE_WORKER_IMAGE:-ghcr.io/yubiefood-id/yubie-worker:${RELEASE_SHA}}": manifest["workerImage"],
        "${RELEASE_SHA}": manifest["sourceSha"],
    }.items():
        require(expression in value, "COMPOSE_TEMPLATE_CHANGED")
        value = value.replace(expression, replacement)
    return value.encode("utf-8")


def validate_compose(config, manifest):
    require(config.get("name") == "yubie-prod", "COMPOSE_PROJECT")
    services = config.get("services", {})
    core = {"postgres", "migrate", "api", "worker"}
    require(core <= services.keys() and services.keys() <= core | {"bot"}, "COMPOSE_SERVICES")
    api, worker = services["api"], services["worker"]
    require(api.get("image") == manifest["apiImage"] and worker.get("image") == manifest["workerImage"] and services["migrate"].get("image") == manifest["apiImage"], "EFFECTIVE_IMAGE")
    for service in (api, worker):
        env = service.get("environment", {})
        require(env.get("RELEASE_SHA") == manifest["sourceSha"] and env.get("YUBIE_ENV") == "production" and env.get("YUBIE_LAUNCH_PROFILE") == "DIRECT_COMMERCE_PRODUCTION", "EFFECTIVE_SOURCE_ENV")
        require(not service.get("privileged") and not service.get("volumes") and not service.get("network_mode") and not service.get("pid"), "COMPOSE_PRIVILEGES")
    env = api.get("environment", {})
    require(env.get("YUBIE_CHECKOUT_ADMISSION") == "disabled", "ADMISSION_NOT_FROZEN")
    require(env.get("INVENTORY_MODE") == "lots" and env.get("PURCHASE_OPTIONS_SOURCE") == "database" and env.get("APP_ORIGIN") == "https://yubiefood.com", "COMMERCE_CONFIGURATION")
    provider = env.get("COMMERCE_PROVIDER")
    require(provider in ("preview", "ipaymu", "xendit") and worker["environment"].get("COMMERCE_PROVIDER") == provider, "PROVIDER_MISMATCH")
    require(worker["environment"].get("SUPPORT_PROVIDER") == "disabled", "SUPPORT_MUST_STAY_DISABLED")
    require(not worker.get("ports") and not services["postgres"].get("ports"), "EXPOSED_INTERNAL_SERVICE")
    ports = api.get("ports", [])
    require(len(ports) == 1 and ports[0].get("host_ip") == "127.0.0.1" and str(ports[0].get("published")) == "18788" and ports[0].get("target") == 8787, "API_LOOPBACK_BINDING")
    require(services["migrate"].get("healthcheck", {}).get("disable") is True, "MIGRATE_HTTP_PROBE")
    require("bot" not in services or services["bot"].get("profiles") == ["bot"], "BOT_PROFILE")
    return provider


def journal_decision(journal, digest):
    if journal is None:
        return "preflight"
    require(journal.get("manifestSha256") == digest, "JOURNAL_IDENTITY")
    if journal.get("stage") == "complete":
        return "verify"
    require(journal.get("stage") == "preflight", "PARTIAL_RELEASE_REQUIRES_REVIEW")
    return "preflight"


@contextlib.contextmanager
def deployment_lock(path, uid=0, boundary=pathlib.Path("/")):
    check_trusted_path(pathlib.Path(path).parent, uid, boundary)
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(info.st_uid == uid and stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and not info.st_mode & 0o077, "LOCK_OWNERSHIP")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Blocked("DEPLOYMENT_BUSY") from None
        yield
    finally:
        os.close(fd)
