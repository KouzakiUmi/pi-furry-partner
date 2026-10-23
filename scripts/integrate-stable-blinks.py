"""Keep each approved pose's exact body/alpha; use only its own closed eye area.

The user approved the idle eye-only pilot and local build/install. Other paired
blinks follow the same constraint with pose-specific ROIs, not the idle eye art.
Run without --apply to inspect the complete loop candidates first.
"""
from pathlib import Path
import argparse, hashlib, json, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'work/stable-blinks'
BACKUP = OUT/'before'
POSES = ROOT/'assets/hires/umi/poses'
ROIS = {
 'think': [(207,249,303,337),(334,265,446,359)],
 'listen': [(255,263,360,345),(375,220,470,310)],
 'work': [(210,264,314,344),(338,266,447,348)],
 'wait': [(229,294,332,372),(344,262,449,351)],
 'watch': [(229,267,320,345),(341,267,446,348)],
 'concern': [(213,265,319,348),(339,269,446,351)],
 'happy': [(210,259,316,341)],
 'talk-closed': [(216,262,321,345),(344,267,453,350)],
 'talk-small': [(216,258,321,340),(345,264,454,344)],
 'talk-medium': [(216,260,321,343),(346,263,455,347)],
 'talk-wide': [(217,248,322,328),(349,260,457,333)],
}
# Blue iris bounds in each unchanged base; closed lash bounds in its original
# paired frame. Align each eye independently without moving any body pixels.
EYES = {
 'think': [((236,266,274,320),(221,293,286,317)),((352,285,394,340),(346,323,422,340))],
 'listen': [((285,278,329,328),(275,310,340,342)),((394,240,432,294),(400,266,455,300))],
 'work': [((245,281,283,330),(216,301,288,323)),((357,284,399,334),(351,307,428,327))],
 'wait': [((262,309,302,358),(239,321,308,351)),((363,280,404,334),(366,289,432,319))],
 'watch': [((248,282,289,331),(239,304,295,324)),((361,286,401,335),(360,309,423,330))],
 'concern': [((247,282,288,331),(228,301,293,319)),((358,286,398,336),(357,303,423,321))],
 'happy': [((245,278,285,324),(216,278,288,307))],
 'talk-closed': [((251,281,292,329),(231,285,294,304)),((363,284,405,333),(364,288,433,309))],
 'talk-small': [((250,277,292,324),(228,291,297,309)),((364,279,406,326),(364,293,433,311))],
 'talk-medium': [((251,278,292,326),(229,284,297,303)),((365,281,407,329),(365,284,435,304))],
 'talk-wide': [((252,266,293,311),(229,284,297,303)),((368,279,409,316),(366,284,435,304))],
}

def read(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p,d): p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def component(mask, seed):
 seen=np.zeros_like(mask);stack=list(zip(*np.where(mask & seed)));seen[mask & seed]=True
 while stack:
  y,x=stack.pop()
  for yy,xx in [(y-1,x),(y+1,x),(y,x-1),(y,x+1)]:
   if 0<=yy<mask.shape[0] and 0<=xx<mask.shape[1] and mask[yy,xx] and not seen[yy,xx]:seen[yy,xx]=True;stack.append((yy,xx))
 return seen
def backup(p):
 dest=BACKUP/p.relative_to(ROOT)
 if not dest.exists(): dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
 return dest

