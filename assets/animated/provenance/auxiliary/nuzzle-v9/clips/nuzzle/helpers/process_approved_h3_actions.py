"""Stage complete approved-source H3 action frames for review, without installation.

Green signal becomes a separate alpha matte. Conservative white-fringe color
decontamination follows inverse compositing. No local anatomy/eye/mouth edits,
optical flow, per-frame fitting, reversal, or temporal blending are performed.
"""
from pathlib import Path
import argparse, hashlib, json, subprocess
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from build_watch_matte import extract_matte,resize_soft,save_rgba,composite

ROOT=Path(__file__).resolve().parents[1]
REVISION='approved-static-20261018'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def read(p):return json.loads(p.read_text(encoding='utf-8'))

def process_one(args):
    source,out,index,source_index,fps,scale,tx,ty=args
    image=Image.open(source).convert('RGB')
    original,matte,_=extract_matte(image)
    repaired,_,detail=extract_matte(image,edge_decontamination=True)
    assert np.array_equal(original[:,:,3],repaired[:,:,3])
    native_path=Path(out)/'native'/f'{index:03}.png'
    save_rgba(repaired,native_path)
    # All frames use exactly the same source-to-canonical transform. Resize
    # premultiplied RGB/alpha together before the fixed integer canvas offset.
    width=round(image.width*scale);height=round(image.height*scale)
    resized=resize_soft(repaired,(width,height))
    canvas=Image.new('RGBA',(640,640));canvas.alpha_composite(Image.fromarray(np.uint8(np.rint(resized*255))),(round(tx),round(ty)))
    file=f'{index:03}.png';path=Path(out)/'rgba'/file;canvas.save(path)
    canvas.save(Path(out)/'webp'/f'{index:03}.webp',format='WEBP',lossless=True,exact=True,method=4)
    alpha=np.asarray(canvas.getchannel('A'));yy,xx=np.where(alpha>=128)
    bounds=[int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1] if len(xx) else None
    pixels=np.asarray(canvas,dtype=float)/255
    # On three backgrounds, save every frame so QA is not limited to thumbnails.
    for name,bg in [('black',[0,0,0]),('gray',[127,127,127]),('white',[255,255,255])]:
        composite(pixels,bg).save(Path(out)/name/f'{index:03}.png')
    if index%12==0:
        Image.fromarray(np.uint16(np.rint(matte*65535))).save(Path(out)/'matte'/f'{index:03}-background.png')
        Image.fromarray(np.uint16(np.rint((1-matte)*65535))).save(Path(out)/'matte'/f'{index:03}-alpha.png')
        for tag,rgba in [('before',original),('after',repaired)]:
            composite(rgba,[0,0,0]).save(Path(out)/'proof'/f'{index:03}-{tag}.png')
    # Source clipping is measured before cropping unused green margins.
    srcalpha=repaired[:,:,3]
    source_edge=bool((srcalpha[:4]>.5).any() or (srcalpha[-4:]>.5).any() or (srcalpha[:,:4]>.5).any() or (srcalpha[:,-4:]>.5).any())
    return {'id':f'{index:03}','file':file,'sha256':sha(path),'sourceFrame':source_index,
       'atMs':round(index*1000/fps,3),'durationMs':round((index+1)*1000/fps)-round(index*1000/fps),
       'visibleBounds':bounds,'pivot':[320,608],'sourceTouchesBorder':source_edge,
       'detail':detail}

