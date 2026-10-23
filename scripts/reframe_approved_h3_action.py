"""One fixed reframe from preserved native RGBA; no generation or re-keying."""
from pathlib import Path
import argparse,json,shutil
import numpy as np
from PIL import Image
from process_approved_h3_actions import read,write,sha,previews
from build_watch_matte import resize_soft,composite

def main():
 p=argparse.ArgumentParser();p.add_argument('--from',dest='source',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
 p.add_argument('--scale',type=float,required=True);p.add_argument('--x',type=int,required=True);p.add_argument('--y',type=int,required=True);args=p.parse_args()
 source=args.source.resolve();out=args.out.resolve();assert not out.exists(),'Use a new output directory'
 old=read(source/'manifest.json');report=read(source/'report.json');frames=[]
 for d in ['rgba','native','webp','black','gray','white']:(out/d).mkdir(parents=True,exist_ok=True)
 for r in old['frames']:
  native=source/'native'/r['file'];image=Image.open(native).convert('RGBA')
  if args.scale!=1:
   rgba=np.asarray(image,dtype=float)/255;resized=resize_soft(rgba,(round(image.width*args.scale),round(image.height*args.scale)))
   image=Image.fromarray(np.uint8(np.rint(resized*255)))
  canvas=Image.new('RGBA',(640,640));canvas.alpha_composite(image,(args.x,args.y))
  path=out/'rgba'/r['file'];canvas.save(path);canvas.save(out/'webp'/f"{r['id']}.webp",format='WEBP',lossless=True,method=4)
  shutil.copy2(native,out/'native'/r['file'])
  a=np.asarray(canvas.getchannel('A'));yy,xx=np.where(a>=128);bounds=[int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1]
  frames.append({**r,'sha256':sha(path),'visibleBounds':bounds})
  rgba=np.asarray(canvas,dtype=float)/255
  for name,bg in [('black',[0,0,0]),('gray',[127,127,127]),('white',[255,255,255])]:composite(rgba,bg).save(out/name/r['file'])
 shutil.copy2(source/'source.mp4',out/'source.mp4')
 transform={'scale':args.scale,'x':args.x,'y':args.y,'perFrameFit':False,'nonUniformScale':False,
  'derivedFrom':'Once measured whole-native-sequence alpha union; one fixed full-clip framing, never per-frame fitting'}
 new={**old,'frames':frames,'processing':{**old['processing'],'transform':transform},'reframedFromManifestSha256':sha(source/'manifest.json')}
 write(out/'manifest.json',new)
 report.update({'status':'AWAITING_VISUAL_REVIEW','manualAccepted':False,'registration':transform,
  'reframedFromManifestSha256':sha(source/'manifest.json'),'nativeRGBAReusedWithoutRekeying':True,
  'canonicalBorderTouchFrames':[r['id'] for r in frames if min(r['visibleBounds'][:2])<4 or max(r['visibleBounds'][2:])>636]})
 small=[]
 for r in frames:
  a=np.asarray(Image.open(out/'rgba'/r['file']).resize((160,160)),dtype=float)/255
  small.append(np.concatenate((a[:,:,:3]*a[:,:,3:],a[:,:,3:]),axis=2))
 differences=[float(np.abs(b-a).mean()) for a,b in zip(small,small[1:])];median=float(np.median(differences));seam=float(np.abs(small[-1]-small[0]).mean())
 report['continuityMeasurements']={'median':median,'loopSeamMeanAbsoluteDifference':seam,'seamToMedianRatio':seam/max(median,1e-9),'consecutiveMeanAbsoluteDifferences':differences,'warningOnly':True}
 write(out/'report.json',report);previews(out,frames,old['fps'])
 assert not report['canonicalBorderTouchFrames'],'Do not deliver a clipped action'
 print(json.dumps({'out':str(out),'frames':len(frames),'borderTouch':0,'newGenerationRequests':0}))
if __name__=='__main__':main()
