import importlib.util,pathlib,subprocess,sys,tempfile,unittest,tarfile,io,hashlib,os,json
ROOT=pathlib.Path(__file__).parents[2]
def module(name):
 p=ROOT/"scripts"/"production"/(name+".py")
 if not p.exists():return None
 spec=importlib.util.spec_from_file_location(name,p);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
class ArtifactBoundaries(unittest.TestCase):
 def test_unknown_checkout_sha_cannot_be_labelled_as_a_release(self):
  result=subprocess.run([sys.executable,str(ROOT/"scripts/production/release_bundle.py"),"--sha","a"*40,"--api-image","ghcr.io/yubiefood-id/yubie-api@sha256:"+"b"*64,"--worker-image","ghcr.io/yubiefood-id/yubie-worker@sha256:"+"c"*64,"--output","/tmp/never-created-yubie-release"],capture_output=True,text=True)
  self.assertEqual(result.returncode,77,result.stderr)
  self.assertFalse(pathlib.Path('/tmp/never-created-yubie-release').exists())
 def test_dirty_source_stops_before_material_or_artifact_collection(self):
  builder=module("release_bundle");self.assertIsNotNone(builder)
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d)
   subprocess.run(["git","init","-q",str(root)],check=True)
   subprocess.run(["git","-C",str(root),"config","user.name","Synthetic Test"],check=True)
   subprocess.run(["git","-C",str(root),"config","user.email","synthetic@example.invalid"],check=True)
   marker=root/"tracked.txt";marker.write_text("reviewed")
   subprocess.run(["git","-C",str(root),"add","tracked.txt"],check=True)
   subprocess.run(["git","-C",str(root),"commit","-qm","synthetic fixture"],check=True)
   sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
   marker.write_text("changed after the reviewed commit")
   with self.assertRaisesRegex(ValueError,"SOURCE_DIRTY"):
    builder.build(root,sha,"ghcr.io/yubiefood-id/yubie-api@sha256:"+"b"*64,"ghcr.io/yubiefood-id/yubie-worker@sha256:"+"c"*64,root/"output")
   self.assertFalse((root/"output").exists())
 def test_archive_path_escape_and_symlinks_are_refused_before_extraction(self):
  installer=module("install_release");self.assertIsNotNone(installer,"root installer is missing")
  for name,symlink in [("../../outside",False),("release-manifest.json",True)]:
   with tempfile.TemporaryDirectory() as d:
    p=pathlib.Path(d)/"bundle.tgz"
    with tarfile.open(p,"w:gz") as tar:
     info=tarfile.TarInfo(name);info.size=1
     if symlink:info.type=tarfile.SYMTYPE;info.linkname='/etc/passwd';info.size=0
     tar.addfile(info,io.BytesIO(b'x'))
    with self.assertRaises(installer.InstallBlocked):installer.verify_archive(p,hashlib.sha256(p.read_bytes()).hexdigest())
 def test_generated_wrapper_rejects_arguments_before_reading_root_files(self):
  installer=module("install_release");self.assertIsNotNone(installer,"root wrapper generator is missing")
  with tempfile.TemporaryDirectory() as d:
   path=pathlib.Path(d)/'wrapper';path.write_text(installer.wrapper_source('a'*40,'b'*64,{}))
   result=subprocess.run([sys.executable,'-I',str(path),'unexpected'],capture_output=True,text=True)
   self.assertEqual(result.returncode,64,result.stderr)
if __name__=='__main__':unittest.main()
