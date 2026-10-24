"""Export one current-model emotion clip, isolated until exact human approval.

The approved whole images and canonical video frames are never repainted.
Old withdrawn emotion publications and other action catalogs are untouched.
"""
from pathlib import Path
import argparse,hashlib,json,shutil
import numpy as np
from PIL import Image
from export_approved_h3_actions import indexed

ROOT=Path(__file__).resolve().parents[1]
EXPECTED='6f2e8f8991b791a52a76a3c612b01ac8b91ae5ecd81ba4bcc3f9b43a232b128a'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')

def main():
 p=argparse.ArgumentParser();p.add_argument('--processed',type=Path,required=True);p.add_argument('--stage',type=Path,required=True)
 p.add_argument('--apply',action='store_true');p.add_argument('--approval',type=Path);args=p.parse_args()
 processed=args.processed.resolve();manifest=read(processed/'manifest.json');action='grumpy'
 if manifest['action']!='emotion-grumpy' or manifest['approvedSourceSha256']!=EXPECTED:
  raise ValueError('Only the current approved thick-forearm grumpy source is authorized')
 if manifest['source']['model']!='MiniMax-H3':raise ValueError('Verified MiniMax-H3 source required')
 records=manifest['frames'];period=manifest['periodMs'];assert 2<=len(records)<=512 and 80<=period<=15000
 for r in records:
  png=processed/'rgba'/r['file'];webp=processed/'webp'/f"{r['id']}.webp"
  if sha(png)!=r['sha256']:raise ValueError('A manifest-bound PNG changed after processing')
  with Image.open(png) as source,Image.open(webp) as encoded:
   if source.size!=(640,640) or encoded.size!=(640,640) or not np.array_equal(np.asarray(source.convert('RGBA')),np.asarray(encoded.convert('RGBA'))):
    raise ValueError('DSH WebP pixels must exactly match the reviewed 640px RGBA frame')
 source_sha=sha(processed/'manifest.json');approval_sha=None
 if args.apply:
  if not args.approval:raise ValueError('Exact human approval required before publishing motion assets')
  approval=read(args.approval)
  if approval.get('userApproved') is not True or approval.get('manifestSha256')!=source_sha:
   raise ValueError('Human approval must bind the exact processed manifest')
  approval_sha=sha(args.approval)
 revision=read(ROOT/'assets/reactions/umi/reaction-sheet.json')['approvedStaticRevision']
 stage=args.stage.resolve();stage.mkdir(parents=True,exist_ok=True)
 qa={'accepted':args.apply,'processingManifestSha256':source_sha,'sourceSha256':manifest['source']['sha256'],
     'approvedStaticRevision':revision,**({'reviewSha256':approval_sha} if approval_sha else {})}
 count=max(2,round(period*12/1000));assert count<=96
 boundaries=[round(n*period/count) for n in range(count+1)]
 sample=[min(range(len(records)),key=lambda i:abs(records[i]['atMs']-boundaries[n])) for n in range(count)]
 sample[0]=0;sample[-1]=len(records)-1;assert all(b>a for a,b in zip(sample,sample[1:]))
 names=[f'gesture-{action}-{n:03}' for n in range(count)]
 steps=[{'id':name,'durationMs':boundaries[n+1]-boundaries[n]} for n,name in enumerate(names)]
 assert sum(s['durationMs'] for s in steps)==period and all(50<=s['durationMs']<=2000 for s in steps)
 for style in ['umi']:
  sheet=read(ROOT/f'assets/reactions/{style}/reaction-sheet.json');assert sheet['approvedStaticRevision']==revision
  frames=[{'id':name,'pixels':indexed(Image.open(processed/'rgba'/records[i]['file']).convert('RGBA'),sheet['palette'],sheet['width'],pixel=sheet['width']<=100)} for name,i in zip(names,sample)]
  asset={'schemaVersion':2,'action':action,'approvedStaticRevision':revision,'width':sheet['width'],'height':sheet['height'],
    'palette':sheet['palette'],'frames':frames,'sequence':{'steps':steps,'periodMs':period},'qa':qa,'motion':{'bakedMotion':True}}
  write(stage/f'reactions/{style}/gesture-{action}-frames.json',asset)
 hd_names=[f'gesture-{action}-{n:03}' for n in range(len(records))]
 hd={'durationMs':period,'periodMs':period,'qa':qa,'approvedStaticRevision':revision,'ids':hd_names,
    'frames':[{'id':name,'atMs':r['atMs']} for name,r in zip(hd_names,records)]}
 for name,r in zip(hd_names,records):
  target=stage/f'hires/gesture-{action}/{name}.webp';target.parent.mkdir(parents=True,exist_ok=True)
  shutil.copy2(processed/'webp'/f"{r['id']}.webp",target)
 catalog_entry={'periodMs':period,'frameCount':count,'qa':qa}
 write(stage/'hires-clip.json',hd);write(stage/'catalog-entry.json',catalog_entry)
 if args.apply:
  for style in ['umi']:
   folder=ROOT/f'assets/reactions/{style}'
   shutil.copy2(stage/f'reactions/{style}/gesture-{action}-frames.json',folder/f'gesture-{action}-frames.json')
   catalog=read(folder/'gesture-videos.json');assert catalog.get('approvedStaticRevision')==revision
   catalog.setdefault('clips',{})[action]=catalog_entry;catalog.pop('reason',None);write(folder/'gesture-videos.json',catalog)
  folder=ROOT/f'assets/hires/umi/gesture-{action}';folder.mkdir(parents=True,exist_ok=True)
  for name in hd_names:shutil.copy2(stage/f'hires/gesture-{action}/{name}.webp',folder/f'{name}.webp')
  path=ROOT/'assets/hires/umi/manifest.json';bank=read(path);assert bank['approvedStaticRevision']==revision
  bank.setdefault('animations',{}).setdefault('gestures',{})[action]=hd;bank['revision']=revision+'-'+source_sha[:10];write(path,bank)
  # Preserve exact handoff evidence separately; never overwrite withdrawn jobs.
  write(stage/'approved-publication.json',{'userApproved':True,'reviewSha256':approval_sha,
    'manifestSha256':source_sha,'source':str(processed),'canonicalSourceFrames':[{'id':n,'sourceFrame':r['sourceFrame'],'sha256':r['sha256']} for n,r in zip(hd_names,records)]})
 report={'action':action,'approvedStaticRevision':revision,'processedManifestSha256':source_sha,'runtimeApplied':args.apply,
   'userApproved':args.apply,'hdFrames':len(records),'terminalFrames':count,'periodMs':period,'exportedStyles':['umi'],'legacyPixelUntouched':True,'oldWithdrawnJobsResumed':False}
 write(stage/'export-report.json',report);print(json.dumps(report))
if __name__=='__main__':main()
