#!/usr/bin/env bash
# Run on the existing production VPS with approved privileged execution.
# This script cannot enable checkout or switch the configured payment provider.
set -euo pipefail
umask 077
release_sha="${1:-}"
api_image="${2:-}"
worker_image="${3:-}"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "A reviewed full commit SHA is required" >&2; exit 64; }
[[ "$api_image" =~ ^ghcr\.io/yubiefood-id/yubie-api@sha256:[0-9a-f]{64}$ ]] || { echo "Pinned API digest required" >&2; exit 64; }
[[ "$worker_image" =~ ^ghcr\.io/yubiefood-id/yubie-worker@sha256:[0-9a-f]{64}$ ]] || { echo "Pinned worker digest required" >&2; exit 64; }
[[ "$EUID" == 0 ]] || { echo "Approved privileged VPS execution is required" >&2; exit 77; }
reviewed_compose="${4:?Provide the reviewed production compose artifact}"
env_file=/etc/yubie/production.env
compose_file=/opt/yubie/production/docker-compose.prod.yml
[[ -r "$env_file" && -r "$compose_file" && -r "$reviewed_compose" ]] || exit 66
DC=(docker compose --env-file "$env_file" -p yubie-prod -f "$compose_file")
provider=$(python3 - "$env_file" <<'PY'
import sys
values={}
for line in open(sys.argv[1]):
 if "=" in line and not line.lstrip().startswith("#"):
  key,value=line.strip().split("=",1);values[key]=value.strip("\"'")
if values.get("YUBIE_ENV")!="production" or values.get("YUBIE_CHECKOUT_ADMISSION")!="disabled":
 raise SystemExit("Production and disabled admission must already be configured")
provider=values.get("COMMERCE_PROVIDER","")
if provider not in ["preview","ipaymu","xendit"]:raise SystemExit("Unexpected provider configuration")
print(provider)
PY
)
pg_id=$("${DC[@]}" ps -q postgres)
[[ "$pg_id" =~ ^[a-f0-9]{12,64}$ ]] || { echo "Existing production PostgreSQL not found" >&2; exit 69; }
if [[ "$provider" == preview ]]; then
  unresolved=$(docker exec "$pg_id" sh -c 'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB" -c "SELECT count(*) FROM order_payments WHERE provider IN ('"'"'ipaymu'"'"','"'"'xendit'"'"') AND (status='"'"'pending'"'"' OR reconciliation_state IS NOT NULL)"')
  [[ "$unresolved" == 0 ]] || { echo "Real-provider records require incident reconciliation before this preview release" >&2; exit 70; }
fi
for image in "$api_image" "$worker_image"; do
  docker pull "$image"
  actual=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image")
  [[ "$actual" == "$release_sha" ]] || { echo "Image revision does not match the reviewed SHA" >&2; exit 65; }
done
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="/opt/yubie/backups/commerce-$stamp"
mkdir -m 700 "$backup_dir"
cp -p "$env_file" "$backup_dir/production.env"
cp -p "$compose_file" "$backup_dir/docker-compose.prod.yml"
docker inspect --format '{{.Name}} {{.Image}}' $("${DC[@]}" ps -q api worker) > "$backup_dir/prior-images.txt"
docker exec "$pg_id" sh -c 'exec pg_dump --format=custom --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup_dir/postgres.dump"
sha256sum "$backup_dir/postgres.dump" > "$backup_dir/postgres.dump.sha256"
scratch="yubie_restore_$(date +%s)"
docker exec "$pg_id" sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$scratch"
docker exec -i "$pg_id" sh -c 'pg_restore --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$1"' sh "$scratch" < "$backup_dir/postgres.dump"
restored=$(docker exec "$pg_id" sh -c 'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$1" -c "SELECT count(*) FROM schema_migrations"' sh "$scratch")
[[ "$restored" -ge 22 ]] || { echo "Restore drill schema evidence is incomplete" >&2; exit 70; }
negative=$(docker exec "$pg_id" sh -c 'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$1" -c "SELECT count(*) FROM inventory_lots WHERE quantity_on_hand<0"' sh "$scratch")
[[ "$negative" == 0 ]] || { echo "Restore drill found invalid inventory" >&2; exit 70; }
docker exec "$pg_id" sh -c 'dropdb -U "$POSTGRES_USER" "$1"' sh "$scratch"
python3 - "$env_file" "$release_sha" "$api_image" "$worker_image" <<'PY'
import sys,os,tempfile
path,sha,api,worker=sys.argv[1:]
updates={"RELEASE_SHA":sha,"YUBIE_API_IMAGE":api,"YUBIE_WORKER_IMAGE":worker,"YUBIE_CHECKOUT_ADMISSION":"disabled"}
lines=[]
for line in open(path):
 key=line.split("=",1)[0].strip()
 if key in updates:lines.append(key+"="+updates.pop(key)+"\n")
 else:lines.append(line)
lines.extend(k+"="+v+"\n" for k,v in updates.items())
fd,tmp=tempfile.mkstemp(dir=os.path.dirname(path))
with os.fdopen(fd,"w") as f:f.writelines(lines);f.flush();os.fsync(f.fileno())
os.chmod(tmp,0o600);os.replace(tmp,path)
PY
install -m 644 "$reviewed_compose" "$compose_file"
"${DC[@]}" config --quiet
"${DC[@]}" run --rm --no-deps migrate
"${DC[@]}" up -d --no-deps api worker
health=$(curl --fail --silent --show-error --retry 12 --retry-delay 2 --retry-connrefused http://127.0.0.1:18788/healthz)
python3 - "$release_sha" "$health" <<'PY'
import sys,json
assert json.loads(sys.argv[2]).get("releaseSha")==sys.argv[1],"Backend SHA mismatch"
PY
curl --fail --silent --show-error http://127.0.0.1:18788/readyz
api_id=$("${DC[@]}" ps -q api)
docker exec "$api_id" node --input-type=module -e '
const headers={"x-api-proxy-token":process.env.API_PROXY_TOKEN,"content-type":"application/json"};
const frozen=await fetch("http://127.0.0.1:8787/v1/checkouts",{method:"POST",headers,body:"{}"});
if(frozen.status!==503||(await frozen.json()).code!=="CHECKOUT_DISABLED")throw new Error("Admission freeze failed");
const available=await fetch("http://127.0.0.1:8787/v1/catalog/availability",{headers});
const body=await available.json();if(!available.ok||body.data?.length!==9)throw new Error("Availability read model failed");
console.log(JSON.stringify({event:"production.commerce_frozen_smoke",releaseSha:process.env.RELEASE_SHA,variants:body.data.length}));
'
worker_id=$("${DC[@]}" ps -q worker)
[[ "$(docker inspect --format '{{.State.Running}}' "$worker_id")" == true ]] || exit 70
printf '\nBackend deployed with admission disabled. Restore evidence: %s\n' "$backup_dir"
