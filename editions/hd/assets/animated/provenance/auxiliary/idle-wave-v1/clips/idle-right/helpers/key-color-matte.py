#!/usr/bin/env python3
"""Work-only reference-bounded chroma matte pilot, not production approved.

Purple #A020C0 and yellow #E8D600 use independent opponent-color signals.
Unlike the rejected zero-foreground-chroma cone, a fixed reference foreground
signal bound explicitly protects existing tinted white/gray shadows. Default
method is signal-bound. Experimental method=envelope is retained as a failed
codec-fringe comparison. Conservative alpha may be too thick. A single plate
does not uniquely recover unknown foreground RGB/alpha.
No RGB-distance flood fill, silhouette/core fill, erosion or per-frame fitting.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import subprocess
import numpy as np
from PIL import Image
from scipy.spatial import ConvexHull
from scipy import ndimage as ndi

ROOT=Path(__file__).resolve().parents[2]
KEYS={'purple':'#A020C0','yellow':'#E8D600'}
PALETTE=np.array([[255,255,255],[166,166,166],[133,133,133],[137,180,231],
                  [255,200,195],[80,97,117],[59,72,87],[0,0,0]],dtype=float)/255

def key_rgb(key):
    if key in KEYS:key=KEYS[key]
    if key not in KEYS.values():raise ValueError('This scoped pilot accepts #A020C0 or #E8D600 only')
    return np.array([int(key[i:i+2],16) for i in (1,3,5)],dtype=float)/255

def chroma(rgb,key):
    # Separate subtractive chroma measurements for the two actual plates.
    if key in ('purple','#A020C0'):
        return np.stack((rgb[...,0]-rgb[...,1],rgb[...,2]-rgb[...,1]),axis=-1)
    return np.stack((rgb[...,0]-rgb[...,2],rgb[...,1]-rgb[...,2]),axis=-1)

def build_foreground_model(references,key,*,chroma_guard_bytes=6):
    """Fixed material envelope, fitted once to clean references, never to frames.

    Only alpha>=.98 reference pixels contribute, plus the protected original
    material palette. Six chroma bytes expand the envelope conservatively for
    byte quantization and mild codec error. This is a disclosed color prior;
    source colors outside it remain uncertain, never artistically recolored.
    """
    key_rgb(key)
    samples=[PALETTE];inputs=[]
    for reference in references:
        if isinstance(reference,(str,Path)):
            path=Path(reference);array=np.asarray(Image.open(path).convert('RGBA'),dtype=float)/255
            inputs.append({'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        else:array=np.asarray(reference,dtype=float)
        if array.ndim!=3 or array.shape[-1]!=4:raise ValueError('References must be normalized HxWx4 RGBA or paths')
        solid=array[:,:,3]>=.98
        if not solid.any():raise ValueError('Reference has no reliable foreground')
        samples.append(array[:,:,:3][solid])
    foreground_rgb=np.concatenate(samples)
    points=np.unique(chroma(foreground_rgb,key),axis=0)
    hull=ConvexHull(points)
    equations=hull.equations.copy() # unit normal dot F + offset <=0
    equations[:,2]-=chroma_guard_bytes/255
    excess=np.minimum(foreground_rgb[:,0],foreground_rgb[:,2])-foreground_rgb[:,1] if key in ('purple','#A020C0') else np.minimum(foreground_rgb[:,0],foreground_rgb[:,1])-foreground_rgb[:,2]
    return {'key':KEYS.get(key,key),'equations':equations,'guardBytes':chroma_guard_bytes,
            'signalUpperBound':float(max(0,excess.max())+chroma_guard_bytes/255),
            'referenceInputs':inputs,'referenceChromaSamples':len(points),'hullFaces':len(equations)}

def extract_key_color_matte(image,key,model,*,edge_decontamination=False,method='signal-bound'):
    """Return straight float64 RGBA and detail; default method=signal-bound.

    The following describes only the retained experimental envelope method:
    C=(1-b)F+bB. Each foreground half-plane requires h(C)-b*h(B)<=0.
    The maximum positive h(C)/h(B) gives the minimum feasible background
    amount. Reference foreground inside its envelope has b=0 and unchanged
    source RGB. Unknown colors with no feasible mixture are kept rather than
    punched out, and counted. The method does NOT prove all foreground is in
    the learned gamut, nor recover true translucent-edge alpha uniquely.
    """
    if method=='signal-bound':
        return extract_signal_bound_matte(image,key,model,edge_decontamination=edge_decontamination)
    if method=='trimap':
        return extract_color_trimap_matte(image,key,model,edge_decontamination=edge_decontamination)
    if method!='envelope':raise ValueError('method must be signal-bound, trimap or envelope')
    nominal=key_rgb(key)
    if model['key']!=KEYS.get(key,key):raise ValueError('Foreground model/key mismatch')
    rgb=np.asarray(image.convert('RGB'),dtype=float)/255
    border=np.concatenate((rgb[:8].reshape(-1,3),rgb[-8:].reshape(-1,3),rgb[:,:8].reshape(-1,3),rgb[:,-8:].reshape(-1,3)))
    near=np.max(abs(border-nominal),axis=1)<=24/255
    if near.mean()<.1:raise ValueError('Insufficient stable declared-key border samples')
    bg=np.median(border[near],axis=0)
    color_chroma=chroma(rgb,key);bg_chroma=chroma(bg,key)
    equations=model['equations']
    background=np.zeros(rgb.shape[:2]);key_separation=0
    for nx,ny,offset in equations:
        hb=nx*bg_chroma[0]+ny*bg_chroma[1]+offset
        hc=nx*color_chroma[:,:,0]+ny*color_chroma[:,:,1]+offset
        if hb>1e-9:
            background=np.maximum(background,hc/hb);key_separation=max(key_separation,float(hb))
    if key_separation<.08:raise ValueError('Declared key overlaps or approaches the protected foreground gamut')
    background=np.clip(background,0,1)
    inconsistent=np.zeros(background.shape,dtype=bool)
    for nx,ny,offset in equations:
        hb=nx*bg_chroma[0]+ny*bg_chroma[1]+offset
        hc=nx*color_chroma[:,:,0]+ny*color_chroma[:,:,1]+offset
        inconsistent|=(hc-background*hb)>1e-8
    background[inconsistent]=0 # protect an unexplained source color; report it
    alpha=1-background
    color=np.divide(rgb-background[:,:,None]*bg,alpha[:,:,None],out=np.zeros_like(rgb),where=alpha[:,:,None]>1e-12)
    rgba=np.dstack((np.clip(color,0,1),alpha))
    detail={'version':'reference-foreground-envelope-chroma-v1','productionApproved':False,
            'key':KEYS.get(key,key),'backgroundRgb':(bg*255).tolist(),'keySeparation':key_separation,
            'foregroundGuardChromaBytes':model['guardBytes'],'hullFaces':model['hullFaces'],
            'inconsistentPixelsPreservedOpaque':int(inconsistent.sum()),
            'formula':'b=max(0,max(h(C)/h(B) for h(B)>0)); a=1-b; F=(C-bB)/a; h is an expanded reference-foreground half-plane',
            'spatialFloodOrCoreFill':False,'erosion':False,'globalRgbRemap':False,
            'limitation':'Minimum-background estimate is conservative and can thicken soft alpha. One key plate cannot uniquely recover unknown foreground RGB/alpha.'}
    if edge_decontamination:
        spec=importlib.util.spec_from_file_location('reviewed_dark_contour',ROOT/'scripts/build_watch_matte.py')
        helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
        rgba,detail['edgeRepair']=helper.decontaminate_dark_contour_edges(rgba)
    return rgba,detail

def extract_signal_bound_matte(image,key,model,*,edge_decontamination=False):
    """Simple disclosed baseline; default after envelope codec-fringe failure.

    s=min(R,B)-G (purple) or min(R,G)-B (yellow). Subtract a fixed
    reference-opaque maximum plus guard, then normalize by the measured key.
    This protects reference foreground, at the cost of thicker soft alpha.
    It does not have the envelope method's inconsistent=>opaque branch.
    """
    nominal=key_rgb(key)
    if model['key']!=KEYS.get(key,key):raise ValueError('Foreground model/key mismatch')
    rgb=np.asarray(image.convert('RGB'),dtype=float)/255
    border=np.concatenate((rgb[:8].reshape(-1,3),rgb[-8:].reshape(-1,3),rgb[:,:8].reshape(-1,3),rgb[:,-8:].reshape(-1,3)))
    near=np.max(abs(border-nominal),axis=1)<=24/255
    if near.mean()<.1:raise ValueError('Insufficient stable declared-key border samples')
    bg=np.median(border[near],axis=0)
    def signal(value):
        if key in ('purple','#A020C0'):return np.minimum(value[...,0],value[...,2])-value[...,1]
        return np.minimum(value[...,0],value[...,1])-value[...,2]
    upper=model['signalUpperBound'];bg_signal=float(signal(bg))
    if bg_signal-upper<.08:raise ValueError('Key signal too close to protected foreground upper bound')
    background=np.clip((signal(rgb)-upper)/(bg_signal-upper),0,1)
    alpha=1-background
    color=np.divide(rgb-background[:,:,None]*bg,alpha[:,:,None],out=np.zeros_like(rgb),where=alpha[:,:,None]>1e-12)
    rgba=np.dstack((np.clip(color,0,1),alpha))
    detail={'version':'reference-bounded-min-chroma-v1','productionApproved':False,
            'key':KEYS.get(key,key),'backgroundRgb':(bg*255).tolist(),
            'foregroundSignalUpperBoundBytes':upper*255,'backgroundSignalBytes':bg_signal*255,
            'guardChromaBytes':model['guardBytes'],'spatialFloodOrCoreFill':False,'erosion':False,
            'formula':'s=min(R,B)-G purple / min(R,G)-B yellow; b=clip((s-referenceOpaqueUpperBound)/(sBackground-referenceOpaqueUpperBound),0,1); a=1-b; F=(C-bB)/a',
            'limitation':'Conservative foreground protection thickens alpha and can leave colored edges; single plate cannot uniquely reconstruct unknown foreground.'}
    if edge_decontamination:
        spec=importlib.util.spec_from_file_location('reviewed_dark_contour',ROOT/'scripts/build_watch_matte.py')
        helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
        rgba,detail['edgeRepair']=helper.decontaminate_dark_contour_edges(rgba)
    return rgba,detail

def extract_color_trimap_matte(image,key,model,*,edge_decontamination=False):
    """Single scoped color-trimap pilot, fixed native-pixel radii2/3.

    The independent chroma signal classifies reliable foreground; no RGB
    distance flood/filled silhouette is used. An inward2px sample core gives
    nearest foreground RGB to the outer3px band. White thin features passing
    the same chroma gate are explicit opaque anchors (not erased by the inward
    sampling core). Final edge alpha is projected locally then inverse-mixed.
    No whole-image erosion, frame fitting or arbitrary RGB repainting.
    """
    nominal=key_rgb(key)
    if model['key']!=KEYS.get(key,key):raise ValueError('Foreground model/key mismatch')
    rgb=np.asarray(image.convert('RGB'),dtype=float)/255
    border=np.concatenate((rgb[:8].reshape(-1,3),rgb[-8:].reshape(-1,3),rgb[:,:8].reshape(-1,3),rgb[:,-8:].reshape(-1,3)))
    near=np.max(abs(border-nominal),axis=1)<=24/255
    if near.mean()<.1:raise ValueError('Insufficient stable declared-key border samples')
    bg=np.median(border[near],axis=0)
    if key in ('purple','#A020C0'):
        signal=np.minimum(rgb[:,:,0],rgb[:,:,2])-rgb[:,:,1]
    else:signal=np.minimum(rgb[:,:,0],rgb[:,:,1])-rgb[:,:,2]
    foreground=signal<=model['signalUpperBound']
    core=foreground&(ndi.distance_transform_edt(foreground)>=2)
    white_anchors=foreground&(rgb.min(2)>=.85)&(np.ptp(rgb,axis=2)<=.12)
    if not core.any():raise ValueError('No reliable chroma foreground sample core')
    distance,nearest=ndi.distance_transform_edt(~core,return_indices=True)
    prior=rgb[nearest[0],nearest[1]]
    band=(~core)&(distance<=3)
    delta=prior-bg;denominator=np.sum(delta*delta,axis=2)
    alpha=np.zeros(rgb.shape[:2]);alpha[core]=1
    estimate=np.divide(np.sum((rgb-bg)*delta,axis=2),denominator,out=np.zeros_like(alpha),where=denominator>1e-12)
    alpha[band]=np.clip(estimate[band],0,1)
    # These high-confidence white fur/nail tips retain their original RGB/a.
    alpha[white_anchors]=1
    color=np.divide(rgb-(1-alpha[:,:,None])*bg,alpha[:,:,None],out=np.zeros_like(rgb),where=alpha[:,:,None]>1e-12)
    color=np.clip(color,0,1);color[core|white_anchors]=rgb[core|white_anchors]
    rgba=np.dstack((color,alpha))
    detail={'version':'key-color-trimap-local-prior-2-3px-v1','productionApproved':False,'key':KEYS.get(key,key),
            'backgroundRgb':(bg*255).tolist(),'foregroundSignalUpperBoundBytes':model['signalUpperBound']*255,
            'sampleCoreInwardPixels':2,'outerBandPixels':3,'nativePixelUnits':True,'filledHoles':False,
            'wholeImageErosion':False,'opaqueSampleCorePixels':int(core.sum()),'whiteAnchorPixels':int(white_anchors.sum()),
            'coreRgbExactlyUnchanged':bool(np.array_equal(color[core],rgb[core])),
            'whiteAnchorRgbaExactlyPreserved':bool(np.array_equal(color[white_anchors],rgb[white_anchors]) and np.all(alpha[white_anchors]==1)),
            'formula':'chroma-gated reliable FG; inward2px RGB sample core; outer3px alpha=clip(dot(C-B,Fprior-B)/norm(Fprior-B)^2,0,1); inverse composite',
            'limitation':'Local nearest-color prior can be wrong at mixed/thin details. Core is a sampling prior, not a guarantee of true foreground. Needs black/white native-frame review.'}
    if edge_decontamination:
        spec=importlib.util.spec_from_file_location('reviewed_dark_contour',ROOT/'scripts/build_watch_matte.py')
        helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
        rgba,detail['edgeRepair']=helper.decontaminate_dark_contour_edges(rgba)
    return rgba,detail

def composite(rgba,bg):
    value=rgba[:,:,:3]*rgba[:,:,3:]+np.asarray(bg)/255*(1-rgba[:,:,3:])
    return Image.fromarray(np.uint8(np.rint(np.clip(value,0,1)*255)))

def save(rgba,path):Image.fromarray(np.uint8(np.rint(np.clip(rgba,0,1)*255))).save(path)

def metrics(truth,rgba,source):
    solid=truth[:,:,3]==1;soft=(truth[:,:,3]>0)&(truth[:,:,3]<1)
    src=np.asarray(source,dtype=float)/255
    changed=solid&((rgba[:,:,3]!=1)|np.any(abs(rgba[:,:,:3]-src)>1e-12,axis=2))
    result={'opaquePixels':int(solid.sum()),'opaquePixelsChangedByAlgorithm':int(changed.sum()),
            'opaqueAlphaBelow95':int((solid&(rgba[:,:,3]<.95)).sum()),
            'softAlphaMae':float(abs(rgba[:,:,3]-truth[:,:,3])[soft].mean()),
            'softAlphaP95Error':float(np.percentile(abs(rgba[:,:,3]-truth[:,:,3])[soft],95)),
            'inputCodecOpaqueRgbMaeBytes':float(abs(src-truth[:,:,:3])[solid].mean()*255)}
    for label,bg in [('black',[0]*3),('white',[255]*3)]:
        error=abs(np.asarray(composite(rgba,bg),dtype=float)-np.asarray(composite(truth,bg),dtype=float))
        result[label+'SoftCompositeMaeBytes']=float(error[soft].mean())
    return result

def proof(out):
    out.mkdir(parents=True,exist_ok=True)
    references=[ROOT/f'Hi-Res/sources/h3-motion-polish-20261023/{a}/gray-batch03-v1/registered-reference.png' for a in ['wait','rest']]
    records=[]
    for key_name,key in KEYS.items():
        model=build_foreground_model(references,key)
        for action,reference in zip(['wait','rest'],references):
            truth=np.asarray(Image.open(reference).convert('RGBA'),dtype=float)/255
            dest=out/f'{action}-{key_name}';dest.mkdir(exist_ok=True)
            source=composite(truth,np.rint(key_rgb(key)*255));source.save(dest/'composite.png')
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-i',str(dest/'composite.png'),'-frames:v','12','-r','24','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',str(dest/'h264.mp4')],check=True)
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(dest/'h264.mp4'),'-vf',r'select=eq(n\,6)','-frames:v','1',str(dest/'decoded.png')],check=True)
            for variant,image in [('lossless',source),('h264',Image.open(dest/'decoded.png').convert('RGB'))]:
                rgba,detail=extract_key_color_matte(image,key,model)
                save(rgba,dest/f'{variant}-rgba.png')
                for label,bg in [('black',[0]*3),('gray',[128]*3),('white',[255]*3)]:composite(rgba,bg).save(dest/f'{variant}-{label}.png')
                measurement=metrics(truth,rgba,image)
                if variant=='lossless':assert measurement['opaquePixelsChangedByAlgorithm']==0, 'Reference envelope failed its defining opaque invariant'
                records.append({'action':action,'key':key,'variant':variant,'metrics':measurement,'detail':detail,
                                'sourceSha256':hashlib.sha256(reference.read_bytes()).hexdigest()})
    report={'status':'TECHNICAL_SAMPLE_REQUIRES_EDGE_AND_H3_REVIEW','productionApproved':False,'humanAccepted':False,
            'codeSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'referenceInputs':model['referenceInputs'],'fixedMaterialPriorAcrossFrames':True,
            'codec':'12 identical frames, CRF18 yuv420p, decoded frame6. Codec simulation is not H3 motion validation.',
            'records':records,'officialAssetsModified':False}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps([{'action':r['action'],'key':r['key'],'variant':r['variant'],**r['metrics']} for r in records],indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--proof',action='store_true')
    p.add_argument('--out',type=Path,default=Path(__file__).with_name('key-color-proof'));args=p.parse_args()
    if not args.proof:p.error('Use --proof, or import build_foreground_model/extract_key_color_matte')
    proof(args.out)
