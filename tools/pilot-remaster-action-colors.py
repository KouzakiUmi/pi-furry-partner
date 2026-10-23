"""Review-only chroma pilot for the two existing action videos.

Keep original native pixels, alpha, luminance, motion and clocks. Do not publish
or overwrite runtime resources. Shadows retain their original brightness.
"""
from pathlib import Path
import hashlib,json,subprocess
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/remaster-color-audit-20261022/pilot-v1'
LUMA=np.array([.2126,.7152,.0722])
TARGET=np.array([80.,97.,117.]) # Authoritative hood material #506175.
def smooth(x,a,b):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def transform(a,action):
    rgb=a[:,:,:3].astype(float);r,g,b=rgb.transpose(2,0,1)
    y=rgb@LUMA;spread=rgb.max(2)-rgb.min(2)
    visible=smooth(a[:,:,3],16,160)
    # Neutral materials: remove only warm/olive drift. Cool rendering shadows
    # stay unchanged; intensity and the light/dark tail partition are retained.
    neutral=smooth(np.maximum(r-b,g-b),.7,4)*(1-smooth(spread,18,34))*smooth(y,35,80)*visible
    yy,xx=np.mgrid[:a.shape[0],:a.shape[1]]
    if action=='search':
        # Papers are props, not white fur; do not infer their color from fur.
        paper=(yy>=450)&((xx<405)|(yy>=590))&(rgb.min(2)>155)
        neutral[paper]=0
    neutral_rgb=np.repeat(y[:,:,None],3,axis=2)
    result=rgb+(neutral_rgb-rgb)*neutral[:,:,None]
    # Hood/cape: correct green-biased bluegray toward the material hue, with
    # unchanged luminance and B-R span. Do not flatten lighting or recolor scarf.
    excess=(g-r)-(TARGET[1]-TARGET[0])/(TARGET[2]-TARGET[0])*(b-r)
    cloth=smooth(excess,1,6)*smooth(b-r,7,18)*(1-smooth(spread,65,90))*smooth(y,24,45)*(1-smooth(rgb.max(2),165,185))*visible
    if action=='watch':
        face=((xx-320)/170)**2+((yy-300)/133)**2<=1
        handle=(xx>=170)&(xx<=320)&(yy>=345)&(yy<=515)&(b>r+18)&(b>g+10)
        cloth[face|handle]=0
    desired=y[:,:,None]+((b-r)/(TARGET[2]-TARGET[0]))[:,:,None]*(TARGET-TARGET@LUMA)
    result=result+(desired-rgb)*cloth[:,:,None]
    out=a.copy();out[:,:,:3]=np.uint8(np.clip(np.rint(result),0,255));out[a[:,:,3]==0]=a[a[:,:,3]==0]
    diff=(out[:,:,:3].astype(float)-rgb)@LUMA
    assert np.array_equal(a[:,:,3],out[:,:,3])
    assert np.abs(diff[a[:,:,3]>0]).max()<1.01
    return out,{'changedVisibleRgbPixels':int(((out[:,:,:3]!=a[:,:,:3]).any(2)&(a[:,:,3]>0)).sum()),
                'maxLuminanceDifference8bit':float(np.abs(diff[a[:,:,3]>0]).max()),'alphaExactlyUnchanged':True}

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((ROOT/'assets/hires/umi/manifest.json').read_text())
    records={}
    for action in ['watch','search']:
        clip=next(iter(manifest['animations'][action]['clips'].values()))
        assert clip['durationMs'] in [6583,4833]
        frames=clip['frames'];folder=OUT/action;folder.mkdir(exist_ok=True)
        rgba=folder/'rgba';rgba.mkdir(exist_ok=True)
        video=folder/'comparison.mp4'
        encoder=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24',
           '-s','1920x680','-r','24','-i','-','-an','-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',str(video)],stdin=subprocess.PIPE)
        rows=[];samples={0,len(frames)//2,len(frames)-1}
        idle=Image.open(ROOT/'assets/hires/umi/poses/idle-open.webp').convert('RGBA')
        for n,f in enumerate(frames):
            source=ROOT/f'assets/hires/umi/{action}/{f["id"]}.webp'
            before=Image.open(source).convert('RGBA');a=np.array(before)
            after,checks=transform(a,action)
            candidate=rgba/f'{n:03}.png';Image.fromarray(after).save(candidate)
            canvas=Image.new('RGB',(1920,680),'#172233');draw=ImageDraw.Draw(canvas)
            for col,(title,im) in enumerate([('CURRENT ORDINARY',before),('COLOR PILOT - SAME ACTION',Image.fromarray(after)),('REFERENCE IDLE',idle)]):
                draw.text((col*640+10,10),title,fill='white')
                canvas.paste(Image.alpha_composite(Image.new('RGBA',im.size,'#172233'),im).convert('RGB'),(col*640,40))
            encoder.stdin.write(canvas.tobytes())
            if n in samples:canvas.save(folder/f'comparison-{n:03}.png')
            rows.append({'id':f['id'],'atMs':f['atMs'],'sourceSha256':sha(source),'candidateSha256':sha(candidate),**checks})
        encoder.stdin.close();assert encoder.wait()==0
        records[action]={'periodMs':clip['durationMs'],'frameCount':len(rows),'nativeSize':[640,640],
           'allAlphaExactlyUnchanged':True,'allClocksAndGeometryUnchanged':True,'frames':rows}
    report={'status':'PILOT_AWAITING_USER_REVIEW','runtimeApplied':False,'newUserApproval':False,
       'method':'Chroma-only neutral drift and bluegray green-excess correction; keep per-pixel luminance and alpha',
       'materialCard':{'white':'#FFFFFF','gray':'#A6A6A6','darkGray':'#858585','hood':'#506175'},
       'reasonPriorSourceStillWrong':'Earlier object-protection masks explicitly restored source hand/tail colors, so their warm cast survived cape-only correction.',
       'clips':records}
    (OUT/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':report['status'],'output':str(OUT),'frames':{k:v['frameCount'] for k,v in records.items()}}))
if __name__=='__main__':main()
