from pathlib import Path
import hashlib,json,subprocess
import numpy as np
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[2]
J=R/'Hi-Res/sources/h3-motion-polish-20261023/nuzzle/key-purple-pilot-v9'
O=J/'processed-edge-v2'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((O/'manifest.json').read_text())
assert m['canvas']==[640,640] and m['pivot']==[320,608] and len(m['frames'])==107
records=[]
for bg in ['black','gray','white']:
 for start in range(0,107,32):
  board=Image.new('RGB',(1280,736),(32,35,40));d=ImageDraw.Draw(board)
  for cell,i in enumerate(range(start,min(start+32,107))):
   x=(cell%8)*160;y=(cell//8)*184
   board.paste(Image.open(O/bg/f'{i:03}.png').resize((160,160),Image.Resampling.LANCZOS),(x,y+24))
   d.text((x+4,y+5),f'{i:03} {bg}',fill='white')
  target=O/f'full-contact-{bg}-{start//32+1:02}.jpg';board.save(target,quality=96)
  records.append({'file':target.name,'sha256':sha(target),'frames':list(range(start,min(start+32,107)))})
frames=[0,30,54,66,106];box=[120,190,500,490]
board=Image.new('RGB',(5*320,len(frames)*280),(32,35,40));d=ImageDraw.Draw(board)
for row,i in enumerate(frames):
 source=Image.open(J/'early-check'/f'{i+1:05}.png').convert('RGB').resize((640,640),Image.Resampling.LANCZOS)
 images=[source,*[Image.open(O/bg/f'{i:03}.png').convert('RGB') for bg in ['black','gray','white']],Image.open(O/'rgba'/f'{i:03}.png').getchannel('A').convert('RGB')]
 for col,(im,label) in enumerate(zip(images,['aligned source','black','gray','white','alpha'])):
  board.paste(im.crop(box).resize((320,253),Image.Resampling.NEAREST),(col*320,row*280+24))
  d.text((col*320+4,row*280+5),f'{i:03} {label}',fill='white')
board.save(O/'face-source-edge-proof.png')
video=[]
for bg in ['black','gray','white']:
 path=O/f'world-{bg}.mp4'
 info=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames,avg_frame_rate,duration','-of','json',str(path)]))['streams'][0]
 assert info['width']==info['height']==640 and info['nb_frames']=='107' and info['avg_frame_rate']=='24/1'
 video.append({'file':path.name,'sha256':sha(path),'stream':info})
result={'sourceSha256':m['source']['sha256'],'manifestSha256':sha(O/'manifest.json'),'contacts':records,'faceProof':{'file':'face-source-edge-proof.png','sha256':sha(O/'face-source-edge-proof.png'),'sourceFixedTransform':'native768 RGB to640 LANCZOS, full frame; diagnostic only','sourceFrames':frames,'crop':box},'videos':video,'humanAcceptedOutput':False,'colorCorrectionApplied':False,'note':'Edge and alpha evidence only. Existing user report of inter-clip color differences remains a separate color-pilot task.'}
(O/'proof-index.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps({'manifestSha256':result['manifestSha256'],'proofIndexSha256':sha(O/'proof-index.json'),'contacts':len(records),'nativeFrames':107,'canvas':[640,640],'colorCorrectionApplied':False}))
