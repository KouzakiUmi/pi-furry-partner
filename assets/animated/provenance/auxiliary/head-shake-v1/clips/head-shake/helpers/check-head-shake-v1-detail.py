from pathlib import Path
import argparse,importlib.util,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
H=Path(__file__).parent;R=H.parent.parent
sp=importlib.util.spec_from_file_location('aux_guard',H/'restore-head-shake-v1-face-core.py');g=importlib.util.module_from_spec(sp);sp.loader.exec_module(g)
p=argparse.ArgumentParser();p.add_argument('action',choices=['head-shake']);a=p.parse_args().action;g.BOX={'head-shake':[220,275,405,335]}[a]
J=R/f'Hi-Res/sources/h3-motion-polish-20261023/{a}/key-purple-pilot-v1';O=J/'processed-detail-v1';OLD=J/'processed-edge-v2';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=g.read(O/'manifest.json');before=g.read(OLD/'manifest.json');pf=g.read(J/'source-core-preflight.json')
assert m['canvas']==[640,640] and m['pivot']==[320,608] and m['fps']==24 and m['periodMs']==4458 and len(m['frames'])==107
assert m['sampling']==before['sampling'] and m['processing']['transform']==before['processing']['transform'] and m['sampling']['timeScale']==1 and not m['sampling']['reverse']
assert {p.name for p in (O/'rgba').glob('*.png')}=={f'{i:03}.png' for i in range(107)}
redtotal=redbad=insidebad=restored=0;minimum=255;externalflags=[];rawchecks=[]
for i,f in enumerate(m['frames']):
 v=np.asarray(Image.open(O/f'rgba/{i:03}.png').convert('RGBA'));w=np.asarray(Image.open(O/f'webp/{i:03}.webp').convert('RGBA'));prior=np.asarray(Image.open(OLD/f'rgba/{i:03}.png').convert('RGBA'))
 src=np.asarray(Image.open(J/f'early-check/{i+1:05}.png').convert('RGB').resize((640,640),Image.Resampling.LANCZOS));expected,detail=g.recover(prior,src)
 assert np.array_equal(v,expected) and np.array_equal(v,w) and sha(O/f'rgba/{i:03}.png')==f['sha256']
 assert all(f[k]==before['frames'][i][k] for k in ['id','file','sourceFrame','atMs','durationMs','pivot'])
 assert all(detail[k] for k in ['external8ConnectedRgbaExactlyUnchanged','reliable252RgbaExactlyUnchanged','outsideRepairExactlyUnchanged','fixedCoreBoundaryRgbaUnchanged']);restored+=detail['restoredInteriorPixels']
 ss=src.astype(int);red=(ss[:,:,0]>140)&(ss[:,:,0]-ss[:,:,1]>50)&(ss[:,:,0]-ss[:,:,2]>50);low=red&(v[:,:,3]<200)
 seed=np.zeros((640,640),bool);seed[[0,-1],:]=True;seed[:,[0,-1]]=True;ext=ndi.binary_propagation(seed,structure=np.ones((3,3)),mask=prior[:,:,3]<252)
 redtotal+=int(red.sum());redbad+=int(low.sum());insidebad+=int((low&~ext).sum());minimum=min(minimum,int(v[:,:,3][red].min()) if red.any() else 255)
 yy,xx=np.where(low&ext)
 for x,y in zip(xx,yy):
  assert np.array_equal(v[y,x],prior[y,x]);externalflags.append({'frame':i,'position':[int(x),int(y)],'alpha':int(v[y,x,3]),'priorRgbaExactlyUnchanged':True})
 if i==0:
  falsesrc=src.copy();x0,y0,x1,y1=g.BOX;falsesrc[y0:y1,x0:x1]=[160,32,192]
  try:g.recover(prior,falsesrc)
  except AssertionError:pass
  else:raise AssertionError('False core with actual key color must be refused')
assert insidebad==0 and restored==pf['potentialRestoredPixels']
assert externalflags==[]
worst=90;roi=(354,286,389,328)
ims=[Image.open(J/f'early-check/{worst+1:05}.png').convert('RGB').resize((640,640),Image.Resampling.LANCZOS),Image.open(OLD/f'black/{worst:03}.png'),Image.open(O/f'black/{worst:03}.png'),Image.open(O/f'white/{worst:03}.png'),Image.open(O/f'rgba/{worst:03}.png').getchannel('A').convert('RGB')]
proof=Image.new('RGB',(1200,265),(32,35,40));d=ImageDraw.Draw(proof)
for n,(im,label) in enumerate(zip(ims,['native source','old edge HOLD','final black','final white','final alpha'])):
 patch=im.crop(roi);ratio=min(240/patch.width,240/patch.height);patch=patch.resize((round(patch.width*ratio),round(patch.height*ratio)),Image.Resampling.NEAREST);proof.paste(patch,(n*240+(240-patch.width)//2,25));d.text((n*240+4,4),label,fill='white')
proof.save(J/'detail-eye-proof.png')
r={'status':'COMPLETE107_TECHNICAL_GUARDS_PASS_A_B_USER_OUTPUT_REVIEW_PENDING','action':a,'sourceVideoSha256':m['source']['sha256'],'manifestSha256':sha(O/'manifest.json'),'helperSha256':sha(H/'restore-head-shake-v1-face-core.py'),'sourceProcessingAuthorizationSha256':sha(J/'source-processing-authorization.json'),'frameCount':107,'fps':24,'periodMs':4458,'canvas':[640,640],'pivot':[320,608],'sourceTimelineExactlyUnchanged':True,'reproducedFinalRgbaAll107':True,'pngWebpAllRgbaExactlyEqual':True,'external8RgbaAll107ExactlyUnchanged':True,'coreBoundaryAll107ExactlyUnchanged':True,'reliable252RgbaAll107ExactlyUnchanged':True,'outsideRepairAll107ExactlyUnchanged':True,'sourceKeyFalseCoreRefused':True,'restoredInteriorPixels':restored,'reviewedSourceSpecificCore':g.BOX,'redCoralSamples':redtotal,'samplesBelowAlpha200':redbad,'enclosedSamplesBelowAlpha200':insidebad,'minimumRedCoralAlpha':minimum,'remainingExternalSoftSamples':externalflags,'humanAcceptedOutput':False,'runtimeInstalled':False,'acceptanceScope':'Complete technical assertions only, not art/whole-video/loop or native-speed user acceptance.'}
(J/'detail-technical-review.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps(r))
