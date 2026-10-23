"""Technical-only interior repair of accepted wait/listen; full guard preflight before writing."""
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import argparse,json,hashlib,sys,subprocess
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
R=Path.cwd();H=R/'work/motion-polish-20261023';O=H/'early-alpha-closeout';sys.path.insert(0,str(R/'scripts'))
import process_approved_h3_actions as core
JOBS={'wait':'key-purple-brisk-accent-v2','listen':'key-purple-batch05-v2'}
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def recover(v,src,box):
 x0,y0,x1,y1=box;mask=np.zeros(v.shape[:2],bool);mask[y0:y1,x0:x1]=True;mask&=v[:,:,3]<252
 labels,_=ndi.label(v[:,:,3]<252,structure=np.ones((3,3)));exterior=np.unique(np.concatenate([labels[0],labels[-1],labels[:,0],labels[:,-1]]));ext=np.isin(labels,exterior)&(labels!=0)
 assert not np.any(mask&ext),'Unknown core pixels connect to exterior; refuse'
 assert not(mask[y0,x0:x1].any() or mask[y1-1,x0:x1].any() or mask[y0:y1,x0].any() or mask[y0:y1,x1-1].any()),'Uncertainty reaches reviewed core boundary; refuse'
 rgb=src.astype(float);border=np.concatenate([rgb[:8].reshape(-1,3),rgb[-8:].reshape(-1,3),rgb[:,:8].reshape(-1,3),rgb[:,-8:].reshape(-1,3)]);plate=np.median(border,axis=0);margin=float(np.max(abs(rgb[y0:y1,x0:x1]-plate),axis=2).min());assert margin>24
 out=v.copy();out[mask,:3]=src[mask];out[mask,3]=255
 assert np.array_equal(out[ext],v[ext]) and np.array_equal(out[v[:,:,3]>=252],v[v[:,:,3]>=252]) and np.array_equal(out[~mask],v[~mask])
 return out,{'restoredInteriorPixels':int(mask.sum()),'external8ConnectedRgbaExactlyUnchanged':True,'reliable252RgbaExactlyUnchanged':True,'outsideRepairExactlyUnchanged':True,'fixedCoreBoundaryRgbaUnchanged':True,'sourceCoreVsKeyMarginBytes':margin,'reviewedCore':box}
def one(args):
 j,i,box,do_write=args;j=Path(j);old=j/'processed-edge-v2';out=j/'processed-detail-closeout-v1';name=f'{i:03}.png';v=np.asarray(Image.open(old/'rgba'/name).convert('RGBA'));src=np.asarray(Image.open(j/'early-check'/f'{i+1:05}.png').convert('RGB').resize((896,896),Image.Resampling.LANCZOS));clean,r=recover(v,src,box)
 if do_write:
  im=Image.fromarray(clean);im.save(out/'rgba'/name);im.save(out/'webp'/f'{i:03}.webp',lossless=True,exact=True,method=4)
  for bg,col in [('black',[0]*3),('gray',[127]*3),('white',[255]*3)]:core.composite(clean.astype(float)/255,col).save(out/bg/name)
  r.update(sha256=sha(out/'rgba'/name),priorSha256=sha(old/'rgba'/name))
 return {'frame':i,**r}
