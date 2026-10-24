#!/usr/bin/env python3
"""Rig the authored cupped-ear listening pose without rebuilding source sheets."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
from build_watch_reactions import palette_index,normalize
from build_wumi_reactions import clean_pose,bezier,line,keep_alpha

ROOT=Path(__file__).resolve().parents[1]
POSES=ROOT/'assets/poses'


def motion():
    return {'head':normalize({'polygon':[[22,83],[87,55],[166,82],[272,51],[371,23],[408,157],[450,295],[421,345],[359,384],[250,411],[160,378],[127,393],[104,369],[51,379],[20,348],[30,290],[64,246]],'pivot':[246,403],'padding':20}),
            'ears':[normalize({'polygon':[[25,174],[64,84],[155,106],[154,165],[101,216]],'pivot':[145,199],'padding':10}),
                    normalize({'polygon':[[279,93],[366,35],[394,139],[365,205],[310,178]],'pivot':[316,183],'padding':10})],
            'periodMs':2400,'design':'Cupped gray paw beside ear, gentle upper-body nod and ear twitch; resting paw remains planted'}


def closed_eyes(base):
    result=base.copy();clean=clean_pose('neutral-eyes-clean.png')
    eyes=[('left',[(174,279),(184,264),(202,254),(225,253),(243,266),(250,289),(245,322),(235,334),(200,335),(184,320),(174,300)],(217,296),49),
          ('right',[(294,247),(299,231),(315,220),(338,219),(354,232),(364,251),(359,281),(346,299),(311,301),(299,285)],(326,264),44)]
    windows={'left':(214,252,245,294),'right':(337,253,375,298)}
    for name,polygon,center,width in eyes:
        x0=min(p[0]for p in polygon);x1=max(p[0]for p in polygon);y0=min(p[1]for p in polygon);y1=max(p[1]for p in polygon)
        sx0,sy0,sx1,sy1=windows[name];scale_x=(sx1-sx0)/(x1-x0);scale_y=(sy1-sy0)/(y1-y0)
        donor=clean.transform(base.size,Image.Transform.AFFINE,(scale_x,0,sx0-x0*scale_x,0,scale_y,sy0-y0*scale_y),Image.Resampling.BICUBIC)
        mask=Image.new('L',base.size);ImageDraw.Draw(mask).polygon(polygon,fill=255)
        expanded=mask.filter(ImageFilter.MaxFilter(5));soft=expanded.filter(ImageFilter.GaussianBlur(1.2))
        mask=Image.fromarray(np.minimum(np.asarray(expanded),np.asarray(soft)));result.paste(donor,(0,0),mask)
    draw=ImageDraw.Draw(result)
    for name,polygon,(cx,cy),width in eyes:
        points=bezier([(-width*.46,-4),(-width*.25,13),(width*.25,13),(width*.46,-4)])
        angle=-.28;cos=math.cos(angle);sin=math.sin(angle)
        points=[(cx+x*cos-y*sin,cy+x*sin+y*cos)for x,y in points]
        line(draw,points,(37,44,53,255),5)
    return keep_alpha(base,result)


def main(source,hd_output):
    original=POSES/'listen-generated.png'
    if source:original.write_bytes(source.read_bytes())
    image=Image.open(original).convert('RGBA');rgba=np.array(image)
    sub=rgba[610:665,680:760];ys,xs=np.where((sub[:,:,:3].max(axis=2)<80)&(sub[:,:,3]>240))
    nose=[float(xs.mean()+680),float(ys.mean()+610)];scale=.46;offset=[288-nose[0]*scale,318-nose[1]*scale]
    rgba[rgba[:,:,3]<16]=0;rgba[rgba[:,:,3]>=250,3]=255;image=Image.fromarray(rgba)
    canonical=image.transform((640,640),Image.Transform.AFFINE,(1/scale,0,-offset[0]/scale,0,1/scale,-offset[1]/scale),Image.Resampling.BICUBIC)
    closed=closed_eyes(canonical);canonical.save(POSES/'listen.png');closed.save(POSES/'listen-blink.png')
    report={'source':'listen-generated.png','sha256':hashlib.sha256(original.read_bytes()).hexdigest(),'sourceSize':list(image.size),'sourceNose':nose,'scale':scale,'pasteOffset':offset,'noseAnchor':[288,318],'width':640,'height':640,'motion':motion(),'alphaBounds':canonical.getbbox(),'mainSheetsUnchanged':True,'styles':[]}
    for style,size in (('wumi',240),('wumi-pixel',80)):
        directory=ROOT/'assets/reactions'/style;sheet=json.loads((directory/'reaction-sheet.json').read_text(encoding='utf-8'))
        frames=[{'id':name,'pixels':palette_index(im,sheet['palette'],size,style.endswith('pixel'))}for name,im in (('listen',canonical),('listen-blink',closed))]
        asset={'schemaVersion':1,'width':size,'height':size,'frames':frames,'motion':motion(),'paletteSha256':hashlib.sha256(json.dumps(sheet['palette'],separators=(',',':')).encode()).hexdigest()}
        (directory/'listen-frames.json').write_text(json.dumps(asset,separators=(',',':'))+'\n',encoding='utf-8')
        for frame in frames:
            arr=np.asarray(frame['pixels']).reshape(size,size);display=np.zeros((size,size,4),dtype=np.uint8);display[:,:,:3]=np.asarray(sheet['palette'],dtype=np.uint8)[arr];display[:,:,3]=np.where(arr==0,0,255)
            Image.fromarray(display).save(directory/f"{frame['id']}.png")
        report['styles'].append({'style':style,'width':size,'paletteSize':len(sheet['palette']),'frameCount':2})
    if hd_output:
        mosaic=Image.new('RGB',(640,1280));mosaic.paste(canonical.convert('RGB'),(0,0));mosaic.paste(closed.convert('RGB'),(0,640))
        flat=mosaic.quantize(colors=255,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).getpalette()[:765];palette=[[0,0,0]]+[flat[i:i+3]for i in range(0,len(flat),3)]
        data={'width':640,'height':640,'transparentIndex':0,'palette':palette,'ids':{'listen':0,'listen-blink':1},'frames':[{'id':name,'pixels':palette_index(im,palette,640)}for name,im in (('listen',canonical),('listen-blink',closed))],'motion':{'ears':False,'paws':False,'listen':motion()}}
        hd_output.parent.mkdir(parents=True,exist_ok=True);hd_output.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
    from refine_pixel_lines import refine
    refine()
    (POSES/'listen-metadata.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path);parser.add_argument('--hd-output',type=Path);args=parser.parse_args();main(args.source,args.hd_output)
