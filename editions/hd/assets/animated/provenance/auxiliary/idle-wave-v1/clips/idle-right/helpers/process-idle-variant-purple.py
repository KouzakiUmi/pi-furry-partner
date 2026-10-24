"""Stage new H3 pilots with full native PTS, shared registration and reviewed matte."""
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import argparse,json,shutil,subprocess,sys,hashlib
import numpy as np
from PIL import Image
ROOT=Path('D:/Software Projects/pi-furry-partner');sys.path.insert(0,str(ROOT/'scripts'))
import process_approved_h3_actions as core
from build_watch_matte import remove_distant_low_alpha_noise, decontaminate_dark_contour_edges
import importlib.util
_ns=importlib.util.spec_from_file_location("key_pilot",Path(__file__).with_name("key-color-matte.py"))
_key=importlib.util.module_from_spec(_ns);_ns.loader.exec_module(_key)
_MODELS={}
_KEYS={"purple":"#A020C0","yellow":"#E8D600"}
BASE=ROOT/'Hi-Res/sources/h3-motion-polish-20261023'
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def one(args):
 path,out,index,scale,pivot,size=args;out=Path(out);im=Image.open(path).convert('RGB')
 method=out.parent.name.split('-')[1];key=_KEYS[method]
 if key not in _MODELS:_MODELS[key]=_key.build_foreground_model([BASE/a/'gray-batch03-v1/registered-reference.png' for a in ['wait','rest']],key)
 rgba,diagnostic=_key.extract_key_color_matte(im,key,_MODELS[key],method='trimap')
 rgba,edge=decontaminate_dark_contour_edges(rgba);matte=1-rgba[:,:,3];detail={'edgeColorDecontamination':edge,'keyChromaMatte':diagnostic}
 resized=core.resize_soft(rgba,(size,size));quant=np.uint8(np.rint(np.clip(resized,0,1)*255))
 clean,noise=remove_distant_low_alpha_noise(quant);image=Image.fromarray(clean);name=f'{index:03}.png'
 image.save(out/'rgba'/name);image.save(out/'webp'/f'{index:03}.webp',lossless=True,exact=True,method=4)
 for bg,color in [('black',[0,0,0]),('gray',[127,127,127]),('white',[255,255,255])]:core.composite(clean.astype(float)/255,color).save(out/bg/name)
 if index%24==0:
  core.composite(quant.astype(float)/255,[0,0,0]).save(out/'proof'/f'{index:03}-before-noise-clean.png')
  image.getchannel('A').save(out/'proof'/f'{index:03}-alpha.png')
  Image.fromarray(np.uint16(np.rint(np.clip(matte,0,1)*65535))).save(out/'proof'/f'{index:03}-background-chroma-matte.png')
 alpha=clean[:,:,3];yy,xx=np.where(alpha>=128);bounds=[int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1] if len(xx) else None
 return {'id':f'{index:03}','file':name,'sourceFrame':index,'sha256':core.sha(out/'rgba'/name),'visibleBounds':bounds,'pivot':pivot,'edge':detail['edgeColorDecontamination'],'noise':noise}
