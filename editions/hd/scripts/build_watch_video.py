#!/usr/bin/env python3
"""Build bounded whole-frame watch packs from a reviewed transparent video export.

Input is an explicit manifest of fixed-canvas 640px RGBA images, in forward
playback order. Keying and selection happen before this script. Nothing is
cropped, aligned, interpolated, reversed, or blended here. Only the starting
eye sockets receive a local blink; the source body and alpha remain identical.
Requires Pillow and NumPy; optional SciPy accelerates exact palette lookup.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
from collections import deque
import numpy as np
from PIL import Image
from build_watch_reactions import palette_index
from build_wumi_reactions import blink, EYE_CLEAN_POLYGONS

ROOT=Path(__file__).resolve().parents[1]
STYLES=(('wumi',240),('wumi-pixel',80))

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')

def eye_only_blink(image):
    eyes={'left':(215,242,275,321),'right':(349,243,419,323)}
    EYE_CLEAN_POLYGONS[eyes['left']]=[(214,252),(227,239),(252,238),(268,247),(279,265),(281,295),(272,320),(231,323),(216,306)]
    EYE_CLEAN_POLYGONS[eyes['right']]=[(347,251),(363,238),(393,237),(417,249),(437,274),(432,300),(414,323),(361,325),(348,307)]
    closed=blink(image,eyes,lid_boxes={'left':(219,245,274,319),'right':(351,247,417,321)})
    before=np.asarray(image);after=np.asarray(closed)
    assert np.array_equal(before[:,:,3],after[:,:,3]),'The blink must preserve every source alpha pixel'
    changed=np.any(before!=after,axis=2)
    outside=changed.copy();outside[215:328,210:286]=False;outside[215:328,342:443]=False
    assert not outside.any(),'Only the two eye sockets may change during the blink'
    return closed,{'baseId':'watch','source':'assets/poses/neutral-eyes-clean.png',
        'eyeBoxes':eyes,'changedPixels':int(changed.sum()),'alphaChangedPixels':0,'outsideEyeChangedPixels':0}

def nearest_indices(rgb,palette):
    try:
        from scipy.spatial import cKDTree
    except ImportError:
        source=np.asarray(rgb,dtype=np.float64).reshape(-1,3);colors=np.asarray(palette,dtype=np.float64)
        result=np.zeros(len(source),np.uint16)
        for start in range(0,len(source),4096):result[start:start+4096]=np.argmin(((source[start:start+4096,None,:]-colors[None,:,:])**2).sum(2),1)
        return result
    return cKDTree(np.asarray(palette,dtype=float)).query(np.asarray(rgb).reshape(-1,3),k=1,eps=0,workers=1)[1]

def border_connected_partial(alpha):
    # Identify only the partial-coverage band connected to the outside. This
    # is a terminal display approximation, never an erosion of the source.
    mask=alpha<255;seen=np.zeros(mask.shape,bool);h,w=mask.shape;queue=deque()
    for y,x in [*((0,x) for x in range(w)),*((h-1,x) for x in range(w)),*((y,0) for y in range(h)),*((y,w-1) for y in range(h))]:
        if mask[y,x] and not seen[y,x]:seen[y,x]=True;queue.append((y,x))
    while queue:
        y,x=queue.popleft()
        for yy,xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if 0<=yy<h and 0<=xx<w and mask[yy,xx] and not seen[yy,xx]:seen[yy,xx]=True;queue.append((yy,xx))
    return seen

def index_image(image,palette,size,pixel=False,background=None,keep_soft=False):
    image=image.resize((size,size),Image.Resampling.NEAREST if pixel else Image.Resampling.LANCZOS)
    array=np.asarray(image);rgb=array[:,:,:3].reshape(-1,3)
    indices=nearest_indices(rgb,palette[1:]).astype(np.uint16)+1
    if background is not None:
        alpha=array[:,:,3].reshape(-1,1)/255;bg=np.asarray(background,dtype=float)
        flat=rgb*alpha+bg*(1-alpha);edge=border_connected_partial(array[:,:,3]).reshape(-1)
        aa_palette=np.asarray(palette,dtype=float).copy();aa_palette[0]=bg
        aa=nearest_indices(flat,aa_palette).astype(np.uint16)
        # Duplicate opaque-black palette entries must never turn a fully
        # transparent/background-matching pixel into an opaque black square.
        bg_distance=((flat-bg)**2).sum(1);chosen_distance=((flat-aa_palette[aa])**2).sum(1)
        aa[bg_distance<=chosen_distance+1e-9]=0
        # A few pre-existing palette entries are visually black but are not
        # index zero. On the AA derivative's outer partial-coverage band they
        # represent the terminal background, not new opaque noise pixels.
        aa[np.max(np.abs(aa_palette[aa]-bg),axis=1)<=3]=0
        indices[edge]=aa[edge];indices[array[:,:,3].reshape(-1)==0]=0
    else:indices[array[:,:,3].reshape(-1)<(1 if keep_soft else 128)]=0
    return indices.tolist()

def preview_frame(frame,palette,size,path):
    pixels=np.asarray(frame['pixels']).reshape(size,size)
    rgba=np.zeros((size,size,4),dtype=np.uint8)
    rgba[:,:,:3]=np.asarray(palette,dtype=np.uint8)[pixels];rgba[:,:,3]=np.where(pixels==0,0,255)
    Image.fromarray(rgba).save(path)

def protect_video_mouth(frame,master,palette):
    # The head really turns in the video. Locate its warm mouth stroke in each
    # native master instead of repairing the old fixed frontal mouth box.
    rgba=np.asarray(master);r,g,b=rgba[:,:,:3].astype(float).transpose(2,0,1)
    warm=(r>90)&(r<225)&(r>g*1.3)&(r>b*1.2)&(rgba[:,:,3]>240)
    dark=(np.maximum.reduce([r,g,b])<130)&(r>=b*.97)&(rgba[:,:,3]>240)
    search=dark[312:351,240:411].copy();components=[]
    while search.any():
        yy,xx=np.argwhere(search)[0];stack=[(int(yy),int(xx))];search[yy,xx]=False;points=[]
        while stack:
            py,px=stack.pop();points.append((py+312,px+240))
            for dy,dx in ((-1,0),(1,0),(0,-1),(0,1)):
                ny,nx=py+dy,px+dx
                if 0<=ny<search.shape[0] and 0<=nx<search.shape[1] and search[ny,nx]:search[ny,nx]=False;stack.append((ny,nx))
        arr=np.asarray(points);y0,x0=arr.min(0);y1,x1=arr.max(0)
        if 20<=len(points)<=500 and 10<=x1-x0<=35 and 5<=y1-y0<=25 and y0>314 and y1<350:
            components.append((len(points),float(arr[:,1].mean()),float(arr[:,0].mean())))
    if not components:return frame,None # A lens can legitimately hide the nose/mouth.
    _,nx,ny=max(components)
    region=np.zeros((640,640),bool);region[round(ny)+7:min(385,round(ny)+34),max(0,round(nx)-39):min(640,round(nx)+40)]=True;warm&=region
    ys,xs=np.where(warm)
    if len(xs)<8:return frame,None
    left,right=max(0,int(xs.min()//8)),min(79,int(xs.max()//8))
    top,bottom=max(0,int(ys.min()//8)-1),min(79,int(ys.max()//8)+1)
    original=np.asarray(frame['pixels'],dtype=np.uint8).reshape(80,80);result=original.copy()
    # Clean only old warm fragments in the detected moving stroke's own ROI.
    for y in range(top,bottom+1):
        for x in range(left,right+1):
            rr,gg,bb=palette[int(original[y,x])]
            if original[y,x] and 90<rr<225 and rr>gg*1.2 and rr>bb*1.15:result[y,x]=3
    for x in range(left,right+1):
        py,px=np.where(warm[:,x*8:(x+1)*8])
        if len(py)<2:continue
        y=int(np.mean(py)//8);y=max(top,min(bottom,y))
        if original[y,x]:result[y,x]=46
    assert np.array_equal(result==0,original==0)
    return {'id':frame['id'],'pixels':result.reshape(-1).tolist()},[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--stage',type=Path,required=True)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--terminal-aa-background',help='Optional RRGGBB background for watch240 edge-only matte composition; palette and opaque interiors are unchanged')
    args=parser.parse_args();manifest_path=args.manifest.resolve();stage=args.stage.resolve();stage.mkdir(parents=True,exist_ok=True)
    background=None
    if args.terminal_aa_background:
        value=args.terminal_aa_background.lstrip('#');assert re.fullmatch('[0-9a-fA-F]{6}',value)
        background=[int(value[n:n+2],16) for n in (0,2,4)]
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    records=manifest['frames'];assert 2<=len(records)<=95
    original={style:sha(ROOT/f'assets/reactions/{style}/reaction-sheet.json') for style,_ in STYLES}
    protected={str(path.relative_to(ROOT)):sha(path) for path in (ROOT/'assets/reactions').glob('*/poke-patch.json')}
    names=[];poses=[];steps=[]
    for record in records:
        name=record['id'];assert re.fullmatch(r'watch(?:-[a-z0-9]+)*',name) and name!='watch-blink' and name not in names
        file=Path(record['file']);assert not file.is_absolute() and len(file.parts)==1 and file.suffix=='.png'
        path=manifest_path.parent/file;assert sha(path)==record['sha256']
        image=Image.open(path).convert('RGBA');assert image.size==(640,640)
        duration=record['durationMs'];assert isinstance(duration,int) and 50<=duration<=2000
        names.append(name);poses.append(image);steps.append({'id':name,'durationMs':duration})
    assert names[0]=='watch';assert len(steps)<=128
    period=sum(step['durationMs'] for step in steps);assert period<=20000
    assert period==manifest['sampling']['durationMs']
    closed,blink_metadata=eye_only_blink(poses[0])
    # Split the explicit opening hold. All selected video poses remain in
    # forward order, and the blink never lengthens the source loop.
    opening=steps[0]['durationMs'];assert opening>=260,'An explicit starting hold is required for a stable local blink'
    blink_ms=80;open_ms=min(200,opening-blink_ms-50)
    steps[:1]=[{'id':'watch','durationMs':open_ms},{'id':'watch-blink','durationMs':blink_ms},
        {'id':'watch','durationMs':opening-open_ms-blink_ms}]
    names.insert(1,'watch-blink');poses.insert(1,closed)
    native_folder=stage/'rgba';native_folder.mkdir(exist_ok=True)
    for name,pose in zip(names,poses):pose.save(native_folder/f'{name}.png')
    sequence={'steps':steps,'periodMs':period}
    design='Video-derived whole-frame inspection, forward playback, eye-only local blink; no runtime deformation or temporal blending'
    assets={};sheets={};mouth_boxes=[]
    for style,size in STYLES:
        sheet=json.loads((ROOT/f'assets/reactions/{style}/reaction-sheet.json').read_text(encoding='utf-8'));sheets[style]=sheet
        assert len(sheet['frames'])==21
        frames=[{'id':name,'pixels':index_image(pose,sheet['palette'],size,style.endswith('pixel'),background=background if size==240 else None)} for name,pose in zip(names,poses)]
        if size==80:
            for n,(frame,pose) in enumerate(zip(frames,poses)):
                frames[n],box=protect_video_mouth(frame,pose,sheet['palette']);mouth_boxes.append({'id':frame['id'],'sourceBox':box})
        asset={'schemaVersion':3,'width':size,'height':size,'frames':frames,'sequence':sequence,
            'motion':{'bakedMotion':True,'design':design,'blinkBaseId':'watch'},
            'paletteSha256':hashlib.sha256(json.dumps(sheet['palette'],separators=(',',':')).encode()).hexdigest()}
        assets[style]=asset;folder=stage/style;folder.mkdir(exist_ok=True);write(folder/'watch-frames.json',asset)
        for frame in frames:preview_frame(frame,sheet['palette'],size,folder/f"{frame['id']}.png")
        before=np.asarray(frames[0]['pixels']).reshape(size,size);after=np.asarray(frames[1]['pixels']).reshape(size,size)
        assert np.array_equal(before==0,after==0),'Indexed blink alpha must be identical too'
        print(json.dumps({'style':style,'frames':len(frames),'periodMs':period}),flush=True)
    # A sampled color atlas supplies a common HD palette without publishing
    # dozens of full-size RGBA masters. The bank stays in the private stage.
    mosaic=Image.new('RGB',(160,160*len(poses)))
    for n,pose in enumerate(poses):mosaic.paste(pose.convert('RGB').resize((160,160),Image.Resampling.LANCZOS),(0,n*160))
    quant=mosaic.quantize(colors=255,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    flat=quant.getpalette()[:765];palette=[[0,0,0]]+[flat[n:n+3] for n in range(0,len(flat),3)]
    hd={'width':640,'height':640,'transparentIndex':0,'palette':palette,'ids':{name:n for n,name in enumerate(names)},
        'frames':[{'id':name,'pixels':index_image(pose,palette,640,keep_soft=True),'alpha':np.asarray(pose.getchannel('A')).reshape(-1).tolist()} for name,pose in zip(names,poses)],
        'motion':{'ears':False,'paws':False,'watch':{'bakedMotion':True,'sequence':sequence}}}
    write(stage/'watch-frames-640.json',hd)
    source=ROOT/'assets/poses/watch-h3-source.mp4'
    public_sha=sha(source) if source.exists() else None
    video={**manifest['source'],'file':'assets/poses/watch-h3-source.mp4','sha256':public_sha}
    report={'schemaVersion':3,'passed':True,'sourceMaster':'assets/poses/watch-h3-source.mp4',
        'sourceSha256':public_sha,'video':video,'processing':manifest['processing'],
        'canvas':manifest['canvas'],
        'reference':{'file':'assets/poses/watch-sequence/watch.png','preparation':'Original transparent reference composited over solid green before image-to-video generation; see watch-h3-provenance.json'},
        'sampling':manifest['sampling'],'samplingQC':manifest.get('samplingQC',manifest.get('qualityDiagnostic',manifest.get('qc'))),
        'manualAccepted':True,'manualAcceptanceReason':'All selected full-body frames and viewer-left hood/cape edges passed visual review at 640px and 144px. Generic cadence WARN is retained: relative speed jumps describe the authored accelerating scan, not contour or lens ghosting.',
        'frameSourceIndices':[record['sourceFrame'] for record in records],
        'sourceDurationsMs':[record['durationMs'] for record in records],
        'frameIds':names,'sequence':sequence,'blink':{**blink_metadata,'startsAtMs':open_ms,'durationMs':blink_ms},
        'pixelMouthTracking':mouth_boxes,'method':design,
        'terminalAlphaApproximation':{'wumi240':'Only outside-connected partial-alpha edge pixels are composited over the recorded dark background and mapped into the immutable indexed palette' if background is not None else '1-bit alpha coverage at 128',
            'backgroundRgb':background,'wumiPixel80':'Pixel style retains binary native-pixel coverage','opaqueInteriorsUnchanged':True,
            'nearBackgroundPaletteHandling':'On terminal edge coverage only, colors within 3 RGB levels of the chosen background map to transparent index 0; the native source alpha is not thresholded',
            'sourceAndFilmAlpha':'Native 640px RGBA and HD alpha sidecar retain all 8-bit fractional coverage; independent source mattes are 16-bit'},
        'mainSheetsSha256':original,'mainSheetsUnchanged':True,'pokeSha256':protected,'applied':args.apply}
    write(stage/'build-report.json',report)
    assert all(sha(ROOT/f'assets/reactions/{style}/reaction-sheet.json')==expected for style,expected in original.items())
    assert all(sha(ROOT/path)==expected for path,expected in protected.items())
    if args.apply:
        # Only these validated bank names can leave staging. No arbitrary
        # work directory content or source manifests are copied into the repo.
        allowed=['watch-frames.json',*[f'{name}.png' for name in names]]
        for style in assets:
            for name in allowed:shutil.copy2(stage/style/name,ROOT/f'assets/reactions/{style}'/name)
        write(ROOT/'assets/poses/watch-video-metadata.json',report)
        assert all(sha(ROOT/f'assets/reactions/{style}/reaction-sheet.json')==expected for style,expected in original.items())
        assert all(sha(ROOT/path)==expected for path,expected in protected.items())
    print(json.dumps({'passed':True,'frames':len(names),'playedFrames':len(set(step['id'] for step in steps)),
        'steps':len(steps),'periodMs':period,'bakedMotion':True,'applied':args.apply},indent=2))

if __name__=='__main__':main()
