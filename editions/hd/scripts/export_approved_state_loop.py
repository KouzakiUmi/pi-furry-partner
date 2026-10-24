"""Stage exact reviewed complete-frame state loops; publish only with bound human approval.

Maintains all static originals, shared indexed palettes, and existing action clips.
"""
from pathlib import Path
import argparse,hashlib,json,shutil
import numpy as np
from PIL import Image
from export_approved_h3_actions import indexed

ROOT=Path(__file__).resolve().parents[1]
SOURCES={'idle':'idle-open','think':'think','work':'work','listen':'listen','wait':'wait','rest':'rest'}
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')

def main():
    p=argparse.ArgumentParser();p.add_argument('--state',choices=list(SOURCES),required=True)
    p.add_argument('--processed',type=Path,required=True);p.add_argument('--stage',type=Path,required=True)
    p.add_argument('--apply',action='store_true');p.add_argument('--approval',type=Path);args=p.parse_args()
    processed=args.processed.resolve();manifest=read(processed/'manifest.json');state=args.state
    pack=ROOT/'Hi-Res/approved-static-20261018'
    source=next(r for r in read(pack/'manifest.json')['records'] if r['id']==SOURCES[state])
    if manifest['action']!=SOURCES[state] or manifest['approvedSourceSha256']!=source['sha256'] or sha(pack/source['file'])!=source['sha256']:
        raise ValueError('Loop must bind the exact current user-approved static source')
    if manifest['source']['model']!='MiniMax-H3':raise ValueError('Verified MiniMax-H3 source required')
    frames=manifest['frames'];period=manifest['periodMs']
    if not 2<=len(frames)<=512 or not isinstance(period,int) or not 80<=period<=15000:
        raise ValueError('Invalid full sequence budget or duration')
    if manifest['sampling'].get('reverse') or manifest['sampling'].get('interpolation') or manifest['sampling'].get('crossfade'):
        raise ValueError('Only original chronological complete frames are supported')
    previous=-1
    for r in frames:
        if r['sourceFrame']<=previous:raise ValueError('Source sequence must be strictly forward')
        previous=r['sourceFrame'];png=processed/'rgba'/r['file'];webp=processed/'webp'/f"{r['id']}.webp"
        if sha(png)!=r['sha256']:raise ValueError('Processed manifest-bound PNG changed')
        with Image.open(png) as a,Image.open(webp) as b:
            if a.size!=(640,640) or b.size!=(640,640) or not np.array_equal(np.asarray(a.convert('RGBA')),np.asarray(b.convert('RGBA'))):
                raise ValueError('HD WebP must exactly encode the reviewed RGBA image')
    manifest_sha=sha(processed/'manifest.json');approval_sha=None
    if args.apply:
        if not args.approval:raise ValueError('An explicit approval record is required')
        approval=read(args.approval)
        if approval.get('userApproved') is not True or approval.get('manifestSha256')!=manifest_sha or approval.get('approvedSourceSha256')!=source['sha256']:
            raise ValueError('Human approval must bind this exact complete sequence and approved source')
        approval_sha=sha(args.approval)
    revision=read(ROOT/'assets/reactions/umi/reaction-sheet.json')['approvedStaticRevision']
    qa={'accepted':args.apply,'approvedStaticRevision':revision,'processingManifestSha256':manifest_sha,
        'sourceSha256':manifest['source']['sha256'],'approvedSourceSha256':source['sha256'],
        **({'reviewSha256':approval_sha} if approval_sha else {})}
    count=max(2,round(period*12/1000))
    if count>96:raise ValueError('Terminal state loop frame budget exceeded')
    boundaries=[round(n*period/count) for n in range(count+1)]
    sample=[min(range(len(frames)),key=lambda i:abs(frames[i]['atMs']-boundaries[n])) for n in range(count)]
    sample[0]=0;sample[-1]=len(frames)-1
    if not all(b>a for a,b in zip(sample,sample[1:])):raise ValueError('Terminal frames must remain unique and chronological')
    names=[f'state-{state}-{n:03}' for n in range(count)]
    steps=[{'id':name,'durationMs':boundaries[n+1]-boundaries[n]} for n,name in enumerate(names)]
    if sum(s['durationMs'] for s in steps)!=period or not all(50<=s['durationMs']<=2000 for s in steps):raise ValueError('Invalid terminal timing')
    stage=args.stage.resolve();stage.mkdir(parents=True,exist_ok=True)
    entry={'periodMs':period,'frameCount':count,'approvedStaticRevision':revision,'qa':qa}
    for style in ['umi']:
        sheet=read(ROOT/f'assets/reactions/{style}/reaction-sheet.json')
        if sheet['approvedStaticRevision']!=revision:raise ValueError('Style revision mismatch')
        indexed_frames=[{'id':name,'pixels':indexed(Image.open(processed/'rgba'/frames[i]['file']).convert('RGBA'),sheet['palette'],sheet['width'],pixel=sheet['width']<=100)} for name,i in zip(names,sample)]
        asset={'schemaVersion':1,'state':state,'approvedStaticRevision':revision,'width':sheet['width'],'height':sheet['height'],
            'palette':sheet['palette'],'frames':indexed_frames,'sequence':{'periodMs':period,'steps':steps},'qa':qa}
        write(stage/f'reactions/{style}/state-{state}-frames.json',asset)
    hd_names=[f'state-{state}-{n:03}' for n in range(len(frames))]
    hd={'approvedStaticRevision':revision,'qa':qa,'periodMs':period,'durationMs':period,'ids':hd_names,
        'frames':[{'id':name,'atMs':r['atMs']} for name,r in zip(hd_names,frames)]}
    for name,r in zip(hd_names,frames):
        target=stage/f'hires/state-{state}/{name}.webp';target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(processed/'webp'/f"{r['id']}.webp",target)
    write(stage/'catalog-entry.json',entry);write(stage/'hires-clip.json',hd)
    if args.apply:
        for style in ['umi']:
            folder=ROOT/f'assets/reactions/{style}'
            shutil.copy2(stage/f'reactions/{style}/state-{state}-frames.json',folder/f'state-{state}-frames.json')
            catalog=read(folder/'state-loops.json') if (folder/'state-loops.json').exists() else {'schemaVersion':1,'approvedStaticRevision':revision,'clips':{}}
            if catalog.get('approvedStaticRevision')!=revision:raise ValueError('Existing loop catalog revision mismatch')
            catalog['clips'][state]=entry;write(folder/'state-loops.json',catalog)
        target=ROOT/f'assets/hires/umi/state-{state}';target.mkdir(parents=True,exist_ok=True)
        for name in hd_names:shutil.copy2(stage/f'hires/state-{state}/{name}.webp',target/f'{name}.webp')
        path=ROOT/'assets/hires/umi/manifest.json';bank=read(path)
        if bank['approvedStaticRevision']!=revision:raise ValueError('HD bank revision mismatch')
        bank.setdefault('animations',{}).setdefault('stateLoops',{})[state]=hd
        bank['revision']=revision+'-state-'+manifest_sha[:10];write(path,bank)
        write(stage/'approved-publication.json',{'userApproved':True,'state':state,'reviewSha256':approval_sha,'manifestSha256':manifest_sha,
            'processed':str(processed),'sourceFrames':[{'id':n,'sha256':r['sha256'],'sourceFrame':r['sourceFrame']} for n,r in zip(hd_names,frames)]})
    report={'state':state,'processedManifestSha256':manifest_sha,'approvedStaticRevision':revision,
        'runtimeApplied':args.apply,'userApproved':args.apply,'hdFrames':len(frames),'terminalFrames':count,'periodMs':period,
        'exportedStyles':['umi'],'legacyPixelUntouched':True,'staticPaletteChanged':False,'oldActionClipsChanged':False}
    write(stage/'export-report.json',report);print(json.dumps(report))
if __name__=='__main__':main()