def previews(out,records,fps):
    for bg in ['black','gray','white']:
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(fps),'-i',str(out/bg/'%03d.png'),
          '-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(out/f'preview-{bg}.mp4')],check=True)
    selected=np.linspace(0,len(records)-1,min(16,len(records))).round().astype(int)
    board=Image.new('RGB',(4*320,4*350),'#191c22');draw=ImageDraw.Draw(board)
    font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',18)
    for n,index in enumerate(selected):
        im=Image.open(out/'black'/f'{index:03}.png').resize((320,320),Image.Resampling.LANCZOS)
        x=n%4*320;y=n//4*350;board.paste(im,(x,y+30));draw.text((x+10,y+5),f'{index:03}  {index/fps:.2f}s',font=font,fill='white')
    board.save(out/'contact-sheet.jpg',quality=94)
    # Every exported frame is represented, not only a sparse contact sheet.
    for start in range(0,len(records),24):
        page=Image.new('RGB',(6*200,4*222),'#12151c');d=ImageDraw.Draw(page)
        for cell,index in enumerate(range(start,min(start+24,len(records)))):
            x=cell%6*200;y=cell//6*222
            im=Image.open(out/'black'/f'{index:03}.png').resize((200,200),Image.Resampling.LANCZOS)
            page.paste(im,(x,y+22));d.text((x+4,y+1),f'{index:03}',font=font,fill='white')
        page.save(out/f'all-frames-{start//24+1:02}.jpg',quality=95)
    data=[r['file'] for r in records]
    html='''<!doctype html><meta charset="utf-8"><title>Umi H3 动作验收</title>
<style>body{background:#12151c;color:#e1ebfa;font:16px system-ui;margin:32px}h1{font-size:24px}.row{display:flex;flex-wrap:wrap;gap:20px}.cell{width:320px}.stage{width:320px;height:320px}canvas{width:100%;height:100%}button,input{margin:10px 4px;padding:8px}a{color:#8ec5ff}video{width:320px}small{color:#b8c7df}</style>
<h1>新 H3 完整帧 · 绿亮度 alpha＋白边处理</h1><p>检查折耳、缝线、爪形、配色、白毛轮廓和循环接缝。三个底色使用同一份 RGBA。尚未安装新动作。</p>
<div class="row" id="stages"></div><button id="play">暂停</button><button id="prev">上一帧</button><button id="next">下一帧</button><label>速度 <select id="speed"><option value="1">原速</option><option value=".5">半速</option><option value=".25">四分之一速</option></select></label><input id="slider" type="range" min="0"><span id="frame"></span>
<p><a href="contact-sheet.jpg">完整周期联系表</a> · <a href="report.json">处理与检查记录</a></p><div class="row"><div><p>绿底原始生成视频</p><video controls src="source.mp4"></video></div><div><p>黑底处理后</p><video controls loop src="preview-black.mp4"></video></div></div>
<script>const files=FILES,fps=FPS,images=files.map(f=>{let x=new Image;x.src='rgba/'+f;return x});let running=true,current=0,last=performance.now(),acc=0;const colors=['#000','#7f7f7f','#fff'];let canvases=colors.map((bg,i)=>{let box=document.createElement('div');box.className='cell';box.innerHTML='<p>'+['黑底','灰底','白底'][i]+'</p><div class="stage" style="background:'+bg+'"><canvas width="640" height="640"></canvas></div>';stages.append(box);return box.querySelector('canvas').getContext('2d')});slider.max=files.length-1;function paint(){canvases.forEach(c=>{c.clearRect(0,0,640,640);if(images[current].complete)c.drawImage(images[current],0,0)});slider.value=current;frame.textContent=(current+1)+' / '+files.length+' · '+(current/fps).toFixed(2)+'s'}play.onclick=()=>{running=!running;play.textContent=running?'暂停':'播放';acc=0};function step(d){running=false;play.textContent='播放';current=(current+d+files.length)%files.length;paint()}prev.onclick=()=>step(-1);next.onclick=()=>step(1);slider.oninput=()=>{running=false;play.textContent='播放';current=+slider.value;paint()};function tick(now){let dt=Math.min(100,now-last);last=now;if(running){acc+=dt*+speed.value;while(acc>=1000/fps){current=(current+1)%files.length;acc-=1000/fps}}paint();requestAnimationFrame(tick)}requestAnimationFrame(tick)</script>'''
    (out/'index.html').write_text(html.replace('FILES',json.dumps(data)).replace('FPS',str(fps)),encoding='utf-8')

