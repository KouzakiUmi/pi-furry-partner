"""Source-specific nod640 face/eye trimap. Same frozen guarded recovery, no arbitrary hole fill."""
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import argparse,json,hashlib,sys,subprocess
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
H=Path(__file__).parent;R=H.parent.parent;sys.path.insert(0,str(R/'scripts'))
import process_approved_h3_actions as core
BOX=[240,285,402,366]
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,v):p.write_text(json.dumps(v,indent=2)+'\n',encoding='utf-8')
def recover(v,src):
 assert v.shape==(640,640,4) and src.shape==(640,640,3)
 x0,y0,x1,y1=BOX;inside=np.zeros((640,640),bool);inside[y0:y1,x0:x1]=True;mask=inside&(v[:,:,3]<252)
 labels,_=ndi.label(v[:,:,3]<252,structure=np.ones((3,3)));exterior=np.unique(np.concatenate([labels[0],labels[-1],labels[:,0],labels[:,-1]]));ext=np.isin(labels,exterior)&(labels!=0)
 assert not np.any(mask&ext),'Uncertain core reaches exterior, refuse'
 assert not(mask[y0,x0:x1].any() or mask[y1-1,x0:x1].any() or mask[y0:y1,x0].any() or mask[y0:y1,x1-1].any()),'Uncertain alpha reaches reviewed core boundary, refuse'
 rgb=src.astype(float);border=np.concatenate([rgb[:8].reshape(-1,3),rgb[-8:].reshape(-1,3),rgb[:,:8].reshape(-1,3),rgb[:,-8:].reshape(-1,3)]);plate=np.median(border,axis=0);margin=float(np.max(abs(rgb[y0:y1,x0:x1]-plate),axis=2).min());assert margin>24
 out=v.copy();out[mask,:3]=src[mask];out[mask,3]=255
 assert np.array_equal(out[ext],v[ext]) and np.array_equal(out[v[:,:,3]>=252],v[v[:,:,3]>=252]) and np.array_equal(out[~mask],v[~mask])
 return out,{'restoredInteriorPixels':int(mask.sum()),'external8ConnectedRgbaExactlyUnchanged':True,'reliable252RgbaExactlyUnchanged':True,'outsideRepairExactlyUnchanged':True,'fixedCoreBoundaryRgbaUnchanged':True,'sourceCoreVsKeyMarginBytes':margin,'reviewedCore':BOX}
def one(args):
 job,i,box=args;global BOX;BOX=box;j=Path(job);old=j/'processed-edge-v2';out=j/'processed-detail-v1';name=f'{i:03}.png';v=np.asarray(Image.open(old/'rgba'/name).convert('RGBA'));src=np.asarray(Image.open(j/'early-check'/f'{i+1:05}.png').convert('RGB').resize((640,640),Image.Resampling.LANCZOS))
 clean,r=recover(v,src);im=Image.fromarray(clean);im.save(out/'rgba'/name);im.save(out/'webp'/f'{i:03}.webp',lossless=True,exact=True,method=4)
 for bg,col in [('black',[0]*3),('gray',[127]*3),('white',[255]*3)]:core.composite(clean.astype(float)/255,col).save(out/bg/name)
 return {'frame':i,'sha256':sha(out/'rgba'/name),'priorSha256':sha(old/'rgba'/name),**r}
def run(a):
 global BOX
 BOX=[240,285,402,366]
 suffix='';j=R/'Hi-Res/sources/h3-motion-polish-20261023'/a/'key-purple-pilot-v1';e={}
 for name in [f'source-core{suffix}-review-A.json',f'source-core{suffix}-review-B.json']:
  p=j/name;r=read(p);reviewed=r['reviewedOpaqueCore'];rect=reviewed.get('rect') if isinstance(reviewed,dict) else reviewed
  assert rect==BOX and r.get('status') in ['REVIEWED_OPAQUE_UNDERLYING_FACE_CORE_CONDITIONAL_RESTORE_SUPPORTED','APPROVED_REVIEWED_OPAQUE_CORE_FOR_THIS_SOURCE_ONLY'],r
  e[name]=sha(p)
 m=read(j/'processed-edge-v2/manifest.json');assert m['canvas']==[640,640] and len(m['frames'])==107;out=j/'processed-detail-v1';assert not out.exists()
 for d in ['rgba','webp','black','gray','white']:(out/d).mkdir(parents=True,exist_ok=True)
 with ProcessPoolExecutor(max_workers=3) as pool:res=list(pool.map(one,[(str(j),i,BOX) for i in range(len(m['frames']))]))
 for f,r in zip(m['frames'],res):f['sha256']=r['sha256'];f['preDetailSha256']=r['priorSha256']
 m['processing']['reviewedNod640OpaqueFace']={'file':str(Path(__file__).resolve()),'sha256':sha(__file__),'core':BOX,'preDetailManifestSha256':sha(j/'processed-edge-v2/manifest.json'),'sourceCorePreflightSha256':sha(j/f'source-core-preflight{suffix}.json'),'independentReviews':e,'scope':'This nod-source reviewed eye/face core only. Same frame/same fixed resize nativeRGB and255alpha at unreliable enclosed core pixels; exterior8, coreboundary, original reliable252RGBA preserved. No source grade, painting or per-frame fit.'}
 write(out/'manifest.json',m);write(out/'per-frame-detail-report.json',res);report={'status':'AWAITING_ACTUAL_OUTPUT_A_B_AND_USER','humanAccepted':False,'runtimeInstalled':False,'frameCount':len(res),'periodMs':m['periodMs'],'sourceTimelineUnchanged':True,'registrationUnchanged':True,'externalSoftRgbaAllFramesExactlyUnchanged':all(r['external8ConnectedRgbaExactlyUnchanged'] for r in res),'reliable252RgbaAllFramesExactlyUnchanged':all(r['reliable252RgbaExactlyUnchanged'] for r in res),'outsideDetailRepairAllFramesExactlyUnchanged':all(r['outsideRepairExactlyUnchanged'] for r in res),'changedAlphaInteriorPixels':sum(r['restoredInteriorPixels'] for r in res),'minimumAllFramesSourceCoreVsKeyMarginBytes':min(r['sourceCoreVsKeyMarginBytes'] for r in res),'allCoreBoundaryRgbaUnchanged':True,'knownLimits':'Only this nod source and its reviewed independent face/eye trimap; not for other clips. Exterior fine dark/purple rim/grain remains possible. User source-acting approval is separate from this technical output.'};write(out/'report.json',report);core.previews(out,m['frames'],m['fps'])
 for bg in ['black','gray','white']:subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(out/f'preview-{bg}.mp4'),'-c','copy',str(out/f'world-{bg}.mp4')],check=True)
 print(json.dumps({'action':a,**report}),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['nod']);run(p.parse_args().action)
