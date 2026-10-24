"""Reproduce all final nod frames with the reviewed guard; no output mutations."""
from pathlib import Path
import importlib.util, json, hashlib, sys
import numpy as np
from PIL import Image, ImageDraw
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
variant=sys.argv[1];assert variant in ['center','right']
J=R/f'Hi-Res/sources/h3-motion-polish-20261023/idle/key-purple-{variant}-v1';O=J/'processed-detail-v1';OLD=J/'processed-edge-v2'
sp=importlib.util.spec_from_file_location('nod_final_guard',H/'restore-idle-variant-face-core.py');guard=importlib.util.module_from_spec(sp);sp.loader.exec_module(guard)
guard.BOX=[248,280,400,355] if variant=='center' else [250,275,450,340]
worstFrame=10 if variant=='center' else 85
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=guard.read(O/'manifest.json');before=guard.read(OLD/'manifest.json');report=guard.read(O/'report.json')
assert len(m['frames'])==107 and m['fps']==24 and m['periodMs']==4458 and m['canvas']==[640,640] and m['pivot']==[320,608]
assert m['sampling']==before['sampling'] and m['processing']['transform']==before['processing']['transform']
assert {p.name for p in (O/'rgba').glob('*.png')}=={f'{i:03}.png' for i in range(107)}
bad=total=0;minimum=255;restored=0
for i,f in enumerate(m['frames']):
    v=np.asarray(Image.open(O/'rgba'/f'{i:03}.png').convert('RGBA'));webp=np.asarray(Image.open(O/'webp'/f'{i:03}.webp').convert('RGBA'))
    prior=np.asarray(Image.open(OLD/'rgba'/f'{i:03}.png').convert('RGBA'));src=np.asarray(Image.open(J/'early-check'/f'{i+1:05}.png').convert('RGB').resize((640,640),Image.Resampling.LANCZOS))
    expected,detail=guard.recover(prior,src)
    assert np.array_equal(v,expected) and np.array_equal(v,webp) and sha(O/'rgba'/f'{i:03}.png')==f['sha256']
    keys=['id','file','sourceFrame','atMs','durationMs','pivot'];assert all(f[k]==before['frames'][i][k] for k in keys)
    red=src.astype(int);red=(red[:,:,0]>140)&(red[:,:,0]-red[:,:,1]>50)&(red[:,:,0]-red[:,:,2]>50)
    n=int(red.sum());total+=n;bad+=int((red&(v[:,:,3]<200)).sum());minimum=min(minimum,int(v[:,:,3][red].min()) if n else 255);restored+=detail['restoredInteriorPixels']
    for k in ['external8ConnectedRgbaExactlyUnchanged','reliable252RgbaExactlyUnchanged','outsideRepairExactlyUnchanged','fixedCoreBoundaryRgbaUnchanged']:assert detail[k] is True
    if i==worstFrame:
        badsrc=src.copy();x0,y0,x1,y1=guard.BOX;badsrc[y0:y1,x0:x1]=[160,32,192]
        try:guard.recover(prior,badsrc)
        except AssertionError:pass
        else:raise AssertionError('A false core containing actual key color was not refused')
assert bad==0 and restored==report['changedAlphaInteriorPixels']
proof=Image.new('RGB',(5*240,265),(32,35,40));draw=ImageDraw.Draw(proof);flag=guard.read(J/'edge-technical-review.json')['worst']['bbox'];box=[max(0,flag[0]-16),max(0,flag[1]-16),min(640,flag[2]+16),min(640,flag[3]+16)]
images=[Image.open(J/'early-check'/f'{worstFrame+1:05}.png').convert('RGB').resize((640,640),Image.Resampling.LANCZOS),Image.open(OLD/'black'/f'{worstFrame:03}.png'),Image.open(O/'black'/f'{worstFrame:03}.png'),Image.open(O/'white'/f'{worstFrame:03}.png'),Image.open(O/'rgba'/f'{worstFrame:03}.png').getchannel('A').convert('RGB')]
for n,(image,label) in enumerate(zip(images,['native source','old edge HOLD','final black','final white','final alpha'])):
    proof.paste(image.crop(box).resize((240,240),Image.Resampling.NEAREST),(n*240,25));draw.text((n*240+4,4),label,fill='white')
proof.save(J/'detail-eye-proof.png')
result={'status':'COMPLETE107_TECHNICAL_GUARDS_PASS_A_B_USER_EDGE_REVIEW_PENDING','sourceVideoSha256':m['source']['sha256'],'manifestSha256':sha(O/'manifest.json'),'helperSha256':sha(H/'restore-idle-variant-face-core.py'),'sourceAlphaGateSha256':sha(J/'alpha-processing-gate.json'),'frameCount':107,'fps':24,'periodMs':4458,'canvas':[640,640],'pivot':[320,608],'perFrameFit':False,'sourceTimelineExactlyUnchanged':True,'reproducedFinalRgbaAll107':True,'pngWebpAllRgbaExactlyEqual':True,'external8RgbaAll107ExactlyUnchanged':True,'coreBoundaryAll107ExactlyUnchanged':True,'reliable252RgbaAll107ExactlyUnchanged':True,'outsideRepairAll107ExactlyUnchanged':True,'sourceKeyFalseCoreRefused':True,'redCoralSamples':total,'samplesBelowAlpha200':bad,'minimumRedCoralAlpha':minimum,'restoredInteriorPixels':restored,'reviewedSourceSpecificCore':guard.BOX,'humanAcceptedOutput':False,'runtimeInstalled':False,'outputReviewScope':'No dynamic or artistic acceptance implied by these complete-frame technical assertions.'}
(J/'detail-technical-review.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps(result))
