#!/usr/bin/env python3
"""Display the actual indexed runtime frames; no separately simulated motion."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def font(size,bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/'+('msyhbd.ttc' if bold else 'msyh.ttc'),size)


def main(folder,output):
    manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    banks={}
    for view in manifest['timeline'][0]['views']:
        banks[view['style']]=np.fromfile(folder/f"{view['style']}.bin",dtype=np.uint8).reshape(-1,view['height'],view['width'])
    frames=[]
    for index,moment in enumerate(manifest['timeline']):
        image=Image.new('RGB',(1000,710),'#0b121e');draw=ImageDraw.Draw(image)
        draw.text((32,22),manifest.get('title','我拿放大镜盯着呢'),font=font(29,True),fill='#e6edf7')
        draw.text((34,69),manifest.get('subtitle','镜片与握爪左右查找 · 头部轻轻跟随 · 眨眼、呼吸与耳朵抖动'),font=font(16),fill='#95abc7')
        for column,view in enumerate(moment['views']):
            left=26+column*484
            draw.rounded_rectangle((left,116,left+458,660),14,fill='#111d2d',outline='#344b65')
            draw.text((left+20,135),'Umi · 角色版' if column==0 else 'Umi · 像素版',font=font(21,True),fill='#a4caef')
            draw.text((left+20,170),manifest.get('detail','头颈与放大镜分别连动，身体保持稳定'),font=font(14),fill='#92aac4')
            pixels=banks[view['style']][index]
            rgba=np.zeros((*pixels.shape,4),dtype=np.uint8)
            rgba[:,:,:3]=np.array(view['palette'],dtype=np.uint8)[pixels]
            rgba[:,:,3]=np.where(pixels==0,0,255)
            sprite=Image.fromarray(rgba).resize((410,410),Image.Resampling.LANCZOS if column==0 else Image.Resampling.NEAREST)
            image.paste(sprite,(left+24,215),sprite)
            draw.text((left+20,628),view.get('phrase','执行命令 · running'),font=font(14),fill='#92aac4')
        draw.text((28,680),'实际 production motion 帧 · 离线效果预览，非终端截图 · 角色与动画保留全部版权',font=font(13),fill='#7c96b1')
        frames.append(image)
    mosaic=Image.new('RGB',(2000,1420))
    for i,at in enumerate((3,10,31,49)):mosaic.paste(frames[at],((i%2)*1000,(i//2)*710))
    palette=mosaic.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
    indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
    output.parent.mkdir(parents=True,exist_ok=True)
    indexed[0].save(output,save_all=True,append_images=indexed[1:],duration=manifest['stepMs'],loop=0,disposal=1,optimize=True)
    contact=output.with_name(output.stem+'-contact.png');mosaic.save(contact)
    print(json.dumps({'gif':str(output),'contact':str(contact),'durationMs':manifest['durationMs'],'actualRuntimeMotion':True},ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();main(args.input,args.output)