def main():
 apply=argparse.ArgumentParser();apply.add_argument('--apply',action='store_true');args=apply.parse_args()
 OUT.mkdir(exist_ok=True)
 images={};records=[];masks={}
 for name,rois in ROIS.items():
  base=np.array(Image.open(POSES/f'{name}.webp').convert('RGBA'))
  donor_path=POSES/f'{name}-blink.webp'
  donor=np.array(Image.open(backup(donor_path)).convert('RGBA'))
  # Rounded socket regions exclude the brows and taper at the corners.
  out=base.copy();m=np.zeros((640,640));allow=np.zeros((640,640),bool);rois=[]
  for side,(iris,lash) in enumerate(EYES[name]):
   l,t,r,b=iris
   # Lash extends outward from the iris; the lower inner corner stops before
   # the nose. This socket polygon avoids brows and cheek/mouth features.
   x0=l-(35 if side==0 else 20);x1=r+(24 if side==0 else 36);y0=t-35;y1=b+10
   rois.append((x0,y0,x1,y1))
   permitted=np.zeros_like(allow);permitted[y0:y1+1,x0:x1+1]=True
   if name=='watch' and side==0:
    gy,gx=np.ogrid[:640,:640]
    radius=((gx-180)/61)**2+((gy-320)/61)**2
    original=base[:,:,:3].astype(int)
    lens=(radius<.87)|((radius<1.08)&(original[:,:,2]-original[:,:,0]>4))
    permitted &= ~lens
   seed=np.zeros_like(allow);seed[t:b,l:r]=True
   rgb=base[:,:,:3].astype(int);blue=(rgb[:,:,2]-rgb[:,:,0]>40)&(rgb[:,:,2]-rgb[:,:,1]>5)
   old=component(permitted & ((rgb.max(2)<180)|blue),seed & blue)
   # Fill interior white highlights bounded by the connected eye silhouette.
   for yy in range(y0,y1+1):
    xx=np.where(old[yy])[0]
    if len(xx):old[yy,xx.min():xx.max()+1]=True
   oldmask=Image.fromarray(np.uint8(old)*255).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(.7))
   w=np.array(oldmask)/255.;w[~permitted]=0
   skin=rgb[permitted & (rgb.min(2)>235)]
   color=np.median(skin,axis=0)
   # Only the connected original eye is removed; brows/hair/cheeks remain base.
   out[:,:,:3]=np.rint(out[:,:,:3]*(1-w[:,:,None])+color*w[:,:,None]).astype('uint8')
   dx=(l+r)/2-(lash[0]+lash[2])/2;dy=(t+b)/2+3-(lash[1]+lash[3])/2
   aligned=np.array(Image.fromarray(donor).transform((640,640),Image.Transform.AFFINE,(1,0,-dx,0,1,-dy),Image.Resampling.BICUBIC))
   ar=aligned[:,:,:3].astype(int);lashseed=np.zeros_like(allow)
   lx0,ly0,lx1,ly1=lash;lashseed[round(ly0+dy):round(ly1+dy),round(lx0+dx):round(lx1+dx)]=True
   closed=component(permitted & (ar.max(2)<200)&(ar[:,:,2]-ar[:,:,0]<15),lashseed & (ar.max(2)<115))
   # Copy the source lash with its antialiasing, without source brows or cheek ink.
   cw=np.array(Image.fromarray(np.uint8(closed)*255).filter(ImageFilter.MaxFilter(3)))/255.
   cw[~permitted]=0
   out[:,:,:3]=np.rint(out[:,:,:3]*(1-cw[:,:,None])+aligned[:,:,:3]*cw[:,:,None]).astype('uint8')
   m=np.maximum(m,np.maximum(w,cw));allow|=permitted
  assert np.array_equal(out[:,:,3],base[:,:,3]) and np.array_equal(out[~allow],base[~allow])
  img=Image.fromarray(out);img.save(OUT/f'{name}-blink.webp',lossless=True,exact=True,method=6)
  images[name]=(Image.fromarray(base),img);masks[name]=m
  records.append({'base':name,'closed':name+'-blink','eyeRoisLtrbInclusive':rois,'outsideRoiRgbaIdentical':True,'alphaIdentical':True,'sourceClosedSha256':sha(backup(donor_path)),'outputSha256':sha(OUT/f'{name}-blink.webp')})
 # Exact approved pilot, with no recomposition or changed compression.
 images['idle-open']=(Image.open(POSES/'idle-open.webp').convert('RGBA'),Image.open(ROOT/'work/blink-eye-pilot/closed.webp').convert('RGBA'))
 masks['idle-open']=np.array(Image.open(ROOT/'work/blink-eye-pilot/eye-mask.png'))/255.
 shutil.copy2(ROOT/'work/blink-eye-pilot/closed.webp',OUT/'idle-blink.webp')
 contact=Image.new('RGB',(3*420,4*235),'#808080');draw=ImageDraw.Draw(contact)
 for i,(name,pair) in enumerate(images.items()):
  x=i%3*420;y=i//3*235
  for j,im in enumerate(pair):
   thumb=im.resize((210,210),Image.Resampling.LANCZOS);contact.paste(thumb,(x+j*210,y+22),thumb)
  draw.text((x+6,y+3),name+'  open / stable blink',fill='white')
 contact.save(OUT/'contact.jpg',quality=94)
 # Full-resolution eye crops make iris/eyebrow/seam errors easy to reject early.
 crop=Image.new('RGB',(640,12*150),'#808080');draw=ImageDraw.Draw(crop)
 for i,(name,pair) in enumerate(images.items()):
  for j,im in enumerate(pair):
   part=im.crop((180,220,500,370));crop.paste(part,(j*320,i*150),part)
  draw.text((2,i*150),name,fill='red')
 crop.save(OUT/'eye-contact.jpg',quality=95)
 write(OUT/'audit.json',{'status':'REVIEWED_IDLE_PLUS_PAIRED_EYE_CANDIDATES','installed':False,'records':records})
 if not args.apply:return
 for name,pair in images.items():
  closed='idle-blink' if name=='idle-open' else name+'-blink'
  target=POSES/f'{closed}.webp';backup(target);shutil.copy2(OUT/f'{closed}.webp',target)
 # Preserve palette and every non-eye indexed pixel. Updating just the eye mask
 # prevents quantization from silently changing the rest of the low-res sprite.
 for style in ['umi','umi-pixel','illustration','pixel']:
  p=ROOT/f'assets/reactions/{style}/reaction-sheet.json';sheet=read(backup(p));size=sheet['width']
  palette=np.array(sheet['palette'],dtype=np.int32)
  for name,pair in images.items():
   closed='idle-blink' if name=='idle-open' else name+'-blink'
   pixels=np.array(sheet['frames'][sheet['ids'][name]]['pixels'],dtype=np.uint16).reshape(size,size)
   method=Image.Resampling.NEAREST if 'pixel' in style else Image.Resampling.LANCZOS
   rgb=np.array(pair[1].resize((size,size),method))[:,:,:3].astype(np.int32)
   region=np.array(Image.fromarray(np.uint8(masks[name]*255)).resize((size,size),method))>0
   yy,xx=np.where(region & (pixels!=sheet.get('transparentIndex',0)))
   colors=rgb[yy,xx];nearest=[]
   for start in range(0,len(colors),1024):
    dif=colors[start:start+1024,None,:]-palette[None,1:,:];nearest.extend((dif*dif).sum(2).argmin(1)+1)
   out=pixels.copy();out[yy,xx]=nearest
   assert np.array_equal(out==0,pixels==0) and np.array_equal(out[~region],pixels[~region])
   sheet['frames'][sheet['ids'][closed]]={'id':closed,'pixels':out.reshape(-1).tolist()}
  sheet['stableBlinkRevision']='eye-only-20261021';write(p,sheet)
 manifest=ROOT/'assets/hires/umi/manifest.json';doc=read(backup(manifest));doc['stableBlinkRevision']='eye-only-20261021';write(manifest,doc)
 print('Applied12 stable paired blinks to HD and four indexed asset banks; originals preserved in',BACKUP)

if __name__=='__main__':main()
