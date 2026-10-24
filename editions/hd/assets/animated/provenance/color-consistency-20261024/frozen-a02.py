"""Frozen A02 affection-only pilot. INPUT: decoded v1 HD candidate RGBA (896x896).
Do NOT apply to original catalog frame without first byte-equivalent v1 transform.
No image registration, alpha edits, temporal statistics, fitting or Pi direct transform.
Generate Pi through the established same-HD derivation after applying this module.
"""
import numpy as np
LUMA=np.array([.2126,.7152,.0722])
def smooth(x,a,b):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)
def transform_v1_affection(a):
    assert a.shape==(896,896,4) and a.dtype==np.uint8
    rgb=a[:,:,:3].astype(float);r,g,b=rgb.transpose(2,0,1)
    yy,xx=np.indices(r.shape);Y=rgb@LUMA
    scarf=smooth(b-r,45,85)*smooth(b-g,15,35)*smooth(b,120,180)*smooth(a[:,:,3],16,220)
    scarf*=((yy>=475)&(yy<=650))
    result=np.clip(np.rint(rgb+scarf[:,:,None]*np.array([18.,12.,-1.])),0,255)
    cloth=smooth(b-r,10,22)*smooth(b-g,5,10)*smooth(Y,25,40)*(1-smooth(rgb.max(2),155,180))*smooth(a[:,:,3],16,220)
    result=np.clip(np.rint(result+cloth[:,:,None]*np.array([2.,0.,-3.])),0,255).astype(np.uint8)
    out=a.copy();out[:,:,:3]=result;out[a[:,:,3]==0]=a[a[:,:,3]==0]
    assert np.array_equal(out[:,:,3],a[:,:,3])
    assert np.array_equal(out[a[:,:,3]==0],a[a[:,:,3]==0])
    return out
