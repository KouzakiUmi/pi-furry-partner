from pathlib import Path
import importlib.util,json,hashlib,subprocess
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
h=Path('D:/Software Projects/pi-furry-partner/work/motion-polish-20261023');j=h.parents[1]/'Hi-Res/sources/h3-motion-polish-20261023/bounce/key-purple-pilot-v5';o=j/'processed-detail-v1';old=j/'processed-edge-v2';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sp=importlib.util.spec_from_file_location('frozen_eye_recover',h/'restore-bounce-v5-face-core.py');g=importlib.util.module_from_spec(sp);sp.loader.exec_module(g);g.BOX=[365,395,535,525]
m=g.read(o/'manifest.json');before=g.read(old/'manifest.json');pf=g.read(j/'source-core-preflight.json')
assert m['canvas']==[896,896] and m['pivot']==[448,736] and m['fps']==24 and m['periodMs']==4458 and len(m['frames'])==107
assert m['source']['sha256']==sha(j/'Umi-bounce-H3-source.mp4')=='fda9a64fb785bed16280ebd59df435bdd5ca275540b8b32f7054a15f429a37d6'
assert m['sampling']==before['sampling'] and m['processing']['transform']==before['processing']['transform'] and m['sampling']['timeScale']==1 and not m['sampling']['reverse']
assert m['processing']['worldPreviewPaintRect']=={'x':-128,'y':-128,'width':896,'height':896}
restored=redtotal=redbad=corebad=noncoreredbad=0;frames=[];contacts=[]
coremask=np.zeros((896,896),bool);coremask[395:525,365:535]=True
for i,f in enumerate(m['frames']):
 v=np.asarray(Image.open(o/f'rgba/{i:03}.png').convert('RGBA'));w=np.asarray(Image.open(o/f'webp/{i:03}.webp').convert('RGBA'));prior=np.asarray(Image.open(old/f'rgba/{i:03}.png').convert('RGBA'))
 src=np.asarray(Image.open(j/f'early-check/{i+1:05}.png').convert('RGB').resize((896,896),Image.Resampling.LANCZOS));expected,detail=g.recover(prior,src)
 assert np.array_equal(v,expected) and np.array_equal(v,w) and sha(o/f'rgba/{i:03}.png')==f['sha256']
 assert all(f[k]==before['frames'][i][k]for k in ['id','file','sourceFrame','atMs','durationMs','pivot'])
 assert all(detail[k]for k in ['external8ConnectedRgbaExactlyUnchanged','reliable252RgbaExactlyUnchanged','outsideRepairExactlyUnchanged','fixedCoreBoundaryRgbaUnchanged']);restored+=detail['restoredInteriorPixels']
 assert np.array_equal(v[608:743,258:643],prior[608:743,258:643]),'Fixed pawROI must be byte-identical to edge'
 yy,xx=np.where(v[:,:,3]>=128);bounds=[int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1];assert min(bounds[:2]+[896-bounds[2],896-bounds[3]])>=4
 s=src.astype(int);red=(s[:,:,0]>140)&(s[:,:,0]-s[:,:,1]>50)&(s[:,:,0]-s[:,:,2]>50);low=red&(v[:,:,3]<200);oldlow=red&(prior[:,:,3]<200)
 redtotal+=int(red.sum());redbad+=int(low.sum());corebad+=int((low&coremask).sum());noncoreredbad+=int((low&~coremask).sum())
 assert np.array_equal(v[~coremask],prior[~coremask]) and np.array_equal(low&~coremask,oldlow&~coremask)
 frames.append({'sourceFrame':i,'rgbaSha256':f['sha256'],'restoredInteriorPixels':detail['restoredInteriorPixels'],'visibleBounds':bounds,'redSamplesBelow200':int(low.sum()),'nonCoreRgbaExactlyUnchanged':True,'pawRoiRgbaExactlyUnchanged':True})
 if i==0:
  false=src.copy();false[395:525,365:535]=[160,32,192]
  try:g.recover(prior,false)
  except AssertionError:pass
  else:raise AssertionError('Key-colored false core must be refused')