def run(a):
 j=R/'Hi-Res/sources/h3-motion-polish-20261023'/a/JOBS[a];pre=read(O/f'{a}-preflight.json');box=pre['proposedOpaqueFaceCore'];assert pre['sourceHasNoKeyLikePixelInCore'];ev={}
 for who in ['A','B']:
  p=O/f'{a}-source-core-review-{who}.json';r=read(p);assert r['status']=='APPROVED_FOR_GUARDED_INTERIOR_ALPHA_RECOVERY' and r['approvedCore']==box and r['sourceVideoSha256']==pre['sourceVideoSha256'];ev[p.name]=sha(p)
 old=j/'processed-edge-v2';out=j/'processed-detail-closeout-v1';assert not out.exists();m=read(old/'manifest.json');assert m['canvas']==[896,896] and len(m['frames'])==107 and m['sampling']['timeScale']==1
 with ProcessPoolExecutor(max_workers=3) as pool:guards=list(pool.map(one,[(str(j),i,box,False) for i in range(107)]))
 write(O/f'{a}-full-guard-preflight.json',{'passed':True,'frames':107,'sourceManifestSha256':sha(old/'manifest.json'),'core':box,'perFrame':guards});print(a+' complete107-frame guard preflight passed',flush=True)
 for f in ['rgba','webp','black','gray','white']:(out/f).mkdir(parents=True,exist_ok=True)
 with ProcessPoolExecutor(max_workers=3) as pool:res=list(pool.map(one,[(str(j),i,box,True) for i in range(107)]))
 for f,r in zip(m['frames'],res):f['sha256']=r['sha256'];f['preDetailSha256']=r['priorSha256']
 m['processing']['approvedActingInteriorAlphaCloseout']={'file':str(Path(__file__).resolve()),'sha256':sha(__file__),'core':box,'priorManifestSha256':sha(old/'manifest.json'),'independentActualReviews':ev,'guardPreflightSha256':sha(O/f'{a}-full-guard-preflight.json'),'scope':'Same-frame/same-registration nativeRGB +255alpha only inside reviewed unreliable opaque face. No grade, redraw, alpha exterior edits, time changes, question/hand changes or future-source authorization.'};write(out/'manifest.json',m);write(out/'per-frame-detail-report.json',res)
 report={'status':'AWAITING_ACTUAL_OUTPUT_A_B_AND_USER','humanAccepted':False,'sourceActingHumanApprovalRetained':True,'runtimeInstalled':False,'frameCount':107,'periodMs':m['periodMs'],'sourceTimelineUnchanged':True,'registrationUnchanged':True,'externalSoftRgbaAllFramesExactlyUnchanged':all(x['external8ConnectedRgbaExactlyUnchanged'] for x in res),'reliable252RgbaAllFramesExactlyUnchanged':all(x['reliable252RgbaExactlyUnchanged'] for x in res),'outsideRepairAllFramesExactlyUnchanged':all(x['outsideRepairExactlyUnchanged'] for x in res),'allCoreBoundaryRgbaUnchanged':True,'changedAlphaInteriorPixels':sum(x['restoredInteriorPixels'] for x in res),'minimumAllFramesSourceCoreVsKeyMarginBytes':min(x['sourceCoreVsKeyMarginBytes'] for x in res),'knownLimits':'Same approved source acting; only technical interior alpha changed. Fine exterior rim/grain unchanged and still disclosed.'};write(out/'report.json',report);core.previews(out,m['frames'],m['fps'])
 finish(a)
 print(json.dumps({'action':a,**report}),flush=True)
def finish(a):
 j=R/'Hi-Res/sources/h3-motion-polish-20261023'/a/JOBS[a];out=j/'processed-detail-closeout-v1';m=read(out/'manifest.json');r=read(out/'report.json');assert r['frameCount']==107 and r['outsideRepairAllFramesExactlyUnchanged'];assert all(sha(out/'rgba'/f['file'])==f['sha256'] for f in m['frames'])
 box=m['processing']['approvedActingInteriorAlphaCloseout']['core']
 for i,f in enumerate(m['frames']):
  v=np.asarray(Image.open(j/'processed-edge-v2/rgba'/f['file']).convert('RGBA'));src=np.asarray(Image.open(j/'early-check'/f'{i+1:05}.png').convert('RGB').resize((896,896),Image.Resampling.LANCZOS));expected,_=recover(v,src,box);assert np.array_equal(expected,np.asarray(Image.open(out/'rgba'/f['file']).convert('RGBA'))),'Current helper does not exactly reproduce output'
 entry=m['processing']['approvedActingInteriorAlphaCloseout'];entry.setdefault('initialHelperSha256',entry['sha256']);entry['sha256']=sha(__file__);entry['fullOutputReproducedByFinalHelper']=True
 rect={'x':320-m['pivot'][0],'y':608-m['pivot'][1],'width':m['canvas'][0],'height':m['canvas'][1]};assert rect=={'x':-128,'y':-96,'width':896,'height':896};m['processing']['worldPreviewPaintRect']=rect;write(out/'manifest.json',m)
 for bg in ['black','gray','white']:subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(out/f'preview-{bg}.mp4'),'-vf',f"crop=640:640:{-rect['x']}:{-rect['y']}",'-an','-c:v','libx264','-preset','veryfast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(out/f'world-{bg}.mp4')],check=True)
 print(a+' preview registration verified from original pivot, world files complete',flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=list(JOBS));p.add_argument('--finish-preview-only',action='store_true');args=p.parse_args();finish(args.action) if args.finish_preview_only else run(args.action)
