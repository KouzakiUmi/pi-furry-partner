"""Review-only eye compositor, explicitly authorized by the user.

The generated full sprite is only an eye insert. The open sprite is the exact
base for every output; no generated alpha/body/hair/face outline is adopted.
"""
from pathlib import Path
import json,hashlib,shutil
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/blink-eye-pilot'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 source=ROOT/'assets/hires/umi/poses/idle-open.webp'
 base=Image.open(source).convert('RGBA');assert base.size==(640,640)
 candidate=Image.open(OUT/'generated-eye-candidate.png').convert('RGBA').resize(base.size,Image.Resampling.LANCZOS)
 # Two socket polygons avoid bean eyebrows, bangs and facial silhouette.
 polygons=[[(204,279),(216,270),(237,270),(259,273),(280,280),(294,290),(300,316),(291,341),(225,342),(207,325)],
           [(342,289),(357,277),(377,271),(399,273),(419,282),(432,298),(434,323),(418,343),(352,344),(343,327)]]
 mask=Image.new('L',base.size)
 for points in polygons:ImageDraw.Draw(mask).polygon(points,fill=255)
 mask=mask.filter(ImageFilter.GaussianBlur(1.4))
 # Explicit rectangles bound ALL edits, including the feathered edge.
 rois=[[200,266,104,81],[338,267,100,81]]
 allowed=np.zeros((640,640),bool)
 for x,y,w,h in rois:allowed[y:y+h,x:x+w]=True
 weights=np.array(mask,dtype=float)/255;weights[~allowed]=0
 original=np.array(base);insert=np.array(candidate)
 result=original.copy();result[:,:,:3]=np.uint8(np.rint(original[:,:,:3]*(1-weights[:,:,None])+insert[:,:,:3]*weights[:,:,None]))
 assert np.array_equal(result[:,:,3],original[:,:,3]);assert np.array_equal(result[~allowed],original[~allowed])
 base.save(OUT/'open.png');Image.fromarray(result).save(OUT/'closed.png');Image.fromarray(result).save(OUT/'closed.webp',format='WEBP',lossless=True,exact=True,method=6)
 Image.fromarray(np.uint8(np.rint(weights*255))).save(OUT/'eye-mask.png')
 decoded=np.array(Image.open(OUT/'closed.webp').convert('RGBA'));assert np.array_equal(decoded,result)
 changed=(result!=original).any(2);yy,xx=np.where(changed)
 audit={'status':'AWAITING_INDEPENDENT_AND_USER_REVIEW','authorization':'User explicitly allows only local eye region, preview complete blink loop before install.','base':str(source),'baseSha256':sha(source),'canvas':[640,640],'roiFormat':'x,y,width,height; left/top inclusive, right/bottom exclusive','eyeRois':rois,'eyePolygons':polygons,'alphaBitwiseIdentical':True,'outsideRoiRgbaBitwiseIdentical':True,'losslessWebpDecodedExactlyMatchesPng':True,'changedPixels':int(changed.sum()),'differenceBounds':[int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1],'sequence':[{'file':'open.png','durationMs':2300},{'file':'closed.png','durationMs':170},{'file':'open.png','durationMs':2460}],'periodMs':4930,'display':{'profile':'ordinary','scale':1,'x':0,'y':0,'transform':None},'runtimeInstalled':False,'halfFrame':'Not invented: ordinary controller has170ms two-frame blink. This pilot preserves that timing.'}
 for name in ['open.png','closed.png','closed.webp']:audit[name+'Sha256']=sha(OUT/name)
 (OUT/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 for bg,color in [('gray',(127,127,127,255)),('black',(0,0,0,255)),('white',(255,255,255,255))]:
  for name,arr in [('open',original),('closed',result)]:
   composite=Image.new('RGBA',base.size,color);composite.alpha_composite(Image.fromarray(arr));composite.convert('RGB').save(OUT/f'{name}-{bg}.png')
 print({'out':str(OUT),'changedPixels':audit['changedPixels'],'outsideRoiUnchanged':True})
if __name__=='__main__':main()
