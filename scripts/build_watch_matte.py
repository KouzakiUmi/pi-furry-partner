#!/usr/bin/env python3
"""Extract a continuous green-luminance matte from the reviewed H3 watch video.

This is not an RGB despill/erode pass. The green signal becomes a separate
grayscale background matte; its inverse is foreground alpha. Straight RGB is
then recovered by reversing C = alpha*F + (1-alpha)*background. White fur has
G-max(R,B) near zero and therefore stays opaque. The full-canvas scale is fixed.
Requires Pillow and NumPy, and ffmpeg only when decoding the public source.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def extract_matte(image):
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
    return rgba,background_matte,{'backgroundRgb':[round(v*255,4) for v in background],
        'backgroundLuminance':float(background_luma),'softAlphaPixels':int(((alpha>0)&(alpha<1)).sum()),
        'whiteFurOpaquePixels':int(((rgb.min(2)>.85)&(alpha>.98)).sum()),
        'formula':'greenLuma=0.7152*max(0,G-max(R,B)); backgroundMatte=greenLuma/backgroundGreenLuma; alpha=1-backgroundMatte; F=(C-backgroundMatte*B)/alpha'}

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
        rgba,matte,detail=extract_matte(image);small=resize_soft(rgba)
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
    manifest={**selection,'processing':processing,'frames':records}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    (out/'matte-report.json').write_text(json.dumps({'proofOnly':args.proof_only,'processing':processing,'frames':stats},indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'out':str(out),'frames':len(records),'proofOnly':args.proof_only},indent=2))

if __name__=='__main__':main()
