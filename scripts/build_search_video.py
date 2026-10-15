#!/usr/bin/env python3
"""Build complete search/compaction video frames without touching source poses.

Reads a reviewed fixed-canvas 640px RGBA selection manifest. The shared matte
pipeline preserves soft alpha; terminal240 derives black-background edge AA,
pixel80 keeps its integer silhouette, and the private HD bank keeps A8 alpha.
Runtime playback is strictly complete-frame and forward, with no local rigs.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import numpy as np
from PIL import Image
from build_watch_video import index_image,preview_frame,sha,write

ROOT=Path(__file__).resolve().parents[1]
STYLES=(('wumi',240),('wumi-pixel',80))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,required=True);parser.add_argument('--stage',type=Path,required=True)
    parser.add_argument('--apply',action='store_true');parser.add_argument('--terminal-aa-background',default='000000')
    args=parser.parse_args();stage=args.stage.resolve();stage.mkdir(parents=True,exist_ok=True)
    code=args.terminal_aa_background.lstrip('#');assert re.fullmatch('[0-9a-fA-F]{6}',code)
    background=[int(code[n:n+2],16) for n in (0,2,4)]
    manifest_path=args.manifest.resolve();manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    records=manifest['frames'];assert 2<=len(records)<=96
    protected={str(path.relative_to(ROOT)):sha(path) for path in (ROOT/'assets/reactions').glob('*/reaction-sheet.json')}
    for pattern in ('*/poke-patch.json','*/watch-frames.json','*/listen-frames.json'):
        protected.update({str(path.relative_to(ROOT)):sha(path) for path in (ROOT/'assets/reactions').glob(pattern)})
    names=[];poses=[];steps=[]
    for n,record in enumerate(records):
        # Keep the old search.png derivative as well as the original 21 source
        # objects. The runtime's search alias points at this appended pose.
        name='search-video-000' if n==0 else record['id']
        assert re.fullmatch(r'search-video-[0-9]{3}',name) and name not in names
        file=Path(record['file']);assert not file.is_absolute() and len(file.parts)==1 and file.suffix=='.png'
        path=manifest_path.parent/file;assert sha(path)==record['sha256']
        pose=Image.open(path).convert('RGBA');assert pose.size==(640,640)
        duration=record['durationMs'];assert isinstance(duration,int) and 50<=duration<=2000
        names.append(name);poses.append(pose);steps.append({'id':name,'durationMs':duration})
    period=sum(step['durationMs'] for step in steps);assert period<=20000 and period==manifest['periodMs']
    sequence={'steps':steps,'periodMs':period};assets={}
    design='Complete video frames coordinate one traveling tail wave, white rump/root, buried head and papers; no runtime local warps or temporal blending'
    rgba_folder=stage/'rgba';rgba_folder.mkdir(exist_ok=True)
    for name,pose in zip(names,poses):pose.save(rgba_folder/f'{name}.png')
    for style,size in STYLES:
        sheet=json.loads((ROOT/f'assets/reactions/{style}/reaction-sheet.json').read_text(encoding='utf-8'));assert len(sheet['frames'])==21
        frames=[{'id':name,'pixels':index_image(pose,sheet['palette'],size,pixel=size==80,background=background if size==240 else None)} for name,pose in zip(names,poses)]
        asset={'schemaVersion':1,'width':size,'height':size,'frames':frames,'sequence':sequence,
            'motion':{'bakedMotion':True,'design':design},
            'paletteSha256':hashlib.sha256(json.dumps(sheet['palette'],separators=(',',':')).encode()).hexdigest()}
        folder=stage/style;folder.mkdir(exist_ok=True);write(folder/'search-frames.json',asset)
        for frame in frames:preview_frame(frame,sheet['palette'],size,folder/f"{frame['id']}.png")
        assets[style]=asset;print(json.dumps({'style':style,'frames':len(frames),'periodMs':period}),flush=True)
    mosaic=Image.new('RGB',(160,160*len(poses)))
    for n,pose in enumerate(poses):mosaic.paste(pose.convert('RGB').resize((160,160),Image.Resampling.LANCZOS),(0,n*160))
    quant=mosaic.quantize(colors=255,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    flat=quant.getpalette()[:765];palette=[[0,0,0]]+[flat[n:n+3] for n in range(0,len(flat),3)]
    ids={name:n for n,name in enumerate(names)};ids['search']=0
    hd={'width':640,'height':640,'transparentIndex':0,'palette':palette,'ids':ids,
        'frames':[{'id':name,'pixels':index_image(pose,palette,640,keep_soft=True),'alpha':np.asarray(pose.getchannel('A')).reshape(-1).tolist()} for name,pose in zip(names,poses)],
        'motion':{'ears':False,'paws':False,'searchVideo':{'bakedMotion':True,'sequence':sequence}}}
    write(stage/'search-frames-640.json',hd)
    source=ROOT/'assets/poses/search-h3-source.mp4';assert source.exists()
    report={'passed':True,'schemaVersion':1,'sourceMaster':'assets/poses/search-h3-source.mp4','sourceSha256':sha(source),
        'video':{**manifest['source'],'file':'assets/poses/search-h3-source.mp4','sha256':sha(source)},'canvas':manifest['canvas'],
        'processing':manifest['processing'],'sampling':manifest['sampling'],'sourceFrameIndices':[record['sourceFrame'] for record in records],
        'sourceDurationsMs':[record['durationMs'] for record in records],'frameIds':names,'sequence':sequence,'manualAccepted':True,
        'manualAcceptanceReason':'Reviewed all selected source poses and actual small display: one natural tail, dark-gray tip / light-gray middle / white root, white rump connection, buried head, no extra lower-right cape',
        'appliesTo':['searching','compacting'],'method':design,
        'terminalAlphaApproximation':{'backgroundRgb':background,'wumi240':'Outside-connected partial-alpha edge composited over black and quantized into the immutable palette; opaque interiors unchanged',
            'wumiPixel80':'Integer native-pixel binary coverage','sourceAndFilm':'Full 8-bit fractional alpha retained with independent 16-bit source matte'},
        'protectedSha256':protected,'sourceAssetsUnchanged':True,'applied':args.apply}
    write(stage/'build-report.json',report)
    assert all(sha(ROOT/path)==expected for path,expected in protected.items())
    if args.apply:
        allowed=['search-frames.json',*[f'{name}.png' for name in names]]
        for style in assets:
            for name in allowed:shutil.copy2(stage/style/name,ROOT/f'assets/reactions/{style}'/name)
        write(ROOT/'assets/poses/search-video-metadata.json',report)
        assert all(sha(ROOT/path)==expected for path,expected in protected.items())
    print(json.dumps({'passed':True,'frames':len(names),'steps':len(steps),'periodMs':period,'applied':args.apply},indent=2))

if __name__=='__main__':main()
