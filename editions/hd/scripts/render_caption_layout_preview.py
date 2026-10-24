#!/usr/bin/env python3
"""Paint cell positions exported by actual renderDock/joinEditor functions."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from render_motion_preview import font, paw_glyph

def main(folder, output):
    data=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    image=Image.new('RGB',(1080,790),'#0b121e')
    draw=ImageDraw.Draw(image)
    draw.text((30,20),'气泡更宽，角色保持原大小',font=font(25,True),fill='#e6edf7')
    draw.text((32,62),'同一个 100 列终端 · 实际 renderDock / joinEditor 排版 · 输入框右移 4 列',font=font(15),fill='#9bb1ca')
    mono=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',17)
    sprite=data['sheet']; values=np.asarray(sprite['pixels'],dtype=np.uint8).reshape(sprite['height'],sprite['width'])
    rgba=np.zeros((sprite['height'],sprite['width'],4),dtype=np.uint8)
    rgba[...,:3]=np.asarray(sprite['palette'],dtype=np.uint8)[values];rgba[...,3]=np.where(values==0,0,255)
    avatar=Image.fromarray(rgba,'RGBA').resize((160,160),Image.Resampling.LANCZOS)
    for i,sample in enumerate(data['samples']):
        top=115+i*322;left=40
        draw.rounded_rectangle((24,top-10,1056,top+287),12,fill='#101b2b',outline='#344b65')
        draw.text((42,top+2),sample['label'],font=font(18,True),fill='#a7cfff')
        row_top=top+42
        for row,segments in enumerate(sample['rows']):
            for item in segments:
                x=left+item['column']*10;y=row_top+row*20
                if item['text']=='🐾':paw_glyph(draw,x+10,y+11,'#accdec')
                elif item['text'].strip():draw.text((x,y),item['text'],font=mono,fill='#b8cee7')
        image.paste(avatar,(left+sample['geometry']['imageOffset']*10,row_top+60),avatar)
        draw.text((42,top+258),f"Avatar: {sample['geometry']['columns']} × {sample['geometry']['rows']} cells   ·   Caption: {sample['geometry']['captionColumns']} cells   ·   Editor starts: column {sample['editorStart']}",font=font(14),fill='#91a9c4')
    draw.text((30,762),'相同原始角色像素，仅改变气泡和输入区布局 · 离线效果预览，非终端截图',font=font(13),fill='#7f98b4')
    output.parent.mkdir(parents=True,exist_ok=True);image.save(output)
    print(json.dumps({'output':str(output),'dimensions':list(image.size),'avatarCells':[16,8],'editorShiftCells':4,'actualLayoutFunctionsUsed':True},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();main(args.input,args.output)