def process(a):
 method='purple';job=BASE/'idle'/f"key-purple-{a.removeprefix('idle-')}-v1";out=job/'processed';gate=json.loads((job/'alpha-processing-gate.json').read_text(encoding='utf-8'));assert gate['status']=='SOURCE_A_B_PASSED_ROOT_AUTHORIZED_FROZEN_ALPHA'
 assert core.sha(job/f'Umi-{a}-H3-source.mp4')==gate['sourceVideoSha256']
 for who in ['A','B']:assert core.sha(job/f'source-review-{who}.json')==gate['reviews'][who]
 assert not out.exists(),'Fresh output required'
 query=json.loads((job/'query.json').read_text(encoding='utf-8'))['task'];assert query['status']=='succeeded' and query['model']=='MiniMax-H3'
 source=job/f'Umi-{a}-H3-source.mp4';meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(source)]));v=next(x for x in meta['streams'] if x['codec_type']=='video')
 num,den=v['avg_frame_rate'].split('/');fps=int(num)/int(den);assert fps==24 and v['width']==v['height']
 timing=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(source)]));times=np.array([float(f['best_effort_timestamp_time']) for f in timing['frames']]);times-=times[0]
 files=sorted((job/'early-check').glob('*.png'));assert len(files)==len(times) and np.all(np.diff(times)>0) and np.allclose(np.diff(times),1/fps,atol=.0001)
 spec=json.loads((job/'spec.json').read_text(encoding='utf-8'));pivot=spec['pivot'];size=spec['outputCanvas'][0];assert spec['outputCanvas']==[size,size];scale=size/v['width']
 for folder in ['rgba','webp','black','gray','white','proof']:(out/folder).mkdir(parents=True,exist_ok=True)
 records=[]
 with ProcessPoolExecutor(max_workers=3) as pool:
  for result in pool.map(one,[(str(f),str(out),i,scale,pivot,size) for i,f in enumerate(files)]):
   i=len(records);result['atMs']=round(times[i]*1000,3);records.append(result)
   if len(records)%24==0:print(json.dumps({'action':a,'processed':len(records),'total':len(files)}),flush=True)
 period=round((times[-1]+1/fps)*1000)
 for i,r in enumerate(records):r['durationMs']=round((times[i+1] if i+1<len(times) else period/1000)*1000)-round(times[i]*1000)
 manifest={'schemaVersion':1,'action':a,'source':{'file':str(source),'sha256':core.sha(source),'model':'MiniMax-H3','fps':fps},'approvedSourceSha256':spec['sourceSha256'],'canvas':[size,size],'pivot':pivot,'fps':fps,'periodMs':period,'frames':[{k:v for k,v in r.items() if k not in ['edge','noise']} for r in records],'processing':{'alpha':'Independent high-chroma plate signal and fixed protected foreground reference; color trimap/nearest-reliable-foreground inverse compositing; no gray spatial flood-fill','fringe':'Reviewed opt-in dark-contour-local-4px-v1','noise':'Explicit reviewed alpha128/MaxFilter9 support cleanup; no opaque RGB or supported soft alpha changes','transform':{'scale':scale,'offset':[0,0],'perFrameFit':False,'nonUniformScale':False}},'sampling':{'sourcePtsSeconds':times.tolist(),'reverse':False,'interpolation':False,'crossfade':False,'timeScale':1}}
 report={'status':'AWAITING_TWO_REVIEWERS_AND_USER','runtimeInstalled':False,'humanAccepted':False,'frameCount':len(records),'periodMs':period,'completeForwardSource':True,'sourceScale':scale,'sourceSize':[v['width'],v['height']],'borderTouchFrames':[r['id'] for r in records if not r['visibleBounds'] or min(r['visibleBounds'][:2])<4 or max(r['visibleBounds'][2:])>size-4],'fringeAlphaExact':all(r['edge']['alphaExactlyUnchanged'] for r in records),'fringeOpaqueRgbExact':all(r['edge']['opaqueRgbExactlyUnchanged'] for r in records),'noiseAllRgbExact':all(r['noise']['allRgbExactlyUnchanged'] for r in records),'noiseSupportedAlphaExact':all(r['noise']['supportedAlphaIdentical'] for r in records),'removedDistantLowAlphaPixels':sum(r['noise']['removedDistantLowAlphaPixels'] for r in records),'correctedWhiteFringePixels':sum(r['edge']['correctedPixels'] for r in records),'numericChecksDoNotApproveArt':True}
 small=[np.asarray(Image.open(out/'black'/r['file']).resize((160,160)),dtype=float)/255 for r in records];diff=[float(np.abs(b-a).mean()) for a,b in zip(small,small[1:])];report['seamWarningOnly']={'lastToFirstMAD':float(np.abs(small[-1]-small[0]).mean()),'medianAdjacentMAD':float(np.median(diff)),'maxAdjacentMAD':float(max(diff))}
 manifest['processing']['sourceAlphaProcessingGate']={'file':str(job/'alpha-processing-gate.json'),'sha256':core.sha(job/'alpha-processing-gate.json'),'humanAccepted':False}
 manifest['processing']['matteHelper']={'file':str(Path(__file__).with_name('key-color-matte.py')),'sha256':core.sha(Path(__file__).with_name('key-color-matte.py')),'method':'trimap','key':_KEYS[method],'referenceInputs':[{"file":str(BASE/q/'gray-batch03-v1/registered-reference.png'),"sha256":core.sha(BASE/q/'gray-batch03-v1/registered-reference.png')} for q in ['wait','rest']]}
 write(out/'manifest.json',manifest);write(out/'report.json',report);shutil.copy2(source,out/'source.mp4');core.previews(out,records,fps)
 page=out/'index.html';page.write_text(page.read_text(encoding='utf-8').replace('640',str(size)),encoding='utf-8')
 rect=spec['worldPaintRect'];assert rect=={'x':0,'y':0,'width':640,'height':640}
 crop=f"crop=640:640:{-rect['x']}:{-rect['y']}"
 for bg in ['black','gray','white']:
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(out/f'preview-{bg}.mp4'),'-vf',crop,'-an','-c:v','libx264','-preset','veryfast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(out/f'world-{bg}.mp4')],check=True)
 print(json.dumps({'processed':a,'report':report}),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['idle-center','idle-right']);args=p.parse_args();process(args.action)