def main():
    p=argparse.ArgumentParser();p.add_argument('--job',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--fps',type=int,default=24);p.add_argument('--workers',type=int,default=3)
    p.add_argument('--translate-y',type=int,default=0,help='One fixed whole-clip framing translation; never changes character scale')
    args=p.parse_args()
    if abs(args.translate_y)>128:raise ValueError('Framing translation must remain within the review canvas budget')
    job=args.job.resolve();out=args.out.resolve();spec=read(job/'spec.json');action=spec['action']
    if action not in ['watch','search','emotion-grumpy','idle-open','think','work']:
        raise ValueError(f'Action has not entered the reviewed processing workflow: {action}')
    pack=ROOT/'Hi-Res/approved-static-20261018'
    approved=next(r for r in read(pack/'manifest.json')['records'] if r['id']==action)
    if sha(pack/approved['file']) != approved['sha256'] or spec['sourceSha256'] != approved['sha256']:
        raise ValueError('H3 reference does not bind the current frozen approved source')
    assert spec['model']=='MiniMax-H3';query=read(job/'query.json')['task'];assert query['model']=='MiniMax-H3' and query['status']=='succeeded'
    source=job/f'Umi-{action}-H3-source.mp4';assert source.exists()
    if out.exists() and any(out.iterdir()):
        raise ValueError('Use a new empty output directory; never mix prior frame sequences')
    meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(source)]))
    video=next(v for v in meta['streams'] if v['codec_type']=='video');width=video['width'];height=video['height'];assert width==height
    duration=float(video.get('duration',meta['format']['duration']));assert 5<=duration<=8
    for folder in ['decoded','rgba','native','webp','black','gray','white','matte','proof']:(out/folder).mkdir(parents=True,exist_ok=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-fps_mode','passthrough','-start_number','0',str(out/'decoded'/'%05d.png')],check=True)
    decoded=sorted((out/'decoded').glob('*.png'))
    timing=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames',
       '-show_entries','frame=best_effort_timestamp_time','-of','json',str(source)]))
    timestamps=np.asarray([float(f['best_effort_timestamp_time']) for f in timing['frames']])
    assert len(timestamps)==len(decoded) and np.all(np.diff(timestamps)>0)
    timestamps-=timestamps[0]
    rate=video['avg_frame_rate'].split('/');sourcefps=int(rate[0])/int(rate[1])
    # Preserve the entire returned period, including a possible endpoint frame.
    # Never silently cut the last part of a provider's complete cycle to 6s.
    import math
    decoded_duration=timestamps[-1]+(float(np.median(np.diff(timestamps))))
    count=math.ceil(decoded_duration*args.fps-1e-3)
    period=round(count*1000/args.fps)
    indices=[int(np.argmin(np.abs(timestamps-n/args.fps))) for n in range(count)]
    assert all(b>a for a,b in zip(indices,indices[1:])),'Sampling may not synthesize/duplicate frames; choose lower fps'
    # Derived solely from the documented reference transform and approved
    # static registration. Deliberately never compute a per-frame foreground fit.
    ref=spec['sourceToReference']
    registration=read(ROOT/'Hi-Res/approved-static-20261018/runtime-registration.json')['records'][action]
    canonical_scale=registration['scale'];offset=registration['offset']
    refscale=canonical_scale/ref['scale'];scale=refscale*1280/width
    tx=offset[0]-ref['x']*refscale;ty=offset[1]-ref['y']*refscale+args.translate_y
    tasks=[(str(decoded[s]),str(out),n,s,args.fps,scale,tx,ty) for n,s in enumerate(indices)]
    records=[]
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        for record in pool.map(process_one,tasks):
            records.append(record)
            if len(records)%24==0:print(json.dumps({'action':action,'processed':len(records),'total':count}),flush=True)
    import shutil
    shutil.copy2(source,out/'source.mp4')
    frames=[{k:v for k,v in r.items() if k!='detail'} for r in records]
    transforms={'scale':scale,'x':tx,'y':ty,'referenceToCanonicalScale':refscale,'perFrameFit':False,'nonUniformScale':False,
      'wholeClipFramingTranslation':[0,args.translate_y]}
    manifest={'schemaVersion':1,'action':action,'source':{'file':str(source),'sha256':sha(source),'fps':sourcefps,'width':width,'height':height,'model':'MiniMax-H3'},
      'approvedSourceSha256':spec['sourceSha256'],'canvas':[640,640],'pivot':[320,608],'periodMs':period,'fps':args.fps,
      'sampling':{'method':'uniform nearest measured source PTS, forward only','sourcePtsSeconds':timestamps.tolist(),'reverse':False,'interpolation':False,'crossfade':False},
      'processing':{'alpha':'green-luminance matte inverse','edgeRepair':'dark-contour-local-4px-v1, alpha and opaque RGB unchanged','transform':transforms},'frames':frames}
    write(out/'manifest.json',manifest)
    edge=[r['detail']['edgeColorDecontamination'] for r in records]
    report={'status':'AWAITING_VISUAL_REVIEW','manualAccepted':False,'action':action,'frameCount':count,'sourceIndicesStrictlyIncreasing':True,
      'alphaExactlyUnchangedDuringWhiteFringeRepair':all(e['alphaExactlyUnchanged'] for e in edge),
      'opaqueRgbExactlyUnchanged':all(e['opaqueRgbExactlyUnchanged'] for e in edge),
      'correctedEdgePixels':sum(e['correctedPixels'] for e in edge),'sourceBorderTouchFrames':[r['id'] for r in records if r['sourceTouchesBorder']],
      'canonicalBorderTouchFrames':[r['id'] for r in records if not r['visibleBounds'] or min(r['visibleBounds'][:2])<4 or max(r['visibleBounds'][2:])>636],
      'registration':transforms,'perFrameDetails':[{'id':r['id'],**r['detail']} for r in records],
      'notes':['Opaque white fur, claws, paper and alpha coverage preserved during edge RGB repair.','No claim of anatomical or seam approval from numeric checks.','Runtime assets not changed by this staging tool.']}
    # Measurements are warnings for human inspection, not anatomy approval.
    small=[]
    for r in records:
        a=np.asarray(Image.open(out/'rgba'/r['file']).resize((160,160)),dtype=float)/255
        small.append(np.concatenate((a[:,:,:3]*a[:,:,3:],a[:,:,3:]),axis=2))
    differences=[float(np.abs(b-a).mean()) for a,b in zip(small,small[1:])]
    seam=float(np.abs(small[-1]-small[0]).mean());median=float(np.median(differences))
    report['continuityMeasurements']={'consecutiveMeanAbsoluteDifferences':differences,'median':median,
      'loopSeamMeanAbsoluteDifference':seam,'seamToMedianRatio':seam/max(median,1e-9),
      'identicalAdjacentPairs':[i for i,d in enumerate(differences) if d==0],
      'warningOnly':True,'noAutomaticVisualApproval':True}
    write(out/'report.json',report);previews(out,records,args.fps)
    print(json.dumps({'staged':str(out),'action':action,'frames':count,'correctedEdgePixels':report['correctedEdgePixels'],'reviewRequired':True}),flush=True)
if __name__=='__main__':main()
