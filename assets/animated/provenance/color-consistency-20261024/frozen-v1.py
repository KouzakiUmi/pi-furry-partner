import hashlib
import numpy as np
LUMA=np.array([.2126,.7152,.0722]);TARGET=np.array([80.,97.,117.])
def smooth(x,a,b):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def transform(a,clip,rect):
    rgb=a[:,:,:3].astype(float);r,g,b=rgb.transpose(2,0,1)
    y=rgb@LUMA;spread=rgb.max(2)-rgb.min(2);visible=smooth(a[:,:,3],16,160)
    py,px=np.mgrid[:a.shape[0],:a.shape[1]]
    xx=px*rect['width']/a.shape[1]+rect['x'];yy=py*rect['height']/a.shape[0]+rect['y']
    neutral=smooth(np.maximum(r-b,g-b),.7,4)*(1-smooth(spread,18,34))*smooth(y,35,80)*visible
    # Do not make the search papers a fur-color authority. This conservative
    # prop region is disclosed; no additional material partitions are invented.
    if clip=='search':
        paper=(yy>=450)&((xx<405)|(yy>=590))&(rgb.min(2)>155);neutral[paper]=0
    excess=(g-r)-(TARGET[1]-TARGET[0])/(TARGET[2]-TARGET[0])*(b-r)
    cloth=smooth(np.abs(excess),1,6)*smooth(b-r,7,18)*(1-smooth(spread,65,90))*smooth(y,24,45)*(1-smooth(rgb.max(2),165,185))*visible
    if clip in ['work','work-enter','work-exit']:
        keyboard=(yy>=500)&(xx>=90)&(xx<=560);cloth[keyboard]=0
    if clip=='watch':
        face=((xx-320)/170)**2+((yy-300)/133)**2<=1
        handle=(xx>=170)&(xx<=320)&(yy>=345)&(yy<=515)&(b>r+18)&(b>g+10);cloth[face|handle]=0
    neutral_rgb=np.repeat(y[:,:,None],3,axis=2)
    desired=y[:,:,None]+((b-r)/(TARGET[2]-TARGET[0]))[:,:,None]*(TARGET-TARGET@LUMA)
    result=rgb+(neutral_rgb-rgb)*neutral[:,:,None]+(desired-rgb)*cloth[:,:,None]
    out=a.copy();out[:,:,:3]=np.uint8(np.clip(np.rint(result),0,255));out[a[:,:,3]==0]=a[a[:,:,3]==0]
    diff=(out[:,:,:3].astype(float)-rgb)@LUMA
    assert np.array_equal(a[:,:,3],out[:,:,3])
    assert np.abs(diff[a[:,:,3]>0]).max()<1.01
    return out,{'visibleChangedPixels':int(((out[:,:,:3]!=a[:,:,:3]).any(2)&(a[:,:,3]>0)).sum()),
       'maxLuminanceChange8bit':float(np.abs(diff[a[:,:,3]>0]).max()),'alphaExactlyUnchanged':True}
