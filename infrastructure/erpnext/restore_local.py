"""Full LOCAL backup/restore into a NEW synthetic site, never an existing one.

Argument: ~/.local/state/yubie/erp-native/YYYYMMDD/local.env (mode0600).
"""
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys

path = Path(sys.argv[1]).resolve()
assert path.parent.parent == Path.home() / ".local/state/yubie/erp-native"
assert re.fullmatch(r"\d{8}", path.parent.name) and path.name == "local.env"
assert stat.S_IMODE(path.stat().st_mode) == 0o600
assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700
assert os.environ.get("DOCKER_HOST", "unix:///var/run/docker.sock") == "unix:///var/run/docker.sock"
context = json.loads(subprocess.check_output(["docker", "context", "inspect"]))[0]
assert context["Endpoints"]["docker"]["Host"] == "unix:///var/run/docker.sock"
project = f"yubie-erp-native-{path.parent.name}"
container = f"{project}-backend-1"
labels = json.loads(subprocess.check_output(["docker", "inspect", container]))[0]["Config"]["Labels"]
assert labels["com.docker.compose.project"] == project
values = dict(line.split("=", 1) for line in path.read_text().splitlines() if "=" in line)
script = r'''
import json, pathlib, secrets, subprocess
root_password = ROOT_PASSWORD
admin_password = ADMIN_PASSWORD
source = 'erp.yubie.test'
target = 'erp.restore-' + secrets.token_hex(4) + '.yubie.test'
assert not pathlib.Path('sites', target).exists(), 'Refusing to overwrite an existing site'
def step(label, args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        print('LOCAL_RESTORE_FAILED', label, result.returncode)
        raise SystemExit(result.returncode)
step('backup', ['bench', '--site', source, 'backup', '--with-files'])
directory = pathlib.Path('sites', source, 'private', 'backups')
backup = sorted(directory.glob('*-database.sql.gz'))[-1]
prefix = backup.name.removesuffix('-database.sql.gz')
config = json.loads((directory / (prefix + '-site_config_backup.json')).read_text())
step('new-site', ['bench', 'new-site', target, '--db-root-password', root_password, '--admin-password', admin_password, '--mariadb-user-host-login-scope', '%'])
args = ['bench', '--site', target, 'restore', str(backup.resolve()), '--db-root-password', root_password, '--with-public-files', str((directory / (prefix + '-files.tar')).resolve()), '--with-private-files', str((directory / (prefix + '-private-files.tar')).resolve())]
if config.get('backup_encryption_key'):
    args += ['--encryption-key', config['backup_encryption_key']]
step('restore', args)
# Application encryption is separate from backup encryption. Preserve the NEW
# database identity; never copy a source site's database login over the clone.
if config.get('encryption_key'):
    target_config = pathlib.Path('sites', target, 'site_config.json')
    restored = json.loads(target_config.read_text())
    restored['encryption_key'] = config['encryption_key']
    target_config.write_text(json.dumps(restored))
    target_config.chmod(0o600)
step('assertions', ['bench', '--site', target, 'execute', "exec(open('/tmp/yubie_native_acceptance.py').read(), {})"])
print('LOCAL_FULL_BACKUP_RESTORE_PASS: new database, public/private files, encrypted credential and native workflows verified; not off-host or production acceptance')
'''.replace("ROOT_PASSWORD", repr(values["ERP_DB_ROOT_PASSWORD"])).replace("ADMIN_PASSWORD", repr(secrets.token_urlsafe(32)))
result = subprocess.run(["docker", "exec", "-i", container, "python", "-"], input=script, text=True, capture_output=True)
if result.returncode:
    print("LOCAL_RESTORE_FAILED: private setup diagnostics required; credentials redacted")
    for line in result.stdout.splitlines():
        if line.startswith("LOCAL_RESTORE_FAILED "):
            print(line)
else:
    print(result.stdout.strip())
raise SystemExit(result.returncode)
