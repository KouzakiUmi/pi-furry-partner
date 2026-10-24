"""Shorten the quiet search lead-in using intact source frames only.

The first 64 source frames ease from ~3.86x back to 1x in 22 output frames.
All remaining tail-swish frames are kept one-for-one at their original 24fps.
No new generation, inpainting, interpolation, blending, or pixel changes.
"""
from pathlib import Path
import argparse,hashlib,json,shutil
import numpy as np
from PIL import Image
from process_approved_h3_actions import read,write,sha,previews

def main():
 p=argparse.ArgumentParser();p.add_argument('--from',dest='source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);args=p.parse_args()
 source=args.source.resolve();out=args.out.resolve();assert not out.exists(),'Use a new stage directory'
 old=read(source/'manifest.json');previous=read(source/'report.json');assert old['action']=='search' and old['fps']==24 and len(old['frames'])==158
 quiet,lead=64,22;v0=(3*quiet/lead-1)/2
 indices=[round(lead*(v0*(n/lead)+(1-v0)*(n/lead)**3/3)) for n in range(lead)]+list(range(quiet,len(old['frames'])))
 assert indices[0]==0 and indices[-1]==157 and all(b>a for a,b in zip(indices,indices[1:]))
 assert indices[lead:]==list(range(64,158)),'Never drop the actual tail swing or its return'
 records=[]
 for folder in ['rgba','native','webp','black','gray','white']:(out/folder).mkdir(parents=True,exist_ok=True)
 for n,i in enumerate(indices):
  before=old['frames'][i];name=f'{n:03}';file=name+'.png'
  for folder in ['rgba','native','black','gray','white']:shutil.copy2(source/folder/before['file'],out/folder/file)
  shutil.copy2(source/'webp'/f"{before['id']}.webp",out/'webp'/f'{name}.webp')
  assert sha(out/'rgba'/file)==before['sha256'],'Timing changes may not alter any RGBA pixel'
  records.append({**before,'id':name,'file':file,'atMs':round(n*1000/24,3),
    'durationMs':round((n+1)*1000/24)-round(n*1000/24),'originalOutputFrame':i,'originalAtMs':before['atMs']})
 shutil.copy2(source/'source.mp4',out/'source.mp4')
 period=round(len(records)*1000/24)
 timing={'method':'Whole-frame lead-in acceleration easing to native 1x; full tail action retained',
   'sourceLeadFrames':64,'outputLeadFrames':22,'initialSpeed':v0,'endingSpeed':1,
   'sourceFrameIndices':indices,'originalPeriodMs':old['periodMs'],'newPeriodMs':period,
   'newGenerationRequests':0,'rgbaPixelsChanged':False,'reverse':False,'interpolation':False,'crossfade':False}
 manifest={**old,'frames':records,'periodMs':period,'retimedFromManifestSha256':sha(source/'manifest.json'),
   'sampling':{**old['sampling'],'retiming':timing},'processing':{**old['processing'],'timingOnly':True}}
 write(out/'manifest.json',manifest)
 selected_stats=[{**previous['perFrameDetails'][i],'id':f'{n:03}'} for n,i in enumerate(indices)]
 small=[]
 for r in records:
  a=np.asarray(Image.open(out/'rgba'/r['file']).resize((160,160)),dtype=float)/255
  small.append(np.concatenate((a[:,:,:3]*a[:,:,3:],a[:,:,3:]),axis=2))
 differences=[float(np.abs(b-a).mean()) for a,b in zip(small,small[1:])];median=float(np.median(differences));seam=float(np.abs(small[-1]-small[0]).mean())
 report={**previous,'status':'AWAITING_USER_TIMING_REVIEW','manualAccepted':False,'frameCount':len(records),
  'perFrameDetails':selected_stats,'retiming':timing,'originalSourceFramesReusedExactly':True,
  'correctedEdgePixels':sum(s['edgeColorDecontamination']['correctedPixels'] for s in selected_stats),
  'visualContentUserApproved':True,'timingUserApproved':False,
  'canonicalBorderTouchFrames':[],'continuityMeasurements':{'median':median,'loopSeamMeanAbsoluteDifference':seam,
    'seamToMedianRatio':seam/max(median,1e-9),'consecutiveMeanAbsoluteDifferences':differences,'warningOnly':True},
  'notes':previous['notes']+['User accepted visual content but requested earlier tail motion; this timing revision needs review.']}
 write(out/'report.json',report);previews(out,records,24)
 print(json.dumps({'out':str(out),'frames':len(records),'periodMs':period,'sourceTailFrame66AtMs':records[indices.index(66)]['atMs'],
  'allTailFramesPreserved':True,'newGenerationRequests':0,'rgbaPixelsChanged':False}))
if __name__=='__main__':main()
