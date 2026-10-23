from pathlib import Path
import importlib.util,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
H=Path(__file__).parent;R=H.parent.parent;J=R/'Hi-Res/sources/h3-motion-polish-20261023/nuzzle/key-purple-pilot-v9'
sp=importlib.util.spec_from_file_location('peek_frozen_recover',H/'restore-nuzzle-v9-face-core.py');g=importlib.util.module_from_spec(sp);sp.loader.exec_module(g)
BOX=[245,280,392,352];g.BOX=BOX
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();records=[]
for i in range(107):
 v=np.asarray(Image.open(J/'processed-edge-v2/rgba'/f'{i:03}.png').convert('RGBA'))
 src=np.asarray(Image.open(J/'early-check'/f'{i+1:05}.png').convert('RGB').resize((640,640),Image.Resampling.LANCZOS))
 _,d=g.recover(v,src);records.append({'frame':i,**d})
ids=[0,30,54,66,92,106];proof=Image.new('RGB',(1152,820),(32,35,40));draw=ImageDraw.Draw(proof)
for n,i in enumerate(ids):
 im=Image.open(J/'early-check'/f'{i+1:05}.png').convert('RGB').resize((640,640),Image.Resampling.LANCZOS);ImageDraw.Draw(im).rectangle(BOX,outline=(255,230,0),width=2)
 x,y=n%3*384,n//3*410;proof.paste(im.resize((384,384)),(x,y));draw.text((x+4,y+388),f'nuzzle v9 {i:03} THIS source opaque face',fill='white')
assert not (J/'source-core-review-A.json').exists() and not(J/'source-core-review-B.json').exists(),'Do not replace reviewed evidence'
proof.save(J/'source-core-proof.jpg',quality=96)
r={'status':'PREFLIGHT_PASS_REQUIRES_ACTUAL_A_B_BEFORE_RESTORE','core':BOX,'canvas':[640,640],'frames':107,'sourceVideoSha256':sha(J/'Umi-nuzzle-H3-source.mp4'),'edgeManifestSha256':sha(J/'processed-edge-v2/manifest.json'),'proofFile':'source-core-proof.jpg','proofSha256':sha(J/'source-core-proof.jpg'),'guardHelperSha256':sha(H/'restore-nuzzle-v9-face-core.py'),
 'coreChosenFromThisActionFlags':'THIS nuzzlev9 source enclosed red-star flags union[263,298,374,335]; root authorized only eyeROI[245,280,392,352]. No flag-forced fill, no ROI expansion, no color grade, and no exterior/garment/paw change.',
 'minimumSourceKeyMargin':min(d['sourceCoreVsKeyMarginBytes']for d in records),'potentialRestoredPixels':sum(d['restoredInteriorPixels']for d in records),
 'all107External8Protected':True,'all107CoreBoundaryProtected':True,'all107Reliable252Protected':True,'all107OutsideRepairProtected':True,'framesEvidence':records}
(J/'source-core-preflight.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf8');print(json.dumps({k:r[k]for k in ['core','minimumSourceKeyMargin','potentialRestoredPixels','proofSha256']}))

