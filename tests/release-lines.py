"""Release line isolation and host-specific archive names; never creates a real release."""
from pathlib import Path
import hashlib,importlib.util,json,tempfile,unittest
R=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('release',R/'tools/release-edition.py');release=importlib.util.module_from_spec(s);s.loader.exec_module(release)
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v),encoding='utf-8')
class ReleaseLines(unittest.TestCase):
 def test_hd_is_independent_and_never_latest(self):
  self.config['releaseLine']='hd';self.configure()
  p,_=release.release_target(self.root,'hd-v2.5.1');self.assertEqual(p['latest'],'false');self.assertIn('HD',p['title']);self.assertFalse(p['prerelease'])
  for tag in ['v2.5.1','legacy-v2.5.1']:
   with self.assertRaises(AssertionError):release.release_target(self.root,tag)
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.config={'releaseLine':'main','editions':{'full-animation':{'version':'2.5.1','label':'Animated'}},'platforms':{'pi':{'resourceProfile':'pi-core','artifactPrefix':'pi-furry-partner'},'dsh':{'resourceProfile':'full','artifactPrefix':'dsh-furry-partner'}}};self.configure()
 def tearDown(self):self.tmp.cleanup()
 def configure(self):
  write(self.root/'build/editions.json',self.config);version=next(iter(self.config['editions'].values()))['version'];(self.root/'CHANGELOG.md').write_text(f'# Changes\n\n## {version} · release\n\nVerified release notes.\n',encoding='utf-8')
 def test_main_and_legacy_are_distinct(self):
  p,_=release.release_target(self.root,'v2.5.1');self.assertEqual(p['latest'],'true');self.assertIn('Main',p['title'])
  with self.assertRaises(AssertionError):release.release_target(self.root,'legacy-v2.5.1')
  self.config['releaseLine']='legacy';self.config['editions']={'hd-remaster':{'version':'2.4.2','label':'Original assets'}};self.configure();p,_=release.release_target(self.root,'legacy-v2.4.2');self.assertEqual(p['latest'],'false');self.assertIn('Legacy',p['title'])
  with self.assertRaises(AssertionError):release.release_target(self.root,'v2.4.2')
 def test_prerelease_and_cross_line_version_rejected(self):
  self.config['editions']['full-animation']['version']='2.5.1-preview.1';self.configure();p,_=release.release_target(self.root,'v2.5.1-preview.1');self.assertTrue(p['prerelease']);self.assertEqual(p['latest'],'false')
  self.config['releaseLine']='legacy';self.configure()
  with self.assertRaises(AssertionError):release.release_target(self.root,'legacy-v2.5.1-preview.1')
  self.config['releaseLine']='main';self.config['editions']['full-animation']['version']='2.4.2';self.configure()
  with self.assertRaises(AssertionError):release.release_target(self.root,'v2.4.2')
 def fixture_archives(self,wrong_dsh=False):
  out=self.root/'dist/releases';out.mkdir(parents=True);plan=release.prepare(self.root,'v2.5.1',self.root/'dist/release');builds=[];audits=[]
  for platform,c in self.config['platforms'].items():
   prefix='pi-furry-partner' if platform=='dsh' and wrong_dsh else c['artifactPrefix'];suffix='-pi-core' if platform=='pi' else '';archive=out/f'{prefix}-full-animation-2.5.1{suffix}.tgz';data=b'explicit unit fixture, not an actual tarball';archive.write_bytes(data);digest=hashlib.sha256(data).hexdigest();report_file=archive.with_suffix('.report.json');caps={'track':'full-animation','targetPlatform':platform,'resourceProfile':c['resourceProfile']};report={'archive':str(archive),'archiveBytes':len(data),'archiveSha256':digest,'fileCount':1,'allArchiveEntriesVerified':True,'capabilities':caps};write(report_file,report);archive.with_suffix('.tgz.sha256').write_text(f'{digest}  {archive.name}\n',encoding='utf-8')
   common={'edition':'full-animation','platform':platform,'version':'2.5.1','profile':c['resourceProfile'],'archive':str(archive),'archiveBytes':len(data),'archiveSha256':digest};builds.append({**common,'report':str(report_file)});audits.append({**common,'runtimeSmokePassed':True,'runtimeEvidence':{'passed':True,'version':'2.5.1','profile':c['resourceProfile']},'newPixelResourcesAbsent':True,'allEntriesReverified':1})
  write(out/'built-editions.json',{'builds':builds});write(out/'edition-audit-full-animation.json',audits);return plan,out
 def test_two_distinct_host_prefixes_accepted(self):
  plan,out=self.fixture_archives();paths=release.release_assets(self.root,plan,out);self.assertEqual(len(paths),6);self.assertTrue(any(Path(p).name.startswith('dsh-') for p in paths))
 def test_old_pi_prefix_cannot_publish_as_dsh(self):
  plan,out=self.fixture_archives(wrong_dsh=True)
  with self.assertRaises(AssertionError):release.release_assets(self.root,plan,out)
if __name__=='__main__':unittest.main()
