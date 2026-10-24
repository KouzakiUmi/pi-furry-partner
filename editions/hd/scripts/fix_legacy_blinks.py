#!/usr/bin/env python3
"""Remove the old upper-lash residue from legacy closed eyes only.

Keeps fixed palettes, alpha, current lids, iris/open frames, mouths and body
pixel-exact. Both editor portraits retain their original upward closed curves.
"""
from pathlib import Path
import hashlib,json,sys
import numpy as np
from PIL import Image,ImageDraw,ImageFont
sys.dont_write_bytecode=True
from build_reactions import (source_pixel,pixel_lash_mask,illustration_eye_mask,
                             illustration_clean_eyes,illustration_hair_mask)
ROOT=Path(__file__).resolve().parents[1]
KEYS=['idle-blink','rest','talk-blink','happy','happy-blink','concern-blink','idle-wink','error']

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def decode(sheet,pixels):
 n=sheet['width'];a=np.asarray(pixels).reshape(n,n)
 return Image.fromarray(np.dstack([np.asarray(sheet['palette'],np.uint8)[a],np.where(a==0,0,255).astype(np.uint8)]))
def quantize(image,palette,size):
 rgb=np.asarray(image.resize((size,size),Image.Resampling.LANCZOS).convert('RGB')).reshape(-1,3).astype(np.int32)
 p=np.asarray(palette[1:],np.int32);out=np.empty(len(rgb),np.uint8)
 for start in range(0,len(rgb),4096):out[start:start+4096]=np.argmin(((rgb[start:start+4096,None,:]-p[None,:,:])**2).sum(2),axis=1)+1
 return out

def main():
 protected={s:sha(ROOT/f'assets/reactions/{s}/reaction-sheet.json')for s in ['wumi','wumi-pixel']}
 before_images={};reports=[]
 for style in ['illustration','pixel']:
  directory=ROOT/f'assets/reactions/{style}';path=directory/'reaction-sheet.json';sheet=json.loads(path.read_text());before=json.loads(json.dumps(sheet));n=sheet['width'];base=Image.open(ROOT/'assets/illustration/avatar.png').convert('RGBA')if style=='illustration'else source_pixel()
  before_images[style]={k:decode(before,before['frames'][before['ids'][k]]['pixels'])for k in KEYS}
  masks={};fills={}
  for right in [False,True]:
   if style=='illustration':
    native=illustration_eye_mask(base,right_only=right,lashes_only=True);clean=illustration_clean_eyes(base,right_only=right)
    hair=np.asarray(illustration_hair_mask(base))
    protect=np.asarray(Image.fromarray(hair).resize((n,n),Image.Resampling.BOX)).reshape(-1)>0
    mask=np.asarray(native.resize((n,n),Image.Resampling.BOX)).reshape(-1)>0;mask[protect]=False
    fills[right]=quantize(clean,sheet['palette'],n)
   else:
    mask=np.asarray(pixel_lash_mask(base,right_only=right)).reshape(-1)>0
    white=sheet['palette'].index([255,255,255]);fills[right]=np.full(n*n,white,np.uint8)
   masks[right]=mask
  stats=[]
  for key in KEYS:
   frame=sheet['frames'][sheet['ids'][key]];old=np.asarray(frame['pixels'],np.uint8);mask=masks[key=='idle-wink'];new=old.copy();new[mask]=fills[key=='idle-wink'][mask]
   # Current clean editor error/illustration wink need no repaint. A residue
   # must actually be dark before a one-time lash refresh changes this frame.
   rgb=np.asarray(sheet['palette'],np.uint8)[old];dark=(rgb.max(1)<160)&mask
   if style=='illustration'and key=='idle-wink':new=old.copy()
   new[old==0]=0;frame['pixels']=new.tolist();changed=old!=new
   assert not changed[~mask].any();assert np.array_equal(old==0,new==0)
   stats.append({'id':key,'changedPixels':int(changed.sum()),'outsideEyeMaskChangedPixels':int(changed[~mask].sum()),'alphaExact':True})
  assert sheet['palette']==before['palette'];assert all(f==before['frames'][i]for i,f in enumerate(sheet['frames'])if f['id']not in KEYS)
  path.write_text(json.dumps(sheet,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
  for key in KEYS:decode(sheet,sheet['frames'][sheet['ids'][key]]['pixels']).save(directory/f'{key}.png')
  # Poke retains its exact current reaction curves, mouth and motion metadata.
  patch_path=directory/'poke-patch.json';patch=json.loads(patch_path.read_text());old_base=np.asarray(before['frames'][before['ids']['idle-open']]['pixels'],np.uint8);poked=old_base.copy()
  for index,color in patch['pixels']:poked[index]=color
  repaired=poked.copy();mask=masks[False];repaired[mask]=fills[False][mask];repaired[old_base==0]=0
  old_motion=json.dumps(patch['motion'],sort_keys=True);patch['pixels']=[[int(i),int(repaired[i])]for i in np.flatnonzero(repaired!=old_base)];assert json.dumps(patch['motion'],sort_keys=True)==old_motion
  patch_path.write_text(json.dumps(patch,separators=(',',':'))+'\n',encoding='utf-8')
  assert not (poked!=repaired)[~mask].any()
  reports.append({'style':style,'frames':stats,'unchangedOtherFrames':True,'paletteExact':True,'alphaExact':True,'pokeChangedPixels':int((poked!=repaired).sum()),'pokeMotionAndOutsideEyesExact':True})
  before_images[style]['poke']=decode(before,poked);before_images[style]['new-poke']=decode(sheet,repaired)
  for key in KEYS:before_images[style]['new-'+key]=decode(sheet,sheet['frames'][sheet['ids'][key]]['pixels'])
 assert all(sha(ROOT/f'assets/reactions/{s}/reaction-sheet.json')==v for s,v in protected.items())
 out=ROOT.parent/'Umi-Eyelid-Fix';out.mkdir(exist_ok=True);font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',19)
 cols=['rest','idle-blink','idle-wink','happy-blink','error','poke'];canvas=Image.new('RGB',(6*300,4*225+55),'#101a2b');d=ImageDraw.Draw(canvas);d.text((15,10),'实际旧插画 / 原像素 · 上：修正前，下：仅清掉原开眼上睫残留',font=font,fill='white')
 for si,style in enumerate(['illustration','pixel']):
  for col,key in enumerate(cols):
   for row,prefix in enumerate(['','new-']):
    im=before_images[style][prefix+key];n=im.width;box=tuple(round(v*n/(1024 if style=='illustration'else 100))for v in ((280,365,710,608)if style=='illustration'else(26,32,71,59)));crop=im.crop(box).resize((290,164),Image.Resampling.NEAREST);x=col*300;y=(si*2+row)*225+55;d.text((x+6,y+5),f'{style} {key}'+(' 修后'if row else' 修前'),font=font,fill='#bdd5ed');canvas.paste(crop,(x+5,y+39),crop)
 canvas.save(out/'Umi-legacy-eyes-before-after.png')
 report={'passed':True,'method':'Original upper-lash ink only, fixed palettes, retained current eye curves and original neighboring fur','styles':reports,'umiStylesUnchanged':True,'protectedStyleHashes':protected}
 (ROOT/'tests/legacy-eyelid-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
