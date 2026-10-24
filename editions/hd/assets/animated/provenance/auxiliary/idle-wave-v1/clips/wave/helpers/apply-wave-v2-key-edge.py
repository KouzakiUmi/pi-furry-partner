"""Versioned derivative of complete color-key pilot; preserve alpha/time/registration."""
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import json,sys,subprocess,importlib.util,argparse
import numpy as np
from PIL import Image
ROOT=Path('D:/Software Projects/pi-furry-partner');HERE=Path(__file__).parent;sys.path.insert(0,str(ROOT/'scripts'))
import process_approved_h3_actions as core
sp=importlib.util.spec_from_file_location('edge_repair',HERE/'repair-key-edge-color.py');edge=importlib.util.module_from_spec(sp);sp.loader.exec_module(edge)
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def one(args):
 source,out,key,n=args;source=Path(source);out=Path(out);v=np.asarray(Image.open(source).convert('RGBA'));clean,report=edge.repair_key_edge(v,key);name=f'{n:03}.png'
 im=Image.fromarray(clean);im.save(out/'rgba'/name);im.save(out/'webp'/f'{n:03}.webp',lossless=True,exact=True,method=4)
 for bg,color in [('black',[0]*3),('gray',[127]*3),('white',[255]*3)]:edge.composite(clean,color).save(out/bg/name)
 return {'frame':n,'sha256':core.sha(out/'rgba'/name),'preEdgeSha256':core.sha(source),**report}
def process(a,method,version):
 job=ROOT/f'Hi-Res/sources/h3-motion-polish-20261023/{a}/key-{method}-{version}';old=job/'processed';out=job/'processed-edge-v2';assert not out.exists(),'Fresh derivative required'
 manifest=json.loads((old/'manifest.json').read_text(encoding='utf-8'));spec=json.loads((job/'spec.json').read_text(encoding='utf-8'));key=spec['keyColor']
 for folder in ['rgba','webp','black','gray','white']:(out/folder).mkdir(parents=True,exist_ok=True)
 with ProcessPoolExecutor(max_workers=3) as pool:results=list(pool.map(one,[(str(old/'rgba'/r['file']),str(out),key,i) for i,r in enumerate(manifest['frames'])]))
 for r,result in zip(manifest['frames'],results):r.update(sha256=result['sha256'],preEdgeSha256=result['preEdgeSha256'])
 manifest['processing']['softEdgeColorReconstruction']={'file':str(HERE/'repair-key-edge-color.py'),'sha256':core.sha(HERE/'repair-key-edge-color.py'),'version':'soft-key-edge-foreground-color-v1','scope':'Only anomalous external soft-edge RGB from local reliable foreground; alpha and alpha>=252 RGBA unchanged','preEdgeManifestSha256':core.sha(old/'manifest.json')}
 rect=spec['worldPaintRect'];assert rect=={'x':0,'y':0,'width':640,'height':640};manifest['processing']['worldPreviewPaintRect']=rect
 write(out/'manifest.json',manifest)
 report={'status':'AWAITING_TWO_REVIEWERS_AND_USER','humanAccepted':False,'runtimeInstalled':False,'frameCount':len(results),'periodMs':manifest['periodMs'],'sourceTimelineUnchanged':True,'registrationUnchanged':True,'alphaAllFramesExactlyUnchanged':all(r['sourceAlphaExactlyUnchanged'] for r in results),'opaque252RgbaAllFramesExactlyUnchanged':all(r['opaqueRgbaExactlyUnchanged'] for r in results),'outsideCorrectionAllFramesExactlyUnchanged':all(r['unchangedOutsideEligible'] for r in results),'changedSoftRgbPixels':sum(r['changedRgbPixels'] for r in results),'limitation':'Local edge RGB estimate, not a lossless claim; full native forward source retained. No source art recolor.'}
 write(out/'report.json',report);write(out/'per-frame-edge-report.json',results);core.previews(out,manifest['frames'],manifest['fps'])
 for bg in ['black','gray','white']:subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(out/f'preview-{bg}.mp4'),'-vf',f"crop=640:640:{-rect['x']}:{-rect['y']}",'-an','-c:v','libx264','-preset','veryfast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(out/f'world-{bg}.mp4')],check=True)
 print(json.dumps({'method':method,'version':version,'report':report}),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['wave']);p.add_argument('method',choices=['purple','yellow']);p.add_argument('--version',default='pilot-v2');a=p.parse_args();process(a.action,a.method,a.version)

