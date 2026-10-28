import importlib.util, json, os, pathlib, tempfile, unittest, hashlib, datetime, subprocess, sys
MODULE=pathlib.Path(__file__).parents[1]/"production"/"release_policy.py"
policy=None
if MODULE.exists():
 spec=importlib.util.spec_from_file_location("release_policy",MODULE);policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)

def fixture():
 return {"schemaVersion":1,"sourceSha":"a"*40,"apiImage":"ghcr.io/yubiefood-id/yubie-api@sha256:"+"b"*64,"workerImage":"ghcr.io/yubiefood-id/yubie-worker@sha256:"+"c"*64,"files":{"scripts/production/release_runner.py":"d"*64,"scripts/production/release_policy.py":"e"*64,"infrastructure/docker-compose.prod.yml":"f"*64},"migrations":["0001_initial.sql","0023_inventory_approvals.sql","0024_payment_notification_inbox.sql","0025_checkout_recovery_binding.sql"]}

class ReleasePolicy(unittest.TestCase):
 def setUp(self):self.assertIsNotNone(policy,"restricted release policy has not been implemented")
 def test_manifest_rejects_mutable_images_cross_registry_and_path_escape(self):
  policy.validate_manifest(fixture())
  for key,value in [("sourceSha","main"),("apiImage","ghcr.io/yubiefood-id/yubie-api:latest"),("workerImage","ghcr.io/another/worker@sha256:"+"c"*64)]:
   data=fixture();data[key]=value
   with self.assertRaises(policy.Blocked):policy.validate_manifest(data)
  data=fixture();data["files"]["../outside"]="f"*64
  with self.assertRaises(policy.Blocked):policy.validate_manifest(data)
 def test_database_target_is_local_and_matches_the_backed_up_database(self):
  valid="postgresql://yubie:synthetic@postgres:5432/yubie_test"
  policy.validate_database_target(valid,"yubie_test")
  for url in [valid.replace("@postgres:","@other:"),valid.replace("/yubie_test","/zammad"),valid+"?host=other",valid+"#fragment",valid.replace(":5432/",":5433/"),"not-a-url",None]:
   with self.assertRaisesRegex(policy.Blocked,"^DATABASE_TARGET_MISMATCH$"):policy.validate_database_target(url,"yubie_test")
 def test_running_database_binding_cannot_change_during_release(self):
  desired={"DATABASE_URL":"postgresql://yubie:synthetic@postgres/yubie_test"}
  current=dict(desired)
  policy.validate_database_binding(current,desired,"yubie_test")
  for other in [{"DATABASE_URL":"postgresql://yubie:synthetic@elsewhere/yubie_test"},{"DATABASE_URL":"postgresql://other:synthetic@postgres/yubie_test"}]:
   with self.assertRaises(policy.Blocked):policy.validate_database_binding(other,desired,"yubie_test")
 def test_writable_directory_symlinks_and_changed_bytes_are_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);root.chmod(0o700);folder=root/"release";folder.mkdir(mode=0o755);p=folder/"manifest.json";p.write_bytes(b"approved");p.chmod(0o444)
   digest=hashlib.sha256(b"approved").hexdigest()
   self.assertEqual(policy.read_trusted(p,digest,uid=os.getuid(),boundary=root),b"approved")
   folder.chmod(0o777)
   with self.assertRaises(policy.Blocked):policy.read_trusted(p,digest,uid=os.getuid(),boundary=root)
   folder.chmod(0o755);link=folder/"alias";link.symlink_to(p)
   with self.assertRaises(policy.Blocked):policy.read_trusted(link,digest,uid=os.getuid(),boundary=root)
   p.chmod(0o644);p.write_bytes(b"tampered")
   with self.assertRaises(policy.Blocked):policy.read_trusted(p,digest,uid=os.getuid(),boundary=root)
 def test_authorization_is_bound_to_manifest_action_window_and_owner_reference(self):
  now=datetime.datetime(2026,10,26,12,tzinfo=datetime.timezone.utc)
  auth={"manifestSha256":"1"*64,"action":"backend_disabled_release","approvedBy":"operator","approvalRef":"change-53","notBefore":"2026-10-26T11:59:00Z","expiresAt":"2026-10-26T12:30:00Z"}
  policy.validate_authorization(auth,"1"*64,now)
  for key,value in [("manifestSha256","2"*64),("action","enable_payments"),("approvalRef",""),("approvalRef","REQUIRED"),("expiresAt","2026-10-26T11:00:00Z")]:
   other={**auth,key:value}
   with self.assertRaises(policy.Blocked):policy.validate_authorization(other,"1"*64,now)
 def test_post_upgrade_requires_exact_versions_and_schema_checks(self):
  wanted=fixture()["migrations"];checks={"skuPolicies":True,"lotApprovalColumns":True,"fulfillmentHold":True,"onboardingSnapshot":True,"shippingApprovals":True,"appendOnlyTrigger":True,"notificationInbox":True,"notificationDueIndex":True,"recoveryForeignKey":True,"recoveryIndex":True}
  policy.validate_schema(wanted,wanted,checks)
  with self.assertRaises(policy.Blocked):policy.validate_schema(wanted,wanted[:-1],checks)
  with self.assertRaises(policy.Blocked):policy.validate_schema(wanted,wanted+["0026_unreviewed.sql"],checks)
  with self.assertRaises(policy.Blocked):policy.validate_schema(wanted,wanted,{**checks,"recoveryForeignKey":False})
 def test_journal_allows_completed_verification_but_blocks_partial_mutation(self):
  self.assertEqual(policy.journal_decision(None,"a"),"preflight")
  self.assertEqual(policy.journal_decision({"manifestSha256":"a","stage":"complete"},"a"),"verify")
  self.assertEqual(policy.journal_decision({"manifestSha256":"a","stage":"preflight"},"a"),"preflight")
  for stage in ["migration_started","worker_started","api_started","failed"]:
   with self.assertRaises(policy.Blocked):policy.journal_decision({"manifestSha256":"a","stage":stage},"a")
 def test_operations_schema_cannot_be_accepted_from_migration_history_alone(self):
  wanted=fixture()["migrations"]+["0026_operations_workflows.sql"]
  checks={name:True for name in policy.SCHEMA_CHECKS}
  with self.assertRaises(policy.Blocked):policy.validate_schema(wanted,wanted,checks)
 def test_operations_upgrade_accepts_reviewed_0025_baseline_but_not_partial_upgrade(self):
  expected=[f'{i:04d}_migration.sql' for i in range(1,27)]
  policy.validate_migration_baseline(expected[:25],expected)
  with self.assertRaises(policy.Blocked):policy.validate_migration_baseline(expected[:24],expected)
 def test_rendered_compose_uses_literal_reviewed_images_and_source(self):
  self.assertTrue(hasattr(policy,"render_compose"),"safe compose renderer is missing")
  template=b'image: ${YUBIE_API_IMAGE:-ghcr.io/yubiefood-id/yubie-api:${RELEASE_SHA}}\nworker: ${YUBIE_WORKER_IMAGE:-ghcr.io/yubiefood-id/yubie-worker:${RELEASE_SHA}}\nsha: ${RELEASE_SHA}\n'
  value=policy.render_compose(template,fixture())
  self.assertIn(b'ghcr.io/yubiefood-id/yubie-api@sha256:'+b'b'*64,value)
  self.assertIn(b'sha: '+b'a'*40,value)
  self.assertNotIn(b'YUBIE_API_IMAGE',value)
  with self.assertRaises(policy.Blocked):policy.render_compose(b'image: latest',fixture())
 def test_effective_config_rejects_enabled_admission_or_other_project(self):
  self.assertTrue(hasattr(policy,"validate_compose"),"effective compose safety check is missing")
  data=fixture();api={"image":data["apiImage"],"environment":{"RELEASE_SHA":"a"*40,"YUBIE_ENV":"production","YUBIE_LAUNCH_PROFILE":"DIRECT_COMMERCE_PRODUCTION","YUBIE_CHECKOUT_ADMISSION":"disabled","COMMERCE_PROVIDER":"preview","INVENTORY_MODE":"lots","PURCHASE_OPTIONS_SOURCE":"database","APP_ORIGIN":"https://yubiefood.com"},"ports":[{"host_ip":"127.0.0.1","published":"18788","target":8787}]}
  worker={"image":data["workerImage"],"environment":{"RELEASE_SHA":"a"*40,"YUBIE_ENV":"production","YUBIE_LAUNCH_PROFILE":"DIRECT_COMMERCE_PRODUCTION","COMMERCE_PROVIDER":"preview","SUPPORT_PROVIDER":"disabled"}}
  config={"name":"yubie-prod","services":{"api":api,"worker":worker,"migrate":{"image":data["apiImage"],"healthcheck":{"disable":True}},"postgres":{"image":"postgres:17-alpine"},"bot":{"profiles":["bot"]}}}
  for name in ("api","worker","migrate"):
   config["services"][name].setdefault("environment",{})["DATABASE_URL"]="postgresql://yubie:synthetic@postgres/yubie_test"
  config["services"]["postgres"]["environment"]={"POSTGRES_DB":"yubie_test"}
  self.assertEqual(policy.validate_compose(config,data),"preview")
  config["services"]["migrate"]["environment"]["DATABASE_URL"]="postgresql://yubie:synthetic@postgres/zammad"
  with self.assertRaises(policy.Blocked):policy.validate_compose(config,data)
  config["services"]["migrate"]["environment"]["DATABASE_URL"]=api["environment"]["DATABASE_URL"]
  for changed in [dict(config,name="retropick"),dict(config,services={**config["services"],"unreviewed":{}})]:
   with self.assertRaises(policy.Blocked):policy.validate_compose(changed,data)
  api["environment"]["YUBIE_LAUNCH_PROFILE"]="PUBLIC_CATALOG_NO_SALES"
  with self.assertRaises(policy.Blocked):policy.validate_compose(config,data)
  api["environment"]["YUBIE_LAUNCH_PROFILE"]="DIRECT_COMMERCE_PRODUCTION"
  api["environment"]["YUBIE_CHECKOUT_ADMISSION"]="enabled"
  with self.assertRaises(policy.Blocked):policy.validate_compose(config,data)
 def test_shared_staging_template_still_resolves_and_production_is_digest_pinned(self):
  template=pathlib.Path(__file__).parents[2]/"infrastructure/docker-compose.prod.yml"
  with tempfile.TemporaryDirectory() as d:
   folder=pathlib.Path(d);env=folder/"fixture.env";env.write_text("POSTGRES_USER=yubie\nPOSTGRES_PASSWORD=synthetic\nPOSTGRES_DB=yubie_test\nDATABASE_URL=postgresql://yubie:synthetic@postgres/yubie_test\nRELEASE_SHA="+"9"*40+"\nYUBIE_ENV=production\nYUBIE_LAUNCH_PROFILE=DIRECT_COMMERCE_PRODUCTION\nYUBIE_CHECKOUT_ADMISSION=disabled\nSUPPORT_PROVIDER=disabled\nAPP_ORIGIN=https://yubiefood.com\n")
   def resolve(path):return subprocess.run(["docker","compose","--env-file",str(env),"-p","yubie-prod","-f",str(path),"config","--format","json"],capture_output=True,text=True,env={"PATH":os.environ["PATH"],"LANG":"C.UTF-8"})
   staging=resolve(template)
   self.assertEqual(staging.returncode,0,staging.stderr)
   self.assertEqual(json.loads(staging.stdout)["services"]["api"]["image"],"ghcr.io/yubiefood-id/yubie-api:"+"9"*40)
   frozen=folder/"compose.yml";frozen.write_bytes(policy.render_compose(template.read_bytes(),fixture()))
   production=resolve(frozen);self.assertEqual(production.returncode,0,production.stderr)
   data=json.loads(production.stdout);self.assertEqual(policy.validate_compose(data,fixture()),"preview")
   self.assertEqual(data["services"]["migrate"]["image"],"ghcr.io/yubiefood-id/yubie-api@sha256:"+"b"*64)
 def test_second_process_cannot_take_deployment_lock(self):
  with tempfile.TemporaryDirectory() as d:
   path=pathlib.Path(d)/"deployment.lock"
   child="import runpy,pathlib,os,sys; p=runpy.run_path(sys.argv[1]); lock=p['deployment_lock'];\ntry:\n with lock(pathlib.Path(sys.argv[2]),uid=os.getuid(),boundary=pathlib.Path(sys.argv[3])):pass\nexcept p['Blocked']:raise SystemExit(77)"
   with policy.deployment_lock(path,uid=os.getuid(),boundary=pathlib.Path(d)):
    result=subprocess.run([sys.executable,"-c",child,str(MODULE),str(path),d],capture_output=True,text=True)
    self.assertEqual(result.returncode,77,result.stderr)
   result=subprocess.run([sys.executable,"-c",child,str(MODULE),str(path),d],capture_output=True,text=True)
   self.assertEqual(result.returncode,0,result.stderr)

if __name__=="__main__":unittest.main()
