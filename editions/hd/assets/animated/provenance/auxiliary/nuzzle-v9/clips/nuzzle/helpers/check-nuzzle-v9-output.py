"""Read-only complete-frame pixel/clock guards and source-feature alpha flags."""
from pathlib import Path
import hashlib, json, argparse
import numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw

R=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('action',choices=['nuzzle']);action=parser.parse_args().action
J=R/f'Hi-Res/sources/h3-motion-polish-20261023/{action}/key-purple-pilot-v9'
O=J/'processed-edge-v2'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((O/'manifest.json').read_text(encoding='utf8'))
before=json.loads((J/'processed/manifest.json').read_text(encoding='utf8'))
report=json.loads((O/'report.json').read_text(encoding='utf8'))
assert m['canvas']==[640,640] and m['pivot']==[320,608] and m['fps']==24 and m['periodMs']==4458
assert len(m['frames'])==107
keys=['id','file','sourceFrame','atMs','durationMs','pivot']
assert [{k:f[k] for k in keys} for f in m['frames']]==[{k:f[k] for k in keys} for f in before['frames']]
assert m['sampling']==before['sampling'] and m['sampling']['timeScale']==1 and not m['sampling']['reverse']
assert m['processing']['transform']==before['processing']['transform'] and m['processing']['transform']['perFrameFit'] is False
assert all(report[k] is True for k in ['sourceTimelineUnchanged','registrationUnchanged','alphaAllFramesExactlyUnchanged','opaque252RgbaAllFramesExactlyUnchanged','outsideCorrectionAllFramesExactlyUnchanged'])
base=json.loads((J/'processed/report.json').read_text(encoding='utf8'))
assert all(base[k] is True for k in ['fringeAlphaExact','fringeOpaqueRgbExact','noiseAllRgbExact','noiseSupportedAlphaExact'])
assert base['borderTouchFrames']==[]
frames=[];total=bad=interior_bad=0;worst=None
for i,frame in enumerate(m['frames']):
    png=O/'rgba'/frame['file'];v=np.asarray(Image.open(png).convert('RGBA'))
    w=np.asarray(Image.open(O/'webp'/f'{i:03}.webp').convert('RGBA'))
    assert np.array_equal(v,w) and sha(png)==frame['sha256']
    prior=np.asarray(Image.open(J/'processed/rgba'/frame['file']).convert('RGBA'))
    assert np.array_equal(v[:,:,3],prior[:,:,3]) and np.array_equal(v[prior[:,:,3]>=252],prior[prior[:,:,3]>=252])
    src=np.asarray(Image.open(J/'early-check'/f'{i+1:05}.png').convert('RGB').resize((640,640),Image.Resampling.LANCZOS)).astype(int)
    red=(src[:,:,0]>140)&(src[:,:,0]-src[:,:,1]>50)&(src[:,:,0]-src[:,:,2]>50)
    low=red&(v[:,:,3]<200)
    seed=np.zeros((640,640),bool);seed[[0,-1],:]=True;seed[:,[0,-1]]=True
    external=ndi.binary_propagation(seed,structure=np.ones((3,3),bool),mask=v[:,:,3]<252)
    n=int(low.sum());inside=int((low&~external).sum())
    total+=int(red.sum());bad+=n;interior_bad+=inside
    item={'frame':i,'rgbaSha256':sha(png),'redCoralSamples':int(red.sum()),'samplesBelowAlpha200':n,'enclosedSamplesBelowAlpha200':inside}
    if n:
        yy,xx=np.where(low);item['bbox']=[int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1];item['minimumAlpha']=int(v[:,:,3][low].min())
        if worst is None or inside>worst['enclosedSamplesBelowAlpha200']:worst=item
    frames.append(item)
if worst:
    i=worst['frame'];box=worst['bbox'];box=[max(0,box[0]-16),max(0,box[1]-16),min(640,box[2]+16),min(640,box[3]+16)]
    source=Image.open(J/'early-check'/f'{i+1:05}.png').convert('RGB').resize((640,640),Image.Resampling.LANCZOS)
    images=[source,Image.open(O/'black'/f'{i:03}.png'),Image.open(O/'white'/f'{i:03}.png'),Image.open(O/'rgba'/f'{i:03}.png').getchannel('A').convert('RGB')]
    proof=Image.new('RGB',(4*320,350),(32,35,40));d=ImageDraw.Draw(proof)
    for n,(im,label) in enumerate(zip(images,['aligned native RGB','black','white','alpha'])):
        proof.paste(im.crop(box).resize((320,320),Image.Resampling.NEAREST),(n*320,25));d.text((n*320+4,4),f'{i:03} {label}',fill='white')
    proof.save(J/'interior-alpha-flag-proof.png')
result={'status':'TECHNICAL_GUARDS_PASS_INTERIOR_FEATURE_FLAGS_REQUIRE_ACTUAL_REVIEW' if interior_bad else 'TECHNICAL_GUARDS_PASS_NO_ENCLOSED_RED_ALPHA_FLAG',
    'sourceVideoSha256':m['source']['sha256'],'manifestSha256':sha(O/'manifest.json'),'sourceProcessingAuthorizationSha256':sha(J/'source-processing-authorization.json'),
    'frameCount':107,'fps':24,'periodMs':4458,'canvas':[640,640],'pivot':[320,608],'sourceTimelineUnchanged':True,'perFrameFit':False,
    'losslessWebpExactAllRgba':True,'edgeAlphaExactAll107':True,'edgeOpaque252RgbaExactAll107':True,'stage1Guards':base,
    'redCoralSamples':total,'samplesBelowAlpha200':bad,'enclosedSamplesBelowAlpha200':interior_bad,'worst':worst,'frames':frames,
    'diagnosticScope':'Original same-fixed-resize red/coral source evidence only; flags require visual review. No fill or opaque core is authorized by this diagnostic.',
    'humanAcceptedOutput':False,'runtimeInstalled':False}
(J/'edge-technical-review.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:result[k] for k in ['status','frameCount','redCoralSamples','samplesBelowAlpha200','enclosedSamplesBelowAlpha200','worst']}))
