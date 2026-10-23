"""Verify current approved color derivatives without work inputs.
Every current HD RGBA is checked against its independently frozen reviewed candidate
hash and directly compared with source29 alpha/alpha0RGB. Pi payloads/palette/clock
are checked against approved color candidates and the immutable original metadata.
--reproduce additionally recalculates every HD transform from frozen source29.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse,copy,hashlib,importlib.util,json
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parent.parent;A=R/'assets/animated';S=R/'Hi-Res/production/color-consistency-20261024/source29'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def bh(v):return hashlib.sha256(v).hexdigest()
def canonical(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def mod(p,n):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
ST=mod(R/'tools/stage-motion-polish.py','verify_color_stage')
def noncolor(raw):
 raw=copy.deepcopy(raw);raw.pop('palette');raw.pop('revision')
 for f in raw['frames']:f.pop('pixels')
 return raw
def run(reproduce=False):
 c=read(A/'catalog.json');ref=c['colorDerivativeProvenance'];p=A/ref['file'];assert sha(p)==ref['sha256'];proof=read(p);P=p.parent
 assert sha(S/'catalog.json')==proof['sourceCatalog']['sha256']=='f8de911e18da73a6d091a9193c667dfcf6350374c0509b5c1c69c82b133150c1';old=read(S/'catalog.json')
 approval=P/'user-final-approval.json';assert sha(approval)==ref['approvalSha256']=='521fbc24a412ead022e9d86a49f3acaf1b2769c566342580fb1adb076cc604fc';ap=read(approval);assert ap['allowCanonicalColorReplacement'] is True and ap['clipCount']==29
 for i in proof['inputs'].values():assert sha(R/i['file'])==i['sha256']
 assert c['revision']==proof['revision'] and c['revision']!=old['revision'];assert len(c['clips'])==29
 for k,v in old.items():
  if k not in ['clips','revision','indexedBinaryProvenance']:assert c[k]==v,('topMetadata',k)
 v1=mod(P/'frozen-v1.py','verify_color_frozen_v1');a02=mod(P/'frozen-a02.py','verify_color_frozen_a02');palette=read(P/'common-palette.json')['palette'];assert bh(canonical(palette))==proof['commonPaletteSha256'];pi=0;tasks=[]
 for cid,clip in c['clips'].items():
  prev=old['clips'][cid];rec=proof['clips'][cid];assert ap['clipChoices'][cid]==rec['variant'];assert clip['qa']==prev['qa'];assert clip['paintRect']==prev['paintRect']
  for k,v in prev.items():
   if k not in ['indexed','hires']:assert clip[k]==v,(cid,k)
  for k,v in prev['hires'].items():
   if k!='frames':assert clip['hires'][k]==v
  assert len(clip['hires']['frames'])==len(prev['hires']['frames'])==len(rec['frames'])
  for f,of,rr in zip(clip['hires']['frames'],prev['hires']['frames'],rec['frames']):
   for k,v in of.items():
    if k not in ['sourceAsset','webpSha256','decodedRgbaSha256']:assert f[k]==v,(cid,f['file'],k)
   tasks.append((cid,clip['paintRect'],f,of,rr))
  raw=ST.decode_indexed(A/clip['indexed']['umi']['file']);original=ST.decode_indexed(S/prev['indexed']['umi']['file']);assert noncolor(raw)==noncolor(original);assert bh(canonical(noncolor(raw)))==rec['indexed']['priorNoncolorMetadataSha256'];assert raw['revision']==c['revision'];assert raw['palette']==palette
  restored=copy.deepcopy(raw);restored['revision']=old['revision'];assert bh(canonical(restored))==rec['indexed']['approvedCandidateCanonicalDecodedSha256'],cid
  assert sha(A/clip['indexed']['umi']['file'])==rec['indexed']['sha256'];assert bh(canonical(raw))==rec['indexed']['sourceJsonSha256']
  for style,entry in clip['indexed'].items():
   assert entry['sha256']==rec['indexed']['sha256'] and entry['sourceJsonSha256']==rec['indexed']['sourceJsonSha256'];oe=prev['indexed'][style]
   for k,v in oe.items():
    if k not in ['sha256','sourceJsonSha256']:assert entry[k]==v
  pi+=len(raw['frames'])
 def one(t):
  cid,rect,f,of,rr=t;current=A/'hires'/cid/f['file'];original=S/'hires'/cid/f['file'];assert sha(current)==f['webpSha256']==rr['approvedWebpSha256'];assert sha(original)==rr['originalWebpSha256']
  a=np.array(Image.open(original).convert('RGBA'));b=np.array(Image.open(current).convert('RGBA'));assert a.shape==b.shape==(rect['height'],rect['width'],4);assert bh(b.tobytes())==f['decodedRgbaSha256']==rr['approvedDecodedRgbaSha256'];assert bh(a.tobytes())==rr['originalDecodedRgbaSha256'];assert np.array_equal(a[:,:,3],b[:,:,3]);assert np.array_equal(a[a[:,:,3]==0],b[a[:,:,3]==0]);assert bh(a[:,:,3].tobytes())==rr['alphaSha256'];assert bh(a[a[:,:,3]==0,:3].tobytes())==rr['alpha0RgbSha256'];assert f['sourceAsset']=={'path':current.relative_to(R).as_posix(),'webpSha256':sha(current),'decodedRgbaSha256':bh(b.tobytes())}
  if reproduce:
   expected,_=v1.transform(a,cid,rect)
   if cid=='affection':expected=a02.transform_v1_affection(expected)
   assert np.array_equal(expected,b),(cid,f['file'],'fixed transform reproduction')
  return True
 with ThreadPoolExecutor(max_workers=4)as pool:assert all(pool.map(one,tasks))
 assert len(tasks)==proof['hdFrameCount']==3048 and pi==proof['piFrameCount']
 result={'passed':True,'clipCount':29,'HDWholeRGBAFrames':len(tasks),'HDAlphaAndAlpha0RGBExact':True,'PiExactReviewedCandidateFrames':pi,'PiOriginalNoncolorMetadataExact':True,'sameReviewedCommonPalette':True,'allOriginalQAMetadataRetained':True,'workInputsRequired':False,'allFixedTransformsReproduced':reproduce,'catalogRevision':c['revision'],'catalogSha256':sha(A/'catalog.json')};print(json.dumps(result),flush=True);return result
if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--reproduce',action='store_true');args=ap.parse_args();run(args.reproduce)
