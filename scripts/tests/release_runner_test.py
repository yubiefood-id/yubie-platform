import importlib.util, pathlib, unittest, tempfile, os, json, hashlib
PATH=pathlib.Path(__file__).parents[1]/"production"/"release_runner.py"
runner=None
if PATH.exists():
 spec=importlib.util.spec_from_file_location("release_runner",PATH);runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
class RunnerBehavior(unittest.TestCase):
 def setUp(self):self.assertIsNotNone(runner,"restricted runner is missing")
 def test_failed_command_does_not_expose_captured_secret_output(self):
  host=runner.Commands()
  with self.assertRaises(runner.Blocked) as error:host.run(["/bin/sh","-c","printf synthetic_secret >&2; exit 7"])
  self.assertNotIn("synthetic_secret",str(error.exception));self.assertEqual(host.log[-1]["exitCode"],7)
 def test_refuses_scratch_cleanup_without_exact_marker_and_identity(self):
  self.assertTrue(hasattr(runner,"check_scratch_identity"))
  runner.check_scratch_identity("yubie_restore_"+"a"*32,"123","marker",{"oid":"123","marker":"marker"})
  for db,oid,marker,row in [("yubie","123","marker",{"oid":"123","marker":"marker"}),("yubie_restore_"+"a"*32,"123","marker",{"oid":"456","marker":"marker"})]:
   with self.assertRaises(runner.Blocked):runner.check_scratch_identity(db,oid,marker,row)
 def test_readiness_observes_queues_not_just_container_running(self):
  self.assertTrue(hasattr(runner,"validate_worker_evidence"))
  with self.assertRaises(runner.Blocked):runner.validate_worker_evidence({"reconcileSchedule":True,"notificationSchedule":True,"recentNotificationCompletion":False},"preview")
  runner.validate_worker_evidence({"reconcileSchedule":True,"notificationSchedule":True,"recentNotificationCompletion":True,"notificationPending":0,"notificationOldestSeconds":0,"notificationExceptions":0},"preview")
  with self.assertRaises(runner.Blocked):runner.validate_worker_evidence({"reconcileSchedule":True,"notificationSchedule":True,"recentNotificationCompletion":True,"notificationPending":1,"notificationOldestSeconds":900,"notificationExceptions":0},"preview")
  with self.assertRaises(runner.Blocked):runner.validate_worker_evidence({"reconcileSchedule":True,"notificationSchedule":True,"recentNotificationCompletion":True,"recentReconciliation":False},"ipaymu")
if __name__=="__main__":unittest.main()
