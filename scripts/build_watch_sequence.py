#!/usr/bin/env python3
"""Build palette-compatible whole-frame magnifier animation from a reviewed 3x2 sheet.

The original 21 frames and both palettes remain byte-for-byte untouched.
Use --apply only after reviewing the staged aligned poses/contact sheet.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from build_watch_reactions import palette_index

ROOT=Path(__file__).resolve().parents[1]
IDS=['watch','watch-blink','watch-left','watch-left-far','watch-right','watch-right-far']
SOURCE_CELLS=[0,5,1,2,3,4]
SEQUENCE={'steps':[{'id':name,'durationMs':ms} for name,ms in [
    ('watch',400),('watch-left',400),('watch-left-far',600),('watch-left',400),
    ('watch',200),('watch-blink',100),('watch',300),('watch-right',400),
    ('watch-right-far',600),('watch-right',400),('watch',400)]],'periodMs':4200}

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
def opaque_bounds(image):return Image.fromarray((np.asarray(image.getchannel('A'))>=128).astype(np.uint8)*255).getbbox()
def anchor(image):
    alpha=np.asarray(image.getchannel('A'))
    box=opaque_bounds(image);assert box,'An animation cell is empty'
    mask=alpha>=128
    mask[:round(box[1]+(box[3]-box[1])*.82)]=False
    ys,xs=np.where(mask);assert len(xs)>8,'Cannot locate a stable lower-body anchor'
    return float(xs.mean()),float(box[3])

def align(source,stage):
    image=Image.open(source).convert('RGBA')
    assert image.width%3==0 and image.height%2==0,'Expected an exact three-column, two-row source grid'
    cw,ch=image.width//3,image.height//2
    cells=[image.crop((n%3*cw,n//3*ch,(n%3+1)*cw,(n//3+1)*ch)) for n in range(6)]
    original=Image.open(ROOT/'assets/poses/watch.png').convert('RGBA')
    target_anchor=anchor(original)
    old_box=opaque_bounds(original);first_box=opaque_bounds(cells[0]);assert first_box
    previous=ROOT/'assets/poses/watch-sequence-metadata.json'
    if previous.exists():
        saved=json.loads(previous.read_text(encoding='utf-8'))['alignment']
        target_anchor=tuple(saved['bodyAnchor']);old_box=saved['referenceBounds']
    target_anchor=(target_anchor[0],min(620,target_anchor[1]))
    scale=(old_box[3]-old_box[1])/(first_box[3]-first_box[1])
    # All cells keep one scale and a vertical body baseline. Open turning poses
    # share the first cell's horizontal registration so the authored left/right
    # movement survives. Only the centered blink corrects its sampling drift.
    anchors=[anchor(cell) for cell in cells]
    horizontal_anchors=[anchors[0][0]]*5+[anchors[5][0]]
    def bounds_for(k):
        records=[]
        for cell,a,ax in zip(cells,anchors,horizontal_anchors):
            x,y=target_anchor[0]-ax*k,target_anchor[1]-a[1]*k
            box=opaque_bounds(cell);records.append([x+box[0]*k,y+box[1]*k,x+box[2]*k,y+box[3]*k])
        return records
    for _ in range(400):
        if not any(min(box[:2])<12 or max(box[2:])>628 for box in bounds_for(scale)):break
        scale*=.99
    else:raise ValueError('Cannot fit source poses in the safe 640px canvas')
    poses=[]
    for cell,a,ax in zip(cells,anchors,horizontal_anchors):
        x,y=target_anchor[0]-ax*scale,target_anchor[1]-a[1]*scale
        pose=cell.transform((640,640),Image.Transform.AFFINE,(1/scale,0,-x/scale,0,1/scale,-y/scale),Image.Resampling.BICUBIC)
        values=np.asarray(pose).copy();values[values[:,:,3]<16]=0;values[values[:,:,3]>=250,3]=255
        poses.append(Image.fromarray(values))
    ordered=[poses[cell] for cell in SOURCE_CELLS]
    for name,pose in zip(IDS,ordered):pose.save(stage/f'{name}.png')
    board=Image.new('RGB',(3*640,2*690),'#0b121e');d=ImageDraw.Draw(board)
    font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',24)
    for n,(name,pose) in enumerate(zip(IDS,ordered)):
        x=n%3*640;y=n//3*690;board.paste(pose,(x,y),pose);d.text((x+18,y+650),name,font=font,fill='#a4cdf6')
    board.save(stage/'aligned-contact.png')
    return ordered,{'sourceSize':list(image.size),'cellSize':[cw,ch],'scale':scale,'bodyAnchor':list(target_anchor),'referenceBounds':list(old_box),'horizontalRegistration':'Shared open-pose origin preserves authored movement; center blink only corrects lower-body drift','canvasSize':[640,640],'sourceCellOrder':SOURCE_CELLS}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--stage',type=Path,required=True)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args();stage=args.stage.resolve();stage.mkdir(parents=True,exist_ok=True)
    originals={style:sha(ROOT/f'assets/reactions/{style}/reaction-sheet.json') for style in ['wumi','wumi-pixel']}
    poses,alignment=align(args.source,stage)
    assets={};sheets={}
    for style,size in [('wumi',240),('wumi-pixel',80)]:
        sheet=json.loads((ROOT/f'assets/reactions/{style}/reaction-sheet.json').read_text(encoding='utf-8'));sheets[style]=sheet
        assert len(sheet['frames'])==21
        frames=[{'id':name,'pixels':palette_index(pose,sheet['palette'],size,style.endswith('pixel'))} for name,pose in zip(IDS,poses)]
        if size==80:
            from refine_pixel_lines import protect_mouth
            art=sheets['wumi'];upper=assets['wumi']
            for n,frame in enumerate(frames):
                rgb=np.asarray(art['palette'])[np.asarray(upper['frames'][n]['pixels']).reshape(240,240)]
                frames[n],_=protect_mouth(frame,rgb,sheet['palette'])
        asset={'schemaVersion':2,'width':size,'height':size,'frames':frames,'sequence':SEQUENCE,
               'motion':{'design':'Authored whole-frame left/right inspection; rigid one-pixel breathing only'},
               'paletteSha256':hashlib.sha256(json.dumps(sheet['palette'],separators=(',',':')).encode()).hexdigest()}
        assets[style]=asset;folder=stage/style;folder.mkdir(exist_ok=True);write(folder/'watch-frames.json',asset)
        palette=np.asarray(sheet['palette'],dtype=np.uint8)
        for frame in frames:
            pixels=np.asarray(frame['pixels']).reshape(size,size);rgba=np.zeros((size,size,4),dtype=np.uint8)
            rgba[:,:,:3]=palette[pixels];rgba[:,:,3]=np.where(pixels==0,0,255)
            Image.fromarray(rgba).save(folder/f"{frame['id']}.png")
    mosaic=Image.new('RGB',(640,640*len(poses)))
    for n,pose in enumerate(poses):mosaic.paste(pose.convert('RGB'),(0,n*640))
    quant=mosaic.quantize(colors=255,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    flat=quant.getpalette()[:765];palette=[[0,0,0]]+[flat[n:n+3] for n in range(0,len(flat),3)]
    hd={'width':640,'height':640,'transparentIndex':0,'palette':palette,'ids':{name:n for n,name in enumerate(IDS)},
        'frames':[{'id':name,'pixels':palette_index(pose,palette,640)} for name,pose in zip(IDS,poses)],
        'motion':{'ears':False,'paws':False,'watch':{'sequence':SEQUENCE}}}
    write(stage/'watch-frames-640.json',hd)
    report={'passed':True,'source':args.source.name,'sourceSha256':sha(args.source),'alignment':alignment,
            'frameIds':IDS,'sequence':SEQUENCE,'method':'Six authored whole frames, no lens/paw/head inverse deformation',
            'mainSheetsSha256':originals,'mainSheetsUnchanged':True,'applied':args.apply}
    write(stage/'build-report.json',report)
    assert all(sha(ROOT/f'assets/reactions/{style}/reaction-sheet.json')==expected for style,expected in originals.items())
    if args.apply:
        for style in assets:
            for path in (stage/style).iterdir():shutil.copy2(path,ROOT/f'assets/reactions/{style}'/path.name)
        masters=ROOT/'assets/poses/watch-sequence';masters.mkdir(exist_ok=True)
        for name in IDS:shutil.copy2(stage/f'{name}.png',masters/f'{name}.png')
        report['sourceMaster']='assets/poses/watch-sequence-generated.png'
        report['frameDirectory']='assets/poses/watch-sequence'
        write(ROOT/'assets/poses/watch-sequence-metadata.json',report)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
