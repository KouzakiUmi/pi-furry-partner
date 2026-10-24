"""Import exact user-reviewed color candidates, or verify/reproduce current derivatives.
Import needs explicitly reviewed candidate roots; all later verification/reproduction uses
only source29 + canonical small provenance/functions and never requires work/C history.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse,copy,gzip,hashlib,importlib.util,json,shutil,sys
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parent.parent if Path(__file__).resolve().parent.name=='tools' else Path('D:/Software Projects/pi-furry-partner')
A=R/'assets/animated';H=R/'Hi-Res/production/color-consistency-20261024';S=H/'source29';P=A/'provenance/color-consistency-20261024'
SOURCE_SHA='f8de911e18da73a6d091a9193c667dfcf6350374c0509b5c1c69c82b133150c1';APPROVAL_SHA='521fbc24a412ead022e9d86a49f3acaf1b2769c566342580fb1adb076cc604fc'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def bh(b):return hashlib.sha256(b).hexdigest()
def canonical(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(canonical(v)+b'\n')
def mod(p,n):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
ST=mod(R/'tools/stage-motion-polish.py','color_integrate_stage');ENC=mod(R/'scripts/encode_indexed_binary.py','color_integrate_encoder')
def noncolor(raw):
 v=copy.deepcopy(raw);v.pop('palette');v.pop('revision')
 for f in v['frames']:f.pop('pixels')
 return v
def hd_one(t):
 cid,oldf,record,src=t;oldpath=S/'hires'/cid/oldf['file'];before=np.array(Image.open(oldpath).convert('RGBA'));candidate=np.array(Image.open(src).convert('RGBA'))
 assert sha(oldpath)==record['sourceSha256'] if cid!='affection' else True
 expected=record.get('decodedRgbaSha256');assert bh(candidate.tobytes())==expected,(cid,oldf['file'],'reviewedRGBA')
 assert np.array_equal(before[:,:,3],candidate[:,:,3]) and np.array_equal(before[before[:,:,3]==0],candidate[before[:,:,3]==0]),(cid,oldf['file'],'alpha')
 dest=A/'hires'/cid/oldf['file'];shutil.copy2(src,dest);assert sha(dest)==record['sha256']
 return {'file':oldf['file'],'sourceFrame':oldf['sourceFrame'],'atMs':oldf['atMs'],'originalWebpSha256':sha(oldpath),'originalDecodedRgbaSha256':bh(before.tobytes()),'approvedWebpSha256':sha(dest),'approvedDecodedRgbaSha256':expected,'alphaSha256':bh(before[:,:,3].tobytes()),'alpha0RgbSha256':bh(before[before[:,:,3]==0,:3].tobytes())}
def do_import(args):
 assert sha(S/'catalog.json')==SOURCE_SHA and sha(args.approval)==APPROVAL_SHA
 old=read(S/'catalog.json');approval=read(args.approval);assert approval['allowCanonicalColorReplacement'] is True and len(approval['clipChoices'])==29
 V=Path(args.v1);F=Path(args.affection);vhd=read(V/'manifest.json');vpi=read(V/'pi/manifest.json');af=read(F/'manifest.json')
 assert sha(V/'manifest.json')=='041d96f1e7ac5f037536442bea93bc11a82c29eb853f04ca50b15e2e7cb59c09';assert sha(V/'pi/manifest.json')=='e64c31adfbbd14ee3dfdcfe3c3bedaa034748f1154cde47bf1642a9205c386ce';assert sha(F/'manifest.json')=='8d003d1da514cfac1e59b18e78f02d98a55e5491572f226c7683420c45fab185'
 P.mkdir(parents=True,exist_ok=True);(H/'inputs').mkdir(parents=True,exist_ok=True)
 inputs={'v1-hd-manifest.json':V/'manifest.json','v1-pi-manifest.json':V/'pi/manifest.json','affection-A02-manifest.json':F/'manifest.json'}
 for name,src in inputs.items():shutil.copy2(src,H/'inputs'/name)
 for name,src in {'user-final-approval.json':Path(args.approval),'frozen-v1.py':V/'frozen-transform.py','v1-params.json':V/'params.json','frozen-a02.py':Path(args.a02),'common-palette.json':V/'pi/palette.json'}.items():shutil.copy2(src,P/name)
 assert sha(P/'frozen-v1.py')=='1b56b66f46ce21b61052754713b061c4471715d53079576cb30de8bbcd4752f1' and sha(P/'frozen-a02.py')=='7585d873d2c8d2e64e9e2072fa2638fae5f13f2c936934254213452016f8f567'
 revision='animated-color-consistency-20261024-'+APPROVAL_SHA[:16];cat=copy.deepcopy(old);cat['revision']=revision;records={};tasks=[]
 for cid,clip in old['clips'].items():
  mfs={f['file']:f for f in (af['frames'] if cid=='affection' else vhd['clips'][cid]['frames'])}
  for f in clip['hires']['frames']:
   rec=mfs[f['file']];src=F/'hires'/f['file'] if cid=='affection' else V/rec['path'];assert sha(src)==rec['sha256'];tasks.append((cid,f,rec,src))
 with ThreadPoolExecutor(max_workers=4)as pool:
  for t,rec in zip(tasks,pool.map(hd_one,tasks)):
   records.setdefault(t[0],{'variant':'affection-A02'if t[0]=='affection'else'full-color-v1','frames':[]})['frames'].append(rec)
 binary=[];palette=read(P/'common-palette.json')['palette'];palsha=bh(canonical(palette));pi_total=0
 for cid,clip in cat['clips'].items():
  recs={f['file']:f for f in records[cid]['frames']}
  for f in clip['hires']['frames']:
   rr=recs[f['file']];f['webpSha256']=rr['approvedWebpSha256'];f['decodedRgbaSha256']=rr['approvedDecodedRgbaSha256'];f['sourceAsset']={'path':(A/'hires'/cid/f['file']).relative_to(R).as_posix(),'webpSha256':f['webpSha256'],'decodedRgbaSha256':f['decodedRgbaSha256']}
  prec=af['indexed']if cid=='affection'else vpi['clips'][cid];src=F/prec['file']if cid=='affection'else V/prec['file'];assert sha(src)==prec['sha256'];raw=ST.decode_indexed(src);prior=ST.decode_indexed(S/clip['indexed']['umi']['file']);assert noncolor(raw)==noncolor(prior);assert raw['palette']==palette
  approved=copy.deepcopy(raw);raw['revision']=revision;payload,psha,encoding=ENC.encode(raw);packed=gzip.compress(payload,compresslevel=6,mtime=0);ENC.verify(packed,raw);dest=A/clip['indexed']['umi']['file'];dest.write_bytes(packed);assert ST.decode_indexed(dest)==raw
  jsha=bh(canonical(raw));ps=sha(dest);pi_total+=len(raw['frames'])
  for entry in clip['indexed'].values():entry['sha256']=ps;entry['sourceJsonSha256']=jsha;entry['encoding']='gzip-'+encoding
  pr={'file':clip['indexed']['umi']['file'],'sha256':ps,'frameCount':len(raw['frames']),'width':raw['width'],'height':raw['height'],'encoding':encoding,'payloadSha256':psha,'sourceJsonSha256':jsha,'fullIndicesEqual':True,'paletteClockMetadataEqualExceptRevision':True,'comparisonBaseline':'exactHumanApprovedColorPiCandidate','approvedCandidatePackedSha256':sha(src),'approvedCandidateCanonicalDecodedSha256':bh(canonical(approved)),'priorNoncolorMetadataSha256':bh(canonical(noncolor(prior))),'paletteSha256':palsha}
  binary.append(pr);records[cid]['indexed']=pr
  print(json.dumps({'imported':cid,'hd':len(clip['hires']['frames']),'pi':len(raw['frames'])}),flush=True)
 bprov={'schemaVersion':1,'revision':revision,'previousRevision':old['revision'],'previousCatalogSha256':SOURCE_SHA,'paletteIndicesClockExact':True,'HDReencoded':False,'HDReencodedScope':'Canonical HD bytes copied from exact reviewed color candidates; source pixels intentionally changed by approved color-only derivation. No HD reencoding during integration.','comparisonScope':'Approved color Pi candidates exactly equal except newrevision; original noncolor metadata exact separately. Does not claim old palette/indices unchanged.','format':'UMIIDX01','files':binary,'physicalFiles':29,'logicalEntries':58}
 write(P/'indexed-binary.json',bprov)
 smallinputs={name:{'file':src.relative_to(R).as_posix(),'sha256':sha(src)} for name,src in [(p.name,p)for p in P.iterdir()if p.is_file()]}
 proof={'schemaVersion':1,'status':'USER_APPROVED_COLOR_ONLY_DERIVATIVE_APPLIED','revision':revision,'sourceCatalog':{'file':(S/'catalog.json').relative_to(R).as_posix(),'sha256':SOURCE_SHA},'sourceIndex':{'file':(S/'source-index.json').relative_to(R).as_posix(),'sha256':sha(S/'source-index.json')},'historicalProvenanceUnchanged':True,'approval':smallinputs['user-final-approval.json'],'inputs':smallinputs,'reviewedSourceManifests':{name:{'file':(H/'inputs'/name).relative_to(R).as_posix(),'sha256':sha(H/'inputs'/name)}for name in inputs},'frozenTransformInputsNeverRequireWork':True,'scope':'v1 28 clips plus affection A02; HD alpha,alpha0RGB,geometry,clock,originalQA,props and artwork topology retained. Indexed palette/indices intentionally differ; old sampling and all noncolor metadata retained.','commonPaletteSha256':palsha,'hdFrameCount':len(tasks),'piFrameCount':pi_total,'clipCount':29,'clips':records}
 write(P/'derivation.json',proof);cat['colorDerivativeProvenance']={'file':(P/'derivation.json').relative_to(A).as_posix(),'sha256':sha(P/'derivation.json'),'approvalSha256':APPROVAL_SHA,'sourceCatalogSha256':SOURCE_SHA,'sourceRevision':old['revision'],'colorOnly':True}
 cat['indexedBinaryProvenance']={'file':(P/'indexed-binary.json').relative_to(A).as_posix(),'sha256':sha(P/'indexed-binary.json'),'previousRevision':old['revision']}
 tmp=A/'catalog.color-approved.tmp';write(tmp,cat);tmp.replace(A/'catalog.json');write(H/'integration-result.json',{'status':'APPLIED_PENDING_INDEPENDENT_TESTS','revision':revision,'catalogSha256':sha(A/'catalog.json'),'derivationSha256':sha(P/'derivation.json'),'sourceCatalogSha256':SOURCE_SHA,'hdFrames':len(tasks),'piFrames':pi_total,'clipCount':29,'formalColorAssetsChanged':True,'runtimeOrPackageChangedByThisHelper':False});print(json.dumps(read(H/'integration-result.json')),flush=True)
if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--import-reviewed',action='store_true');ap.add_argument('--v1');ap.add_argument('--affection');ap.add_argument('--approval');ap.add_argument('--a02');args=ap.parse_args();assert args.import_reviewed;do_import(args)
