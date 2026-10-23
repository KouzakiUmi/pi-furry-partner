"""Scoped soft-edge foreground-color reconstruction after key-derived alpha.

Never changes alpha or any opaque pixel. This is a disclosed local estimate,
not lossless recovery. No channel is erased and no material color is remapped.
"""
from pathlib import Path
import numpy as np
from scipy import ndimage as ndi
from PIL import Image

def repair_key_edge(rgba,key):
    v=np.asarray(rgba);assert v.dtype==np.uint8 and v.shape[2]==4
    c=v[:,:,:3].astype(float);a=v[:,:,3]
    if key=='#A020C0':
        key_signal=np.minimum(c[:,:,0],c[:,:,2])-c[:,:,1]
        opposite=c[:,:,1]-np.maximum(c[:,:,0],c[:,:,2])
    elif key=='#E8D600':
        key_signal=np.minimum(c[:,:,0],c[:,:,1])-c[:,:,2]
        opposite=c[:,:,2]-np.maximum(c[:,:,0],c[:,:,1])
    else:raise ValueError('Only current purple/yellow pilots')
    clean_chroma=(key_signal<=20)&(opposite<=12)
    reliable=(a>=252)&clean_chroma
    distance,nearest=ndi.distance_transform_edt(~reliable,return_indices=True)
    prior=c[nearest[0],nearest[1]]
    # Only external soft contour within4px of reliable painted foreground.
    outer=ndi.binary_propagation(np.pad(np.zeros((a.shape[0]-2,a.shape[1]-2),bool),1,constant_values=True),mask=a<252)
    eligible=(a>0)&(a<252)&outer&(distance<=4)
    residual=(key_signal>20)|(opposite>12)
    changed=eligible&residual
    out=v.copy();out[changed,:3]=np.uint8(np.rint(prior[changed]))
    assert np.array_equal(out[:,:,3],v[:,:,3]) and np.array_equal(out[a>=252],v[a>=252])
    return out,{'version':'soft-key-edge-foreground-color-v1','key':key,'method':'Reconstruct the full RGB of anomalously key-colored or complementary-colored external soft pixels from nearest reliable painted foreground within4px. Alpha is unchanged; no single-channel erasing.','sourceAlphaExactlyUnchanged':True,'opaqueRgbaExactlyUnchanged':True,'unchangedOutsideEligible':bool(np.array_equal(out[~changed],v[~changed])),'changedRgbPixels':int(changed.sum()),'maxPriorDistancePixels':4,'keySignalThresholdBytes':20,'oppositeSignalThresholdBytes':12,'globalColorRemap':False,'limitation':'Local foreground RGB estimate only; does not assert exact true soft-edge colors.'}

def composite(v,bg):
    a=v[:,:,3:].astype(float)/255;c=v[:,:,:3]*a+np.array(bg)*(1-a)
    return Image.fromarray(np.uint8(np.rint(np.clip(c,0,255))))

if __name__=='__main__':
    import json
    root=Path('D:/Software Projects/pi-furry-partner');out=root/'work/motion-polish-20261023/key-color-proof/edge-reconstruction';out.mkdir(exist_ok=True)
    rows=[]
    for method,key in [('purple','#A020C0'),('yellow','#E8D600')]:
        for n in [0,53,106]:
            p=root/f'Hi-Res/sources/h3-motion-polish-20261023/wait/key-{method}-v1/processed/rgba/{n:03}.png';v=np.asarray(Image.open(p).convert('RGBA'));clean,detail=repair_key_edge(v,key)
            Image.fromarray(clean).save(out/f'{method}-{n:03}-rgba.png')
            for name,bg in [('black',[0,0,0]),('white',[255,255,255])]:composite(clean,bg).save(out/f'{method}-{n:03}-{name}.png')
            rows.append({'method':method,'frame':n,**detail})
    (out/'report.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8');print(json.dumps(rows))