assert restored==pf['potentialRestoredPixels']==3970 and corebad==0
for bg in ['black','gray','white']:
 s=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(o/f'world-{bg}.mp4')]))['streams'][0]
 assert [s['width'],s['height']]==[896,896] and s['avg_frame_rate']=='24/1' and int(s['nb_frames'])==107
for start in range(0,107,28):
 board=Image.new('RGB',(896,1708),(32,35,40));d=ImageDraw.Draw(board)
 for i in range(start,min(start+28,107)):
  x=(i-start)%4*224;y=(i-start)//4*244;board.paste(Image.open(o/f'black/{i:03}.png').resize((224,224)),(x,y));d.text((x+3,y+227),f'{i:03} {i/24:.3f}s final black',fill='white')
 p=j/f'final-full-contact-{start//28+1:02}.jpg';board.save(p,quality=97);contacts.append({'file':p.name,'sha256':sha(p)})
proof=Image.new('RGB',(1280,660),(32,35,40));d=ImageDraw.Draw(proof)
for row,i in enumerate([25,42]):
 ims=[Image.open(j/f'early-check/{i+1:05}.png').convert('RGB').resize((896,896),Image.Resampling.LANCZOS),Image.open(old/f'black/{i:03}.png'),Image.open(o/f'black/{i:03}.png'),Image.open(o/f'white/{i:03}.png')]
 for n,(im,lab)in enumerate(zip(ims,['source','edge before','final black','final white'])):
  proof.paste(im.crop((365,395,535,525)).resize((320,245),Image.Resampling.NEAREST),(n*320,row*330+25));d.text((n*320+3,row*330+4),f'{i:03} {lab}',fill='white')
proof.save(j/'detail-eye-proof.png')
r={'status':'COMPLETE107_TECHNICAL_GUARDS_PASS_ACTUAL_FINAL_A_B_AND_USER_PENDING','sourceVideoSha256':m['source']['sha256'],'manifestSha256':sha(o/'manifest.json'),'helperSha256':sha(h/'restore-bounce-v5-face-core.py'),'frameCount':107,'fps':24,'periodMs':4458,'canvas':[896,896],'pivot':[448,736],'worldPaintRect':[-128,-128,896,896],'sourceTimelineExactlyUnchanged':True,'reproducedFinalRgbaAll107':True,'pngWebpAllRgbaExactlyEqual':True,'external8RgbaAll107ExactlyUnchanged':True,'coreBoundaryAll107ExactlyUnchanged':True,'reliable252RgbaAll107ExactlyUnchanged':True,'outsideRepairAll107ExactlyUnchanged':True,'pawRoiAll107RgbaExactlyUnchanged':True,'sourceKeyFalseCoreRefused':True,'restoredInteriorPixels':restored,'reviewedSourceSpecificCore':g.BOX,'redCoralSamples':redtotal,'samplesBelowAlpha200':redbad,'reviewedEyeCoreSamplesBelowAlpha200':corebad,'nonCoreSamplesBelowAlpha200Unchanged':noncoreredbad,'nonCoreFlagScope':'Existing native right sleeve/cape pink-purple background separation and all outside-core pixels preserved exactly; no attempt to force every source-red heuristic flag opaque.','contacts':contacts,'eyeProofSha256':sha(j/'detail-eye-proof.png'),'frames':frames,'humanAcceptedOutput':False,'runtimeInstalled':False}
(j/'detail-technical-review.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:r[k]for k in ['status','manifestSha256','restoredInteriorPixels','samplesBelowAlpha200','reviewedEyeCoreSamplesBelowAlpha200','nonCoreSamplesBelowAlpha200Unchanged','eyeProofSha256']}))
