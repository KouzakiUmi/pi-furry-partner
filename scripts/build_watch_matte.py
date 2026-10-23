#!/usr/bin/env python3
"""Extract a continuous green-luminance matte from the reviewed H3 watch video.

This is not an RGB despill/erode pass. The green signal becomes a separate
grayscale background matte; its inverse is foreground alpha. Straight RGB is
then recovered by reversing C = alpha*F + (1-alpha)*background. White fur has
G-max(R,B) near zero and therefore stays opaque. The full-canvas scale is fixed.
An opt-in local edge-color pass can suppress bright H.264 4:2:0 residuals
around an already dark opaque contour. It leaves the matte and all opaque
pixels exactly unchanged; it is not part of the inverse-compositing formula.
Requires Pillow and NumPy, and ffmpeg only when decoding the public source.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from collections import deque
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter

ROOT=Path(__file__).resolve().parents[1]

EDGE_COLOR_DECONTAMINATION={
    'version':'dark-contour-local-4px-v1',
    'method':'Opt-in local edge-color decontamination after inverse compositing',
    'maxDistancePixels':4,'reliableAlphaMinimum':.985,
    'outsideConnectivity':4,'darkContourMaximumRgb':.30,
    'minimumAllChannelBrightnessExcess':.10,'fullWeightBrightnessExcess':.28,
    'edgeMaximumRgb':.82,'edgeMaximumChroma':.23,
    'protectedBrightOrColoredSupportRadius':3,
    'alphaChanged':False,'opaqueRgbChanged':False,
    'erosion':False,'globalColorRemap':False,
}

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def _outside_connected(mask):
    """Four-connected region reachable from the canvas border, without erosion."""
    height,width=mask.shape;seen=np.zeros(mask.shape,dtype=bool);queue=deque()
    for y,x in [*((0,x) for x in range(width)),*((height-1,x) for x in range(width)),
                *((y,0) for y in range(height)),*((y,width-1) for y in range(height))]:
        if mask[y,x] and not seen[y,x]:
            seen[y,x]=True;queue.append((y,x))
    while queue:
        y,x=queue.popleft()
        for yy,xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if 0<=yy<height and 0<=xx<width and mask[yy,xx] and not seen[yy,xx]:
                seen[yy,xx]=True;queue.append((yy,xx))
    return seen


def decontaminate_dark_contour_edges(rgba):
    """Conservatively repair only bright, near-neutral outer soft-edge RGB.

    H.264 4:2:0 edges can contain a bright/dark luma pair sharing chroma.
    Inverting the green composite makes the bright member a gray rim around
    dark ink. Alpha alone cannot remove that residual: premultiplied R/B
    remain near the encoded source R/B. Use a nearby *opaque* dark contour as
    a color prior, only where every channel is anomalously brighter. This is
    an explicitly lossy local estimate, not a recovery of unknowable source
    RGB. No alpha is lowered and no opaque or interior pixel is recolored.

    Fixed pixel radii and fixed thresholds are shared by all frames. Nearby
    reliable white/paper/claw or colored/scarf pixels veto correction, as do
    isolated thin features without a reliable opaque contour. No SciPy or
    per-frame color fitting is required.
    """
    array=np.asarray(rgba)
    if array.ndim!=3 or array.shape[2]!=4:
        raise ValueError('Expected HxWx4 straight float RGBA')
    alpha=array[:,:,3];color=array[:,:,:3]
    reliable=alpha>=EDGE_COLOR_DECONTAMINATION['reliableAlphaMinimum']
    outside=_outside_connected(~reliable)
    height,width=alpha.shape
    nearest=np.zeros_like(color);distance_squared=np.full(alpha.shape,np.inf)
    protected=np.zeros(alpha.shape,dtype=bool)
    maximum=color.max(2);minimum=color.min(2)
    bright_or_colored=reliable&((minimum>=.65)|((maximum-minimum)>=.25))
    offsets=sorted((dy*dy+dx*dx,dy,dx) for dy in range(-4,5) for dx in range(-4,5)
                   if dy*dy+dx*dx<=16)
    for distance,dy,dx in offsets:
        # Each target pixel looks at a source offset; all translations are
        # integer and the deterministic tie order never changes over time.
        y0=max(0,-dy);y1=min(height,height-dy)
        x0=max(0,-dx);x1=min(width,width-dx)
        if y0>=y1 or x0>=x1:continue
        target=(slice(y0,y1),slice(x0,x1));source=(slice(y0+dy,y1+dy),slice(x0+dx,x1+dx))
        take=reliable[source]&(distance<distance_squared[target])
        distance_squared[target][take]=distance
        nearest[target][take]=color[source][take]
        if distance<=9:protected[target]|=bright_or_colored[source]
    excess=(color-nearest).min(2)
    eligible=(outside&(alpha>.005)&(~reliable)&(distance_squared<=16)
              &(nearest.max(2)<.30)&((maximum-minimum)<.23)&(maximum<.82)&(~protected))
    weight=np.clip((excess-.10)/.18,0,1)*eligible
    result=array.copy()
    result[:,:,:3]=color*(1-weight[:,:,None])+nearest*weight[:,:,None]
    changed=weight>0
    return result,{
        **EDGE_COLOR_DECONTAMINATION,'enabled':True,
        'correctedPixels':int(changed.sum()),'fullWeightPixels':int((weight>=1).sum()),
        'protectedSupportPixels':int((outside&(~reliable)&protected).sum()),
        'maximumWeight':float(weight.max(initial=0)),
        'alphaExactlyUnchanged':bool(np.array_equal(result[:,:,3],alpha)),
        'opaqueRgbExactlyUnchanged':bool(np.array_equal(result[:,:,:3][reliable],color[reliable])),
    }


def remove_distant_low_alpha_noise(rgba):
    """Explicit post-save cleanup using the reviewed alpha128/9x9 support rule.

    Accept 8-bit RGBA, matching clean_proud_affection_edges_20261021.py.
    Only alpha in (0, 128) outside the square 9x9 dilation of alpha >= 128
    is zeroed. RGB, all retained RGBA and supported soft alpha stay exact.
    This geometric rule is opt-in: it does not identify material or anatomy.
    It is independent of extract_matte and never runs by default.
    """
    array=np.asarray(rgba)
    if array.ndim!=3 or array.shape[2]!=4 or array.dtype!=np.uint8:
        raise ValueError('Expected HxWx4 uint8 RGBA after output quantization')
    alpha=array[:,:,3]
    supported=np.asarray(Image.fromarray(np.uint8(alpha>=128)*255).filter(ImageFilter.MaxFilter(9)))>0
    removed=(alpha>0)&(alpha<128)&~supported
    result=array.copy()
    result[removed,3]=0
    return result,{
        'version':'supported-alpha128-dilate9-v1','enabled':True,
        'supportAlphaMinimum':128,'supportDilationSize':9,
        'removedDistantLowAlphaPixels':int(removed.sum()),
        'allRgbExactlyUnchanged':bool(np.array_equal(result[:,:,:3],array[:,:,:3])),
        'supportedAlphaIdentical':bool(np.array_equal(result[:,:,3][supported],alpha[supported])),
        'opaqueRgbaIdentical':bool(np.array_equal(result[alpha>=248],array[alpha>=248])),
        'retainedRgbaIdentical':bool(np.array_equal(result[~removed],array[~removed])),
    }


def extract_matte(image,*,edge_decontamination=False):
    rgb=np.asarray(image.convert('RGB'),dtype=np.float64)/255
    samples=np.concatenate((rgb[:8].reshape(-1,3),rgb[-8:].reshape(-1,3),rgb[:,:8].reshape(-1,3),rgb[:,-8:].reshape(-1,3)))
    background=np.median(samples,axis=0)
    background_luma=.7152*max(1/255,background[1]-max(background[0],background[2]))
    green_luma=.7152*np.maximum(0,rgb[:,:,1]-np.maximum(rgb[:,:,0],rgb[:,:,2]))
    background_matte=np.clip(green_luma/background_luma,0,1)
    alpha=1-background_matte
    # Recover straight foreground color from the original composite. There is
    # no separate green-channel deletion/clamp, alpha cutoff, or mask erosion.
    numerator=rgb-background_matte[:,:,None]*background
    straight=np.divide(numerator,alpha[:,:,None],out=np.zeros_like(rgb),where=alpha[:,:,None]>1e-12)
    straight=np.clip(straight,0,1)
    rgba=np.dstack((straight,alpha))
    detail={'backgroundRgb':[round(v*255,4) for v in background],
        'backgroundLuminance':float(background_luma),'softAlphaPixels':int(((alpha>0)&(alpha<1)).sum()),
        'whiteFurOpaquePixels':int(((rgb.min(2)>.85)&(alpha>.98)).sum()),
        'formula':'greenLuma=0.7152*max(0,G-max(R,B)); backgroundMatte=greenLuma/backgroundGreenLuma; alpha=1-backgroundMatte; F=(C-backgroundMatte*B)/alpha'}
    if edge_decontamination:
        rgba,edge_detail=decontaminate_dark_contour_edges(rgba)
        detail['edgeColorDecontamination']=edge_detail
    return rgba,background_matte,detail

def resize_soft(rgba,size=(640,640)):
    # Resize premultiplied RGB and alpha with the same kernel. Keeping alpha
    # fractional through this step avoids dark fringes from transparent RGB.
    alpha=rgba[:,:,3];channels=[]
    for channel in range(4):
        value=rgba[:,:,channel]*alpha if channel<3 else alpha
        channels.append(np.asarray(Image.fromarray(value.astype(np.float32)).resize(size,Image.Resampling.LANCZOS)))
    a=np.clip(channels[3],0,1)
    color=np.stack(channels[:3],2)
    color=np.divide(color,a[:,:,None],out=np.zeros_like(color),where=a[:,:,None]>1e-12)
    return np.dstack((np.clip(color,0,1),a))

def save_rgba(rgba,path):Image.fromarray(np.uint8(np.rint(np.clip(rgba,0,1)*255))).save(path)
def composite(rgba,background):return Image.fromarray(np.uint8(np.rint(np.clip(rgba[:,:,:3]*rgba[:,:,3:]+np.asarray(background)[None,None,:]/255*(1-rgba[:,:,3:]),0,1)*255)))

def make_proof(raw,old,rgba,background_matte,destination):
    font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',20)
    cells=[('Source green video',raw.convert('RGB')),('Independent green-luma matte',Image.fromarray(np.uint8(np.rint(background_matte*255))).convert('RGB')),
        ('Previous key / dark',composite(np.asarray(old)/255,[11,18,30])),('New alpha / dark',composite(rgba,[11,18,30])),
        ('New alpha / light',composite(rgba,[242,244,248])),('Foreground alpha (inverse)',Image.fromarray(np.uint8(np.rint(rgba[:,:,3]*255))).convert('RGB'))]
    board=Image.new('RGB',(3*512,2*556),'#111827');draw=ImageDraw.Draw(board)
    for n,(title,im) in enumerate(cells):
        x=n%3*512;y=n//3*556;board.paste(im.resize((512,512),Image.Resampling.LANCZOS),(x,y+40));draw.text((x+14,y+10),title,font=font,fill='#dce8f6')
    board.save(destination)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--selection',type=Path,required=True)
    parser.add_argument('--raw-frames',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--proof-only',action='store_true')
    parser.add_argument('--edge-decontamination',action='store_true',
                        help='Opt in to the versioned local dark-contour RGB repair; alpha is unchanged')
    args=parser.parse_args();out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
    selection=json.loads(args.selection.read_text(encoding='utf-8'))
    raw=args.raw_frames
    if raw is None:
        raw=out/'decoded';raw.mkdir(exist_ok=True)
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(ROOT/'assets/poses/watch-h3-source.mp4'),'-fps_mode','passthrough','-start_number','0',str(raw/'watch_%05d.png')],check=True)
    selected=selection['frames'];records=[];stats=[]
    requested=[selected[0],selected[len(selected)//2],selected[-1]] if args.proof_only else selected
    for record in requested:
        index=record['sourceFrame'];image=Image.open(raw/f'watch_{index:05}.png').convert('RGB')
        rgba,matte,detail=extract_matte(image,edge_decontamination=args.edge_decontamination);small=resize_soft(rgba)
        file=record['file'];save_rgba(small,out/file)
        Image.fromarray(np.uint16(np.rint(matte*65535))).save(out/f"{Path(file).stem}-background-matte.png")
        Image.fromarray(np.uint16(np.rint((1-matte)*65535))).save(out/f"{Path(file).stem}-foreground-alpha.png")
        records.append({**record,'sha256':sha(out/file)})
        stats.append({'sourceFrame':index,**detail})
        if index in [requested[0]['sourceFrame'],requested[len(requested)//2]['sourceFrame'],requested[-1]['sourceFrame']]:
            old=Image.open(args.selection.parent/file).convert('RGBA').resize(image.size,Image.Resampling.LANCZOS)
            make_proof(image,old,rgba,matte,out/f'proof-source-{index:03}.png')
    processing={'method':'Continuous green-signal luminance to independent grayscale matte, invert for alpha, background inverse compositing for straight RGB',
        'greenSignal':'max(0,G-max(R,B)) protects white fur','matteBits':16,'rgbaAlphaBits':8,
        'hardThreshold':False,'erosion':False,'rgbDespill':False,'channelClamp':False,
        'resize':'Fixed full-canvas premultiplied Lanczos, same kernel for alpha and RGB',
        'audioIncluded':False,'interpolated':False,'reversed':False,'crossfaded':False}
    if args.edge_decontamination:
        processing['method']+='; opt-in local edge-color decontamination around reliable dark contours'
        processing['inverseRgbOnly']=False
        processing['edgeColorDecontamination']={**EDGE_COLOR_DECONTAMINATION,'enabled':True}
    manifest={**selection,'processing':processing,'frames':records}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    (out/'matte-report.json').write_text(json.dumps({'proofOnly':args.proof_only,'processing':processing,'frames':stats},indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'out':str(out),'frames':len(records),'proofOnly':args.proof_only},indent=2))

if __name__=='__main__':main()
