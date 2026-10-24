"""Restore Pi's historical 15-frame header clock from current approved artwork.

DSH branding is explicitly outside this tool. Only an existing approved closed
eye is copied; no eye is drawn and no old body artwork is restored.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HISTORY = Path(r'D:/Software Projects/pi-furry-partner/work/approved-static-replacement-20261018/before/assets')
WORK = ROOT / 'work/header-timeline-restoration'
POSES = ROOT / 'assets/hires/umi/poses'
ANCHOR = (320, 608)
EYE_MASK = ROOT / 'work/blink-eye-pilot/eye-mask.png'

def read(p): return json.loads(p.read_text(encoding='utf-8'))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,d):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
def require(value,message):
    if not value: raise ValueError(message)

def timeline(path):
    d=read(path)
    rows=[{k:f[k] for k in ('durationMs','angleDeg','wink')} for f in d['frames']]
    require(len(rows)==15 and sum(f['durationMs'] for f in rows)==4800,'Expected original 15-frame/4800ms clock')
    require([i for i,r in enumerate(rows) if r['wink']]==[7] and rows[7]['durationMs']==700,'Historical wink slot changed')
    return rows

def index_pose(image,palette,size,pixel):
    image=image.resize((size,size),Image.Resampling.NEAREST if pixel else Image.Resampling.LANCZOS)
    a=np.asarray(image)
    colors=palette[1:]
    swatch=Image.new('P',(1,1))
    swatch.putpalette([v for color in colors for v in color]+colors[0]*(256-len(colors)))
    indices=np.asarray(image.convert('RGB').quantize(palette=swatch,dither=Image.Dither.NONE),dtype=np.uint16)
    indices=np.where(indices<len(colors),indices,0)+1
    indices[a[:,:,3]<(128 if pixel else 96)]=0
    return indices.astype(np.uint8)

def rotate_indices(array,angle):
    n=array.shape[0]
    return np.asarray(Image.fromarray(array).rotate(angle,Image.Resampling.NEAREST,expand=False,
                      center=(ANCHOR[0]*n/640,ANCHOR[1]*n/640),fillcolor=0))

def native_bank(current,neutral,wink,rows,source):
    n=current['width']
    require(current['height']==n and len(current['palette'])<=256,'Unsupported header bank')
    poses={False:index_pose(neutral,current['palette'],n,n==100),
           True:index_pose(wink,current['palette'],n,n==100)}
    require(np.array_equal(poses[False]==0,poses[True]==0),'Eye edit changed native alpha')
    require(np.array_equal(poses[False][int(n*.6):],poses[True][int(n*.6):]),'Eye edit changed native lower body')
    result=copy.deepcopy(current)
    result['frames']=[{**row,'pixels':rotate_indices(poses[row['wink']],row['angleDeg']).reshape(-1).tolist()} for row in rows]
    result.update(loopDurationMs=4800,headerTimelineRevision=source['revision'],
                  headerSourcePose='idle-open',headerRestoration=source)
    return result

def terminal_bank(native,previous):
    result={k:copy.deepcopy(v) for k,v in previous.items() if k!='variants'}
    result.update(palette=native['palette'],loopDurationMs=4800,
                  headerTimelineRevision=native['headerTimelineRevision'],headerRestoration=native['headerRestoration'])
    result['variants']={}
    for name,prior in previous['variants'].items():
        n=prior['width'];size=native['width']
        xs=np.minimum(size-1,np.floor((np.arange(n)+.5)*size/n).astype(int))
        frames=[]
        for f in native['frames']:
            pixels=np.asarray(f['pixels'],np.uint8).reshape(size,size)
            frames.append({**{k:f[k] for k in ('durationMs','angleDeg','wink')},
                           'pixels':pixels[np.ix_(xs,xs)].reshape(-1).tolist()})
        result['variants'][name]={**prior,'frames':frames}
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--historical-assets',type=Path,default=DEFAULT_HISTORY)
    args=parser.parse_args()
    require(ROOT.name=='pi-furry-partner-regular','Only the ordinary worktree is supported')
    WORK.mkdir(parents=True,exist_ok=True)
    rows=timeline(args.historical_assets/'native-frames.json')
    require(rows==timeline(args.historical_assets/'illustration/native-frames.json'),'Historical style clocks differ')
    open_path,closed_path=POSES/'idle-open.webp',POSES/'idle-blink.webp'
    neutral=Image.open(open_path).convert('RGBA')
    closed=Image.open(closed_path).convert('RGBA')
    a,b=np.asarray(neutral),np.asarray(closed)
    require(a.shape==b.shape==(640,640,4),'Approved source canvas changed')
    require(np.array_equal(a[:,:,3],b[:,:,3]),'Closed-eye source is not body/alpha locked')
    existing_mask=np.asarray(Image.open(EYE_MASK).convert('L'))>0
    require(not np.any(np.any(a!=b,axis=2)&~existing_mask),'Closed-eye changes leave the approved eye mask')
    chosen=existing_mask&(np.indices(existing_mask.shape)[1]>=320)
    wink_rgba=a.copy();wink_rgba[chosen]=b[chosen]
    require(np.array_equal(wink_rgba[:,:,3],a[:,:,3]) and np.array_equal(wink_rgba[~chosen],a[~chosen]),'Wink altered body/other eye')
    wink=Image.fromarray(wink_rgba)
    source={'schemaVersion':1,'neutralPath':str(open_path),'neutralSha256':sha(open_path),
            'closedEyeDonorPath':str(closed_path),'closedEyeDonorSha256':sha(closed_path),
            'approvedEyeMaskPath':str(EYE_MASK),'approvedEyeMaskSha256':sha(EYE_MASK),
            'singleEyeSelection':'Existing approved mask intersect native x>=320 (viewer-right eye)',
            'anchor':list(ANCHOR),'sourceCanvas':[640,640],'scale':1,'perFrameFit':False,
            'rotation':'Fixed rigid 0..-6 degrees around the unchanged foot/root anchor; no translation or fitting',
            'historicalTimelinePath':str(args.historical_assets/'native-frames.json'),
            'historicalTimelineSha256':sha(args.historical_assets/'native-frames.json'),
            'piHeaderOnly':True,'dshBrandingModified':False,'eyePixelsDrawn':False,'aiGenerated':False}
    source['revision']='header15-current-idle-'+hashlib.sha256(json.dumps(source,sort_keys=True).encode()).hexdigest()[:16]
    protected=[ROOT/'assets/branding/title.json',ROOT/'assets/branding/umi-title.png',POSES/'title.webp',open_path,closed_path]
    protected_hashes={str(p):sha(p) for p in protected}
    native_paths=[ROOT/'assets/native-frames.json',ROOT/'assets/illustration/native-frames.json']
    records=[];outputs=[]
    for path in native_paths+[ROOT/'assets/terminal-frames.json']:
        dest=WORK/'before'/path.relative_to(ROOT)
        if not dest.exists():dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,dest)
    for path in native_paths:
        before_path=WORK/'before'/path.relative_to(ROOT)
        current=read(before_path)
        fixed=native_bank(current,neutral,wink,rows,source)
        write(path,fixed)
        records.append({'file':str(path),'historicalPath':str(args.historical_assets/path.relative_to(ROOT/'assets')),
                        'historicalSha256':sha(args.historical_assets/path.relative_to(ROOT/'assets')),
                        'currentBeforeSha256':sha(before_path),'fixedSha256':sha(path),
                        'currentFrames':len(current['frames']),'fixedFrames':len(fixed['frames']),
                        'nativeCanvas':[fixed['width'],fixed['height']],'paletteUnchanged':current['palette']==fixed['palette'],
                        'loopDurationMs':4800})
        outputs.append(fixed)
    terminal_path=ROOT/'assets/terminal-frames.json'
    terminal=terminal_bank(outputs[0],read(WORK/'before/assets/terminal-frames.json'))
    write(terminal_path,terminal)
    terminal_record={'file':str(terminal_path),'historicalPath':str(args.historical_assets/'terminal-frames.json'),
                     'historicalSha256':sha(args.historical_assets/'terminal-frames.json'),
                     'currentBeforeSha256':sha(WORK/'before/assets/terminal-frames.json'),
                     'fixedSha256':sha(terminal_path),'loopDurationMs':4800,
                     'currentVariantFrameCounts':{k:len(v['frames']) for k,v in read(WORK/'before/assets/terminal-frames.json')['variants'].items()},
                     'fixedVariantFrameCounts':{k:len(v['frames']) for k,v in terminal['variants'].items()}}
    neutral.save(WORK/'neutral-current-idle.png');wink.save(WORK/'wink-current-idle.png')
    # HD visual pilot only; Pi's actual consumers read the two native JSON banks.
    hd=[]
    for i,row in enumerate(rows):
        image=(wink if row['wink'] else neutral).rotate(row['angleDeg'],Image.Resampling.BICUBIC,
                           expand=False,center=ANCHOR,fillcolor=(0,0,0,0))
        open_rot=neutral.rotate(row['angleDeg'],Image.Resampling.BICUBIC,expand=False,center=ANCHOR,fillcolor=(0,0,0,0))
        require(np.array_equal(np.asarray(image)[:,:,3],np.asarray(open_rot)[:,:,3]),'Rigid wink changed alpha')
        require(np.array_equal(np.asarray(image)[400:],np.asarray(open_rot)[400:]),'Rigid wink changed lower body')
        hd.append(image)
        target=WORK/'hd'/f'{i:02}.png';target.parent.mkdir(exist_ok=True);image.save(target)
    hd[0].save(WORK/'header15-preview.apng',format='PNG',save_all=True,append_images=hd[1:],
               duration=[r['durationMs'] for r in rows],loop=0,blend=0,disposal=0)
    with Image.open(WORK/'header15-preview.apng') as animation:
        require(animation.n_frames==15,'Preview merged the historical frames')
        for i,image in enumerate(hd):
            animation.seek(i)
            require(np.array_equal(np.asarray(animation.convert('RGBA')),np.asarray(image)),'APNG preview changed full RGBA')
    contact=Image.new('RGB',(196*5,220*3),(105,105,105));draw=ImageDraw.Draw(contact)
    for i,image in enumerate(hd):
        x=(i%5)*196;y=(i//5)*220
        patch=Image.new('RGBA',(196,196),(105,105,105,255));patch.alpha_composite(image.resize((196,196),Image.Resampling.LANCZOS))
        contact.paste(patch.convert('RGB'),(x,y+24));draw.text((x+4,y+4),f"{i:02} {rows[i]['angleDeg']}deg {rows[i]['durationMs']}ms {'wink' if rows[i]['wink'] else ''}",fill='white')
    contact.save(WORK/'contact.jpg',quality=95)
    comparison=Image.new('RGB',(196*4,220*3),(105,105,105));labels=ImageDraw.Draw(comparison)
    for row_index,kind in enumerate(['HD 640','Pixel native 100','Illustration native 240']):
        for col,frame_index in enumerate([0,6,7,14]):
            image=hd[frame_index]
            if row_index:
                bank=outputs[row_index-1];n=bank['width']
                pixels=np.asarray(bank['frames'][frame_index]['pixels']).reshape(n,n)
                rgb=np.asarray(bank['palette'],np.uint8)[pixels]
                image=Image.fromarray(np.dstack([rgb,np.where(pixels==0,0,255).astype(np.uint8)]))
            patch=Image.new('RGBA',(196,196),(105,105,105,255))
            patch.alpha_composite(image.resize((196,196),Image.Resampling.NEAREST if row_index else Image.Resampling.LANCZOS))
            x,y=col*196,row_index*220
            comparison.paste(patch.convert('RGB'),(x,y+24));labels.text((x+3,y+4),f'{kind} #{frame_index:02}',fill='white')
    comparison.save(WORK/'native-hd-comparison.png')
    require(all(sha(Path(p))==h for p,h in protected_hashes.items()),'A protected DSH/source resource changed')
    report={'schemaVersion':1,'status':'RESTORED_PI_HEADER_AWAITING_VISUAL_REVIEW','revision':source['revision'],
            'source':source,'files':records,'terminalFile':terminal_record,'timeline':rows,'frameCount':15,'periodMs':4800,
            'winkChangedNative640Pixels':int(np.any(a!=wink_rgba,axis=2).sum()),
            'winkFullAlphaIdentical':True,'winkOutsideChosenEyeRgbaIdentical':True,'otherEyeAndBodyIdentical':True,
            'allRigidPosesUseFixedFootAnchor':True,'nativePaletteUnchanged':True,'nativeSizesUnchanged':True,
            'terminalVariants':{k:len(v['frames']) for k,v in terminal['variants'].items()},
            'preview':'header15-preview.apng','previewFullRgbaExact':True,'contact':'contact.jpg',
            'nativeHdComparison':'native-hd-comparison.png',
            'protectedDshAndSourceHashes':protected_hashes,'ordinaryEditorAssetsModified':False,
            'oldLowResolutionBodyRestored':False,'installed':False}
    write(WORK/'report.json',report)
    print(json.dumps({'revision':source['revision'],'frames':15,'periodMs':4800,'winkPixels':report['winkChangedNative640Pixels'],
                      'report':str(WORK/'report.json'),'preview':str(WORK/'header15-preview.apng')}))

if __name__=='__main__':main()
