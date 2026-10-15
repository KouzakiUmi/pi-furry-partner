#!/usr/bin/env python3
"""Preserve the existing Umi pixel derivative and protect tiny mouth strokes.

Only the original mouth ROIs use coverage-aware sampling from the authored
240px frames. The 80px alpha, face/garment geometry, eye shapes, frame IDs and
motion metadata are unchanged. Sparse warm mouth lines snap to one target
pixel rather than disappearing between nearest-neighbor sample centers.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
PIXEL=ROOT/'assets/reactions/wumi-pixel'
ART=ROOT/'assets/reactions/wumi'


def read(path):return json.loads(path.read_text(encoding='utf-8'))
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
def palette_sha(palette):return hashlib.sha256(json.dumps(palette,separators=(',',':')).encode()).hexdigest()
def rgb_frame(sheet,frame):return np.asarray(sheet['palette'])[np.asarray(frame['pixels']).reshape(sheet['height'],sheet['width'])]


def refine_palette(palette):
    # Almost-identical cool contour shades are grouped; fur, eyes, blush and
    # accent colors remain exact. Blues gain only 2–3 points of saturation.
    changes={(127,167,224):(124,167,227),(114,165,237):(111,165,239),
             (105,161,237):(102,161,239),(76,111,164):(73,110,166),
             (72,84,108):(69,83,108),(69,83,107):(69,83,108),
             (68,81,104):(69,83,108),(66,77,100):(64,76,99),
             (61,73,96):(64,76,99)}
    return [list(changes.get(tuple(color),tuple(color))) for color in palette]


def mouth_box(name):
    if name.startswith('think'):return (35,41,39,44)
    if name.startswith('talk'):return (33,41,41,47)
    if name.startswith('happy'):return (32,41,43,47)
    if name.startswith('wait'):return (32,41,41,44)
    if name.startswith('listen'):return (32,41,41,45)
    return (32,41,41,45 if name=='error' else 44)


def protect_mouth(frame,source_rgb,palette):
    name=frame['id'];original=np.asarray(frame['pixels'],dtype=np.uint8).reshape(80,80)
    if name=='search':return frame,0
    result=original.copy();left,top,right,bottom=mouth_box(name)
    opened=name in ['talk-medium','talk-wide','talk-blink','happy','happy-blink']
    if not opened:
        # Follow the original fine centerline inside its existing mouth box.
        # Coverage sums retain a source line even when the center of its 3×3
        # output cell lands on white fur. Paw/hood sampling is excluded by ROI.
        if name in ['talk-closed','talk-small','poke']:bottom=44
        columns=[]
        for x in range(left,right):
            block=source_rgb[top*3:bottom*3,x*3:(x+1)*3].astype(float)
            luminance=block.mean(axis=2);weight=np.maximum(0,(240-luminance)/140)
            weight[(block[:,:,0]<block[:,:,2]*.80)|(luminance>220)]=0
            total=float(weight.sum())
            if total<.7:continue
            ys=np.broadcast_to(np.arange(top*3,bottom*3)[:,None],weight.shape)
            columns.append((x,float((ys*weight).sum()/total)))
        if columns:
            # Remove the old pale transition fragments only in the same small
            # opaque mouth ROI, so the strengthened line leaves no ghost dots.
            for y in range(top,bottom):
                for x in range(left,right):
                    r,g,b=palette[int(original[y,x])]
                    if original[y,x] and max(r,g,b)<242 and r>=b*.80:result[y,x]=3
            low=min(y for _,y in columns);high=max(y for _,y in columns)
            for x,sy in columns:
                y=int(sy/3+.5)
                if name in ['talk-closed','poke'] and high-low<2:
                    # The W's two lobes are subpixel-high in the 240px master.
                    # Preserve that original curvature as one native-pixel
                    # depth instead of flattening both lobes into a dash.
                    y=int(low//3)+(1 if sy>low+(high-low)*.65 else 0)
                if name=='talk-small':y=42
                y=max(top,min(bottom-1,y))
                if original[y,x]:result[y,x]=46
    else:
        for y in range(top,bottom):
            for x in range(left,right):
                if not original[y,x]:continue
                block=source_rgb[y*3:(y+1)*3,x*3:(x+1)*3].astype(float)
                luminance=block.mean(axis=2);weight=np.maximum(0,(235-luminance)/140)
                weight[(block[:,:,0]<block[:,:,2]*.8)|(luminance>205)|(block[:,:,0]>195)]=0
                if weight.sum()>=1.2:result[y,x]=47
                tongue=(block[:,:,0]>200)&((block[:,:,0]-block[:,:,1])>45)&(block[:,:,2]<205)
                if tongue.sum()>=2:result[y,x]=41
        if name=='talk-wide':
            # The master's tiny upper-right fang falls between sample centers.
            # Put its one-pixel tip inside the opening, preserving the outer
            # lip instead of cutting a white notch through that silhouette.
            result[44,38]=38
    assert np.array_equal(result==0,original==0),'Mouth repair must preserve silhouette alpha.'
    return {'id':name,'pixels':result.reshape(-1).tolist()},int(np.count_nonzero(result!=original))


def decode(data,frame):
    image=Image.new('RGBA',(80,80));image.putdata([(*data['palette'][i],255) if i else (0,0,0,0) for i in frame['pixels']]);return image


def refine(previews=False):
    data=read(PIXEL/'reaction-sheet.json');before=copy.deepcopy(data)
    assert (data['width'],data['height'],len(data['palette']),len(data['frames']))==(80,80,48,21)
    source=read(ART/'reaction-sheet.json');data['palette']=refine_palette(data['palette'])
    changes={}
    for i,frame in enumerate(data['frames']):
        rgb=rgb_frame(source,source['frames'][source['ids'][frame['id']]])
        data['frames'][i],changes[frame['id']]=protect_mouth(frame,rgb,data['palette'])
    assert data['motion']==before['motion'] and data['ids']==before['ids']
    write(PIXEL/'reaction-sheet.json',data)
    for f in data['frames']:decode(data,f).save(PIXEL/f"{f['id']}.png")
    auxiliary_before={};auxiliary_after={}
    for name in ['watch','listen']:
        path=PIXEL/f'{name}-frames.json'
        if not path.exists():continue
        asset=read(path);auxiliary_before[name]=copy.deepcopy(asset);original=read(ART/f'{name}-frames.json')
        for i,f in enumerate(asset['frames']):
            asset['frames'][i],changes[f['id']]=protect_mouth(f,rgb_frame(source,original['frames'][i]),data['palette'])
            decode(data,asset['frames'][i]).save(PIXEL/f"{f['id']}.png")
        asset['paletteSha256']=palette_sha(data['palette']);write(path,asset);auxiliary_after[name]=asset
    # Keep the >w< expression sparse and relative to the repaired idle face.
    patch_path=PIXEL/'poke-patch.json'
    if patch_path.exists():
        patch=read(patch_path);base_before=before['frames'][before['ids']['idle-open']]['pixels']
        poked=base_before.copy()
        for index,color in patch['pixels']:poked[index]=color
        from build_wumi_reactions import blink,mouth
        metadata=read(ROOT/'assets/poses/metadata.json')['poses']['neutral']
        base=Image.open(ROOT/'assets/poses/neutral.png').convert('RGBA')
        source_poke=mouth(blink(base,metadata['eyes'],squeezed=True),metadata['mouth'],'closed').resize((240,240),Image.Resampling.LANCZOS)
        f,changes['poke']=protect_mouth({'id':'poke','pixels':poked},np.asarray(source_poke)[:,:,:3],data['palette'])
        base_after=data['frames'][data['ids']['idle-open']]['pixels']
        patch['pixels']=[[i,value] for i,value in enumerate(f['pixels']) if value!=base_after[i]];write(patch_path,patch)
    report={'passed':True,'method':'Original 80px character, small mouth-ROI coverage protection from the 240px master; original reference pink pixel line',
            'paletteSize':48,'baseFrames':21,'runtimeFrames':26,'alphaGeometryIdsAndMotionPreserved':True,'mouthChangedPixels':changes,
            'subtleContourPaletteGroups':9,'mouthColor':[228,136,148],'originalPixelReference':'User supplied original pixel portrait',
            'outputSheetSha256':hashlib.sha256((PIXEL/'reaction-sheet.json').read_bytes()).hexdigest()}
    scratch=ROOT/'work/pixel-line-refine';scratch.mkdir(parents=True,exist_ok=True);write(scratch/'validation.json',report)
    if previews:comparison(before,data,auxiliary_before,auxiliary_after)
    return report


def comparison(before,after,old_extra,new_extra):
    output=ROOT.parent/'Umi-Interaction-Preview';output.mkdir(parents=True,exist_ok=True)
    font=lambda size:ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',size)
    names=['talk-closed','talk-small','talk-medium','talk-wide','idle-open','think']
    im=Image.new('RGB',(1530,650),'#101827');d=ImageDraw.Draw(im)
    d.text((20,14),'原角色保形补线 · 嘴部覆盖率采样 / Faithful mouth-line repair',font=font(24),fill='#e0ecfc')
    d.text((20,54),'保留原有角色、原80像素轮廓与五官；让缩小后丢失的嘴线回到1像素清晰度。',font=font(17),fill='#98b5d1')
    for i,name in enumerate(names):
        x=15+i*253;d.text((x+8,96),name,font=font(16),fill='#d7e9fa')
        for data,y,label in [(before,132,'旧 / Before'),(after,370,'补线 / After')]:
            art=decode(data,data['frames'][data['ids'][name]]).crop((30,38,46,50)).resize((240,180),Image.Resampling.NEAREST)
            im.paste(art,(x,y),art);d.text((x+10,y+190),label,font=font(17),fill='#9dbbd8')
    im.save(output/'Umi-pixel-mouth-lines-comparison.png')
    im=Image.new('RGB',(1460,790),'#101827');d=ImageDraw.Draw(im)
    d.text((25,18),'Umi · 原造型小幅补线 / Faithful pixel touchup',font=font(26),fill='#e0ecfc')
    d.text((25,60),'原画比例、发型、眼形、衣服、动作与透明轮廓保持；修细线丢失，蓝色仅微增饱和。',font=font(17),fill='#98b5d1')
    for i,name in enumerate(['idle-open','think','watch','listen']):
        x=20+i*360;d.text((x+15,108),name,font=font(20),fill='#d7e9fa')
        for data,extra,y,label in [(before,old_extra,145,'旧 / Before'),(after,new_extra,454,'补线 / After')]:
            f=extra[name]['frames'][0] if name in extra else data['frames'][data['ids'][name]]
            art=decode(data,f).resize((280,280),Image.Resampling.NEAREST);im.paste(art,(x+25,y),art)
            d.text((x+25,y+274),label,font=font(16),fill='#98b5d1')
    im.save(output/'Umi-pixel-faithful-comparison.png')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--previews',action='store_true');args=parser.parse_args()
    print(json.dumps(refine(previews=args.previews),ensure_ascii=False,indent=2))
