#!/usr/bin/env python3
"""Split the approved nine-cell master; pack Pi palettes and DSH soft-alpha poses.

No generated/redrawn eyes, nails or limbs. All expressions come from one master.
New full-canvas inputs preserve authored color and proportions.  Only uniform
canvas resize/padding is permitted; the rejected material/aspect experiment is
never part of production.
"""
from pathlib import Path
import argparse
import copy
import json, hashlib
import shutil
from collections import deque
import numpy as np
from PIL import Image, ImageDraw
from build_watch_reactions import palette_index
from expression_publication import (SOURCE_NATIVE_PROCESSING, assert_no_withdrawal,
                                    normalize_full_canvas, source_native_geometry_metrics)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'Hi-Res/sources/expression-keyframes-20261018/Umi-nine-expressions-approved.png'
NAMES = ['joy','grumpy','sad','cry','shy','flustered','surprise','proud','affection']


def components(mask):
    seen = np.zeros(mask.shape, bool); result = []
    h,w = mask.shape
    for y,x in zip(*np.where(mask)):
        if seen[y,x]: continue
        todo=deque([(int(x),int(y))]); seen[y,x]=True; pts=[]
        while todo:
            px,py=todo.popleft(); pts.append((px,py))
            for nx,ny in [(px-1,py),(px+1,py),(px,py-1),(px,py+1)]:
                if 0<=nx<w and 0<=ny<h and mask[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx]=True; todo.append((nx,ny))
        result.append(pts)
    return sorted(result,key=len,reverse=True)


def clean_crop(image, name):
    a=np.asarray(image).copy(); groups=components(a[:,:,3]>32)
    keep=np.zeros(a.shape[:2],bool)
    for i,pts in enumerate(groups):
        xs,ys=zip(*pts); w=max(xs)-min(xs)+1; h=max(ys)-min(ys)+1
        # Retain floating hearts/sparkles/sweat, reject neighboring-cell scraps.
        cx=(min(xs)+max(xs))/2;cy=(min(ys)+max(ys))/2
        symbol = (name=='surprise' and cx<75 and 80<cy<250 or
                  name=='proud' and cx<75 and 80<cy<260 or
                  name=='affection' and (cx<85 or cx>340) and 60<cy<285 or
                  name=='flustered' and cx>320 and 70<cy<240 or
                  name in ['sad','cry'] and 100<cx<325 and 170<cy<300)
        if i==0 or symbol and len(pts)>=24 and h>=5 and w>=3:
            keep[np.asarray(ys),np.asarray(xs)]=True
    # Keep antialiased outline adjacent to accepted opaque connected components.
    from PIL import ImageFilter
    keep=np.asarray(Image.fromarray(keep.astype('uint8')*255).filter(ImageFilter.MaxFilter(3)))>0
    a[~keep]=0
    return Image.fromarray(a),groups[0]


def nose(image):
    a=np.asarray(image); rgb=a[:,:,:3]
    window=(rgb[208:265,188:240].max(axis=2)<130)&(a[208:265,188:240,3]>200)
    choices=[]
    for pts in components(window):
        xs,ys=zip(*pts); w=max(xs)-min(xs)+1;h=max(ys)-min(ys)+1
        if 5<=w<=23 and 2<=h<=13 and len(pts)>=12:
            choices.append((abs((min(xs)+max(xs))/2-22)+abs((min(ys)+max(ys))/2-24)*.4,pts))
    if not choices: raise ValueError('Nose anchor not found')
    pts=min(choices,key=lambda v:v[0])[1]
    return [float(np.mean([p[0]for p in pts])+188),float(np.mean([p[1]for p in pts])+208)]


def preserve_native_cell(image, path):
    """A recalibration must never replace the preserved approved cell."""
    if path.exists():
        with Image.open(path) as previous:
            if previous.convert('RGBA').size != image.size or previous.convert('RGBA').tobytes() != image.tobytes():
                raise ValueError(f'Native expression cell differs; refusing to overwrite preserved artwork: {path}')
    else:
        image.save(path)


