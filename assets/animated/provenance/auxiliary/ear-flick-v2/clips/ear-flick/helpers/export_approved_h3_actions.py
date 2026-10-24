"""Stage reviewed whole-frame H3 packs for Pi and DSH; explicit --apply only.

All generation, matte processing and visual review precede this exporter.
The --apply gate requires a recorded human decision, never a fabricated flag.
"""
from pathlib import Path
import argparse,hashlib,json,shutil
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def indexed(image,palette,size,pixel=False):
    # Pillow resizes RGBA in premultiplied space, preserving soft edge colors.
    im=image.resize((size,size),Image.Resampling.NEAREST if pixel else Image.Resampling.LANCZOS)
    a=np.asarray(im.getchannel('A'));rgb=np.asarray(im)[:,:,:3]
    colors=palette[1:];assert 1<=len(colors)<=255
    pal=Image.new('P',(1,1));flat=[n for color in colors for n in color]
    flat+=(colors[0]*(256-len(colors)));pal.putpalette(flat)
    opaque=np.asarray(Image.fromarray(rgb).quantize(palette=pal,dither=Image.Dither.NONE),dtype=np.uint16)
    opaque=np.where(opaque>=len(colors),0,opaque)+1
    if pixel:
        opaque[a<128]=0
    else:
        # Pi has no fractional alpha. Its terminal derivative is explicitly
        # composited against black before palette lookup, separate from HD.
        flat_rgb=np.uint8(np.rint(rgb.astype(float)*a[:,:,None]/255))
        full=Image.new('P',(1,1));full_colors=palette+[palette[-1]]*(256-len(palette));full.putpalette([n for c in full_colors for n in c])
        aa=np.asarray(Image.fromarray(flat_rgb).quantize(palette=full,dither=Image.Dither.NONE),dtype=np.uint16)
        aa=np.minimum(aa,len(palette)-1)
        opaque=np.where(a<255,aa,opaque);opaque[a==0]=0
    return opaque.reshape(-1).tolist()

def main():
    p=argparse.ArgumentParser();p.add_argument('--processed',type=Path,required=True);p.add_argument('--stage',type=Path,required=True)
    p.add_argument('--apply',action='store_true');p.add_argument('--approval',type=Path);args=p.parse_args()
    processed=args.processed.resolve();manifest=read(processed/'manifest.json');action=manifest['action'];assert action in ['watch','search']
    assert manifest['source']['model']=='MiniMax-H3'
    if args.apply:
        if not args.approval:raise ValueError('Human review record required before action installation')
        approval=read(args.approval)
        if approval.get('userApproved') is not True or approval.get('manifestSha256')!=sha(processed/'manifest.json'):
            raise ValueError('Human approval must bind the exact processed manifest')
    stage=args.stage.resolve();stage.mkdir(parents=True,exist_ok=True)
    revision=read(ROOT/'assets/reactions/umi/reaction-sheet.json')['approvedStaticRevision']
    records=manifest['frames'];fps=manifest['fps'];period=manifest['periodMs'];assert fps>=12
    for r in records:assert sha(processed/'rgba'/r['file'])==r['sha256']
    # Sample on the final output clock, including both boundary poses. Timed
    # slots are distributed over the full cycle, so the last endpoint never
    # creates an invalid lone 41/42ms step in the >=50ms Pi player.
    terminal_count=max(2,round(period*12/1000))
    boundaries=[round(n*period/terminal_count) for n in range(terminal_count+1)]
    sample=[min(range(len(records)),key=lambda i:abs(records[i]['atMs']-boundaries[n])) for n in range(terminal_count)]
    sample[0]=0;sample[-1]=len(records)-1
    assert all(b>a for a,b in zip(sample,sample[1:]))
    names=[f'{action}-video-{n:03}' for n in range(len(sample))]
    steps=[{'id':names[n],'durationMs':boundaries[n+1]-boundaries[n]} for n in range(len(sample))]
    assert sum(s['durationMs'] for s in steps)==period and all(50<=s['durationMs']<=2000 for s in steps)
    sequence={'steps':steps,'periodMs':period}
    for style in ['umi']:
        sheet=read(ROOT/f'assets/reactions/{style}/reaction-sheet.json');size=sheet['width'];assert sheet['approvedStaticRevision']==revision
        frames=[]
        if action=='watch':
            for name in ['watch','watch-blink']:frames.append(sheet['frames'][sheet['ids'][name]])
        for name,i in zip(names,sample):
            frames.append({'id':name,'pixels':indexed(Image.open(processed/'rgba'/records[i]['file']).convert('RGBA'),sheet['palette'],size,pixel=size<=100)})
        assert len(frames)<=96 and size*size*len(frames)<=6000000
        asset={'schemaVersion':4,'approvedStaticRevision':revision,'width':size,'height':size,'frames':frames,'sequence':sequence,
          'paletteSha256':hashlib.sha256(json.dumps(sheet['palette'],separators=(',',':')).encode()).hexdigest(),
          'motion':{'bakedMotion':True,'design':'New approved-source H3 complete chronological frames; green-luminance alpha and conservative white-fringe color repair; no local artistic modifications'},
          'sourceManifestSha256':sha(processed/'manifest.json')}
        write(stage/f'reactions/{style}/{action}-frames.json',asset)
    hd=stage/f'hires/{action}';hd.mkdir(parents=True,exist_ok=True)
    for r in records:shutil.copy2(processed/'webp'/f"{r['id']}.webp",hd/f"{r['id']}.webp")
    timeline={'durationMs':period,'fps':fps,'frames':[{'atMs':r['atMs'],'id':r['id']} for r in records]}
    clip_names=['running'] if action=='watch' else ['searching','compacting']
    animation={'approvedStaticRevision':revision,'frames':[r['id'] for r in records],'clips':{name:timeline for name in clip_names},
       'sourceManifestSha256':sha(processed/'manifest.json')}
    write(stage/'hires-animation.json',animation)
    report={'action':action,'approvedStaticRevision':revision,'fullFrames':len(records),'terminalFrames':len(sample),'periodMs':period,
      'processedManifestSha256':sha(processed/'manifest.json'),'runtimeApplied':args.apply,'userApproved':bool(args.apply),
      'fullAlphaForDSH':True,'wholeSequenceTransform':True,'localArtisticChanges':False}
    if args.apply:
        for style in ['umi']:
            shutil.copy2(stage/f'reactions/{style}/{action}-frames.json',ROOT/f'assets/reactions/{style}/{action}-frames.json')
        target=ROOT/f'assets/hires/umi/{action}';target.mkdir(parents=True,exist_ok=True)
        for r in records:shutil.copy2(hd/f"{r['id']}.webp",target/f"{r['id']}.webp")
        hd_manifest=read(ROOT/'assets/hires/umi/manifest.json');assert hd_manifest['approvedStaticRevision']==revision
        hd_manifest['animations'][action]=animation
        hd_manifest['revision']=revision+'-'+sha(processed/'manifest.json')[:10]
        write(ROOT/'assets/hires/umi/manifest.json',hd_manifest)
        shutil.copy2(Path(manifest['source']['file']),ROOT/f'assets/poses/{action}-h3-source.mp4')
        write(ROOT/f'assets/poses/{action}-video-metadata.json',report)
    write(stage/'export-report.json',report);print(json.dumps(report))
if __name__=='__main__':main()