def prepare_keyframe(image):
    normalized = normalize_full_canvas(np.asarray(image.convert('RGBA'), dtype=np.float64) / 255)
    margin = source_native_geometry_metrics(normalized)
    if not margin['withinMargin']:
        raise ValueError(f'Authored expression violates the visible canvas margin: {margin}')
    return Image.fromarray(np.uint8(np.rint(normalized * 255))), margin


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path,
                        help='Nine approved emotion-ID.png full-canvas sources; uniform canvas resize only')
    args=parser.parse_args()
    source_dir=args.source_dir.resolve() if args.source_dir else None
    assert_no_withdrawal(source_dir if source_dir else SOURCE.parent)
    master=None if source_dir else Image.open(SOURCE).convert('RGBA')
    if master is not None: assert master.size==(1254,1254)
    source_files={name:source_dir/f'emotion-{name}.png' for name in NAMES} if source_dir else {}
    if source_dir:
        if any(not path.is_file() for path in source_files.values()):
            raise ValueError('Full-canvas input requires all nine emotion-ID.png files')
        sizes=set()
        for path in source_files.values():
            assert_no_withdrawal(path.resolve().parent)
            with Image.open(path) as opened: sizes.add(opened.size)
        if len(sizes)!=1: raise ValueError('Nine full-canvas sources must share one canvas size')
    poses=ROOT/'assets/poses/expressions'; poses.mkdir(parents=True,exist_ok=True)
    hd=ROOT/'Hi-Res/poses-640'; hd.mkdir(parents=True,exist_ok=True)
    native=SOURCE.parent/'cells'
    normalized_archive=SOURCE.parent/'normalized-precalibration-640'
    if not source_dir:
        native.mkdir(exist_ok=True); normalized_archive.mkdir(exist_ok=True)
    row_edges=[(0,418),(415,834),(832,1254)]; col_edges=[(0,420),(418,838),(835,1254)]
    # Match the neutral face's scale rather than fitting by a raised paw or icon.
    scale=1.24; baseline=602
    source_hashes={name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in source_files.items()}
    bundle_hash=hashlib.sha256(''.join(f'{name}:{source_hashes[name]}\n' for name in sorted(source_hashes)).encode()).hexdigest() if source_dir else None
    report={'source':'individual-full-canvas-keyframes' if source_dir else SOURCE.name,
            'sourceSha256':bundle_hash if source_dir else hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            'sourceSize':list(next(iter(sizes))) if source_dir else list(master.size),
            'scale':min(640/next(iter(sizes))[0],640/next(iter(sizes))[1]) if source_dir else scale,
            'baselineY':baseline,
            'alignment':'uniform full-canvas resize; authored anchors preserved' if source_dir else 'legacy uniform face scale; nose x=288; grounded paw baseline=602',
            'processing':copy.deepcopy(SOURCE_NATIVE_PROCESSING),
            'art':'ARR','poses':{}}
    if source_dir:
        archive=ROOT/f'Hi-Res/sources/expression-keyframes-{bundle_hash[:12]}/full-canvas'
        assert_no_withdrawal(archive,archive.parent)
        archive.mkdir(parents=True,exist_ok=True)
        report['sourceFiles']={}
        for name,path in source_files.items():
            target=archive/f'emotion-{name}.png'
            if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()!=source_hashes[name]:
                raise ValueError(f'Preserved full-canvas source changed: {target}')
            if not target.exists(): shutil.copy2(path,target)
            report['sourceFiles'][name]={'file':target.relative_to(ROOT).as_posix(),'sha256':source_hashes[name]}
    else: report['normalizedPrecalibrationDirectory']=normalized_archive.relative_to(ROOT).as_posix()
    images={}
    for i,name in enumerate(NAMES):
        key=f'emotion-{name}'
        if source_dir:
            with Image.open(source_files[name]) as opened: im,margin=prepare_keyframe(opened)
            detail={'sourceFile':source_files[name].name,'sourceSha256':source_hashes[name],
                    'canvasTransform':copy.deepcopy(SOURCE_NATIVE_PROCESSING)}
        else:
            r,c=divmod(i,3);x0,x1=col_edges[c];y0,y1=row_edges[r]
            crop,main_group=clean_crop(master.crop((x0,y0,x1,y1)),name)
            preserve_native_cell(crop,native/f'{key}.png')
            nx,ny=nose(crop)
            main_bottom=max(y for x,y in main_group)
            dx=288-nx*scale;dy=baseline-main_bottom*scale
            im=crop.transform((640,640),Image.Transform.AFFINE,
                (1/scale,0,-dx/scale,0,1/scale,-dy/scale),Image.Resampling.BICUBIC)
            normalized_path=normalized_archive/f'{key}.png'
            preserve_native_cell(im,normalized_path)
            im,margin=prepare_keyframe(im)
            detail={'sourceBox':[x0,y0,x1,y1],'sourceNose':[nx,ny],
                    'nose':[288,round(ny*scale+dy,3)],'scale':scale,
                    'effectiveScaleXY':[scale,scale],'pasteOffset':[dx,dy],
                    'normalizedPrecalibrationFile':normalized_path.relative_to(ROOT).as_posix(),
                    'normalizedPrecalibrationSha256':hashlib.sha256(normalized_path.read_bytes()).hexdigest()}
        box=im.getbbox();assert box and box[0]>=0 and box[2]<=640 and box[3]<630, (name,box)
        images[key]=im
        im.save(poses/f'{key}.png');im.save(hd/f'{key}.png')
        report['poses'][key]={**detail,'bounds':box,'geometryMargin':margin}
    for style,size in [('umi',240)]:
        folder=ROOT/'assets/reactions'/style
        sheet=json.loads((folder/'reaction-sheet.json').read_text(encoding='utf-8'))
        palette=[list(c)for c in sheet['palette']]
        # Append rather than repurpose the old palette: all old frame indices
        # retain their exact colors. New warm icons are not forced into grays.
        colors=[[246,186,9],[255,221,61],[197,140,22],[255,65,92],[248,100,124],[239,25,47],[255,171,191],[255,242,227]]
        mosaic=Image.new('RGB',(288,288))
        for i,im in enumerate(images.values()):mosaic.paste(im.convert('RGB').resize((96,96)),((i%3)*96,(i//3)*96))
        quant=mosaic.quantize(colors=24,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
        flat=quant.getpalette()[:72];colors += [flat[i:i+3]for i in range(0,len(flat),3)]
        for color in colors:
            if color not in palette:palette.append(color)
        frames=[]
        for key,im in images.items():
            # Area sampling retains tiny pointed nails and mouth lines at 80px.
            small=im.resize((size,size),Image.Resampling.BOX if size==80 else Image.Resampling.LANCZOS)
            pixels=palette_index(small,palette,size,False)
            frames.append({'id':key,'pixels':pixels})
            a=np.asarray(pixels).reshape(size,size);pal=np.asarray(palette,dtype=np.uint8)
            preview=np.zeros((size,size,4),np.uint8);preview[:,:,:3]=pal[a];preview[:,:,3]=np.where(a==0,0,255)
            Image.fromarray(preview).save(folder/f'{key}.png')
        asset={'schemaVersion':1,'width':size,'height':size,'palette':palette,'frames':frames,
               'sourceSha256':report['sourceSha256'],'baselineY':baseline/640,
               'processing':copy.deepcopy(SOURCE_NATIVE_PROCESSING)}
        (folder/'expression-frames.json').write_text(json.dumps(asset,separators=(',',':'))+'\n',encoding='utf-8')
    (poses/'metadata.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    review=Image.new('RGB',(960,1010),'#141b27');d=ImageDraw.Draw(review)
    for i,(key,im) in enumerate(images.items()):
        r,c=divmod(i,3);t=im.resize((310,310),Image.Resampling.LANCZOS)
        review.paste(t,(c*320,r*335),t);d.text((c*320+15,r*335+312),key,fill='white')
    review.save(poses/'review.jpg',quality=94)
    print(json.dumps({'poses':len(images),'scale':report['scale'],'sourceNative':True,'output':str(poses)},ensure_ascii=False))


if __name__=='__main__':main()
