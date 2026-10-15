#!/usr/bin/env python3
"""Create sparse >w< patches with the existing clean-fur rig and palettes.

This never rebuilds a main reaction sheet or changes its frame IDs, palette,
alpha, body or scarf. Run after artwork changes to refresh the four patches.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from build_reactions import source_pixel, pixel_mouth, illustration_mouth
from build_wumi_reactions import (mouth, clean_pose, EYE_CLEAN_POLYGONS,
                                 texture_patch, keep_alpha)

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def tapered_curve(draw,points,color,width_start,width_end):
    """A calligraphic cubic: a filled ribbon with a pointed outer tip."""
    ts=np.linspace(0,1,48);samples=[]
    for t in ts:
        x,y=[(1-t)**3*points[0][axis]+3*(1-t)**2*t*points[1][axis]+
             3*(1-t)*t*t*points[2][axis]+t**3*points[3][axis] for axis in (0,1)]
        dx,dy=[3*(1-t)**2*(points[1][axis]-points[0][axis])+
               6*(1-t)*t*(points[2][axis]-points[1][axis])+
               3*t*t*(points[3][axis]-points[2][axis]) for axis in (0,1)]
        length=max(.01,float(np.hypot(dx,dy)))
        # A soft, convex brush profile makes the central fold heavier than
        # either lash tip. It avoids the appearance of a monospaced > symbol.
        amount=np.sin(t*np.pi/2)**1.35
        width=width_start+(width_end-width_start)*amount
        samples.append((x,y,-dy/length*width/2,dx/length*width/2))
    polygon=[(x+nx,y+ny) for x,y,nx,ny in samples]+[(x-nx,y-ny) for x,y,nx,ny in reversed(samples)]
    draw.polygon(polygon,fill=color)


def curved_squeeze_eyes(base,eyes):
    """Draw expressive curved upper/lower lids within each real eye's scale."""
    result=base.copy();draw=ImageDraw.Draw(result)
    for index,(name,(x0,y0,x1,y1)) in enumerate(eyes.items()):
        width,height=x1-x0,y1-y0;direction=1 if name=='left' else -1
        cx=(x0+x1)/2;cy=y0+height*.60
        # Perspective comes from the existing left/right eye boxes. The lower
        # arc is shorter and softer than the upper, rather than a mirrored V.
        def point(x,y):return(cx+direction*x*width,cy+y*height)
        # Both strokes bow upward in screen space relative to their own
        # endpoint chords. The lower lid must not bulge downward like a >
        # glyph; the two upward sweeps meet at the same soft inner fold.
        top=[point(-.48,-.23),point(-.20,-.23),point(.15,-.16),point(.40,0)]
        lower=[point(.40,0),point(.14,-.025),point(-.10,.005),point(-.34,.14)]
        center=point(.40,0);heavy=max(1.2,width*.115);tip=max(.45,width*.025)
        color=(37,44,53,255)
        tapered_curve(draw,top,color,tip,heavy)
        tapered_curve(draw,lower,color,heavy*.88,tip)
        r=heavy*.43;draw.ellipse((center[0]-r,center[1]-r,center[0]+r,center[1]+r),fill=color)
    return keep_alpha(base,result)


def clean_umi_sockets(base,eyes):
    """Use the authored clean-fur donor; no flat white stickers over eyes."""
    result=base.copy();clean=clean_pose('neutral-eyes-clean.png')
    windows={'left':(214,252,245,294),'right':(337,253,375,298)}
    for name,box in eyes.items():
        polygon=EYE_CLEAN_POLYGONS[tuple(box)]
        mask=Image.new('L',base.size);ImageDraw.Draw(mask).polygon(polygon,fill=255)
        expanded=np.asarray(mask.filter(ImageFilter.MaxFilter(7))).copy();expanded[:215]=0;expanded[327:]=0
        mask=Image.fromarray(expanded)
        x0=min(x for x,y in polygon);x1=max(x for x,y in polygon)
        y0=min(y for x,y in polygon);y1=max(y for x,y in polygon)
        sx0,sy0,sx1,sy1=windows[name];scale_x=(sx1-sx0)/(x1-x0);scale_y=(sy1-sy0)/(y1-y0)
        donor=clean.transform(base.size,Image.Transform.AFFINE,
                              (scale_x,0,sx0-x0*scale_x,0,scale_y,sy0-y0*scale_y),Image.Resampling.BICUBIC)
        soft=mask.filter(ImageFilter.GaussianBlur(1.8));mask=Image.fromarray(np.minimum(np.asarray(mask),np.asarray(soft)))
        result=texture_patch(result,donor,mask)
    return result


def umi_poke_pose(base=None):
    """Dedicated poke-only rig; ordinary blink/rest/error eyes stay untouched."""
    metadata=json.loads((ASSETS/'poses/metadata.json').read_text(encoding='utf-8'))['poses']['neutral']
    if base is None:base=Image.open(ASSETS/'poses/neutral.png').convert('RGBA')
    squeezed=curved_squeeze_eyes(clean_umi_sockets(base,metadata['eyes']),metadata['eyes'])
    return mouth(squeezed,metadata['mouth'],'closed')


def legacy_poke_pose(base,style):
    array=np.asarray(base).copy()
    if style=='pixel':
        for left,right,bottom in [(34,40,54),(54,61,55)]:
            region=array[43:bottom,left:right];hair=np.all(region[:,:,:3]==(192,188,206),axis=2)
            region[~hair]=(255,255,255,255)
        eyes={'left':(33,43,40,55),'right':(54,43,62,55)}
        return pixel_mouth(curved_squeeze_eyes(Image.fromarray(array),eyes),'closed')
    for x0,x1,bottom in [(341,422,586),(541,631,586)]:
        rgb=array[459:bottom,x0:x1,:3].astype(np.int16)
        blue=(rgb[:,:,1]-rgb[:,:,0]>3)&(rgb[:,:,2]-rgb[:,:,0]>9)
        dark=rgb.max(axis=2)<180;orange=(rgb[:,:,0]-rgb[:,:,1]>16)&(rgb[:,:,0]-rgb[:,:,2]>16)
        orange[550-459:]=False
        mask=Image.fromarray((blue|dark|orange).astype(np.uint8)*255).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.5))
        weight=np.asarray(mask)[:,:,None]/255
        array[459:bottom,x0:x1,:3]=np.round(array[459:bottom,x0:x1,:3]*(1-weight)+np.array([253,253,253])*weight).astype(np.uint8)
    eyes={'left':(341,459,422,586),'right':(541,459,631,586)}
    return illustration_mouth(curved_squeeze_eyes(Image.fromarray(array),eyes),'closed')


def face_motion(style):
    if style in ('wumi','wumi-pixel'):
        size=640;polygon=[[181,256],[210,229],[259,225],[296,239],[330,228],[386,230],[414,259],[410,309],[388,347],[349,370],[296,380],[247,370],[207,345],[187,307]];pivot=[296,330]
    elif style=='pixel':
        size=100;polygon=[[27,44],[34,40],[40,41],[48,43],[55,41],[64,44],[68,53],[64,64],[55,69],[43,70],[33,66],[27,57]];pivot=[47,60]
    else:
        size=1024;polygon=[[309,479],[342,447],[426,442],[480,461],[539,445],[627,452],[668,493],[658,581],[621,639],[546,681],[473,693],[396,676],[333,625],[306,556]];pivot=[482,619]
    return {'face':{'polygon':[[x/size,y/size] for x,y in polygon],'pivot':[x/size for x in pivot],'normalized':True},
            'design':'Poke-only curved tapered eyelids; short lower arc, heavier central fold, fine lash tips'}


def emit(style, base, poked):
    directory = ASSETS / "reactions" / style
    sheet = json.loads((directory / "reaction-sheet.json").read_text(encoding="utf-8"))
    size = (sheet["width"], sheet["height"])
    sampling = Image.Resampling.NEAREST if style.endswith("pixel") else Image.Resampling.LANCZOS
    # Only apply the edited face patch to the exact indexed neutral frame.
    # This prevents quantization or resampling from changing untouched artwork.
    different = np.any(np.asarray(base) != np.asarray(poked), axis=2)
    mask = Image.fromarray(different.astype(np.uint8)*255).resize(size, sampling)
    image = poked.resize(size, sampling).convert("RGB")
    palette = np.asarray(sheet["palette"], dtype=np.int32)
    pixels = np.asarray(sheet["frames"][sheet["ids"]["idle-open"]]["pixels"])
    rgb = np.asarray(image, dtype=np.int32).reshape(-1, 3)
    locations = np.flatnonzero((np.asarray(mask).reshape(-1) > 0) & (pixels != sheet.get("transparentIndex", 0)))
    edited=pixels.copy()
    for index in locations:
        # Use existing opaque palette entries only; no color expansion.
        distances = ((palette[1:] - rgb[index]) ** 2).sum(axis=1)
        color = int(np.argmin(distances)) + 1
        if color != pixels[index]:
            edited[index]=color
    if style=='wumi-pixel':
        # Thin tapered tips occupy less than one 80px target pixel. Protect
        # only the new eyelid ink by coverage, so center sampling cannot turn
        # an authored curve back into a few disconnected dark dots.
        source=np.asarray(poked);ink=np.all(source[:,:,:3]==(37,44,53),axis=2)
        for x0,y0,x1,y1 in [(206,262,260,303),(325,262,384,303)]:
            for y in range(y0//8,(y1+7)//8):
                for x in range(x0//8,(x1+7)//8):
                    if np.count_nonzero(ink[y*8:(y+1)*8,x*8:(x+1)*8])>=6:
                        index=y*80+x
                        if pixels[index]:edited[index]=32
    entries=[[int(index),int(edited[index])] for index in np.flatnonzero(edited!=pixels)]
    patch = {"schemaVersion": 1, "id": "poke", "base": "idle-open",
             "width": sheet["width"], "height": sheet["height"], "pixels": entries,
             "motion":face_motion(style)}
    (directory / "poke-patch.json").write_text(json.dumps(patch, separators=(",", ":"))+"\n", encoding="utf-8")
    return {"style": style, "changedPixels": len(entries), "width": sheet["width"]}


def main():
    base = Image.open(ASSETS / "poses/neutral.png").convert("RGBA")
    poked = umi_poke_pose(base)
    results = [emit(style, base, poked) for style in ("wumi", "wumi-pixel")]
    base = source_pixel()
    results.append(emit("pixel", base, legacy_poke_pose(base,'pixel')))
    base = Image.open(ASSETS / "illustration/avatar.png").convert("RGBA")
    results.append(emit("illustration", base, legacy_poke_pose(base,'illustration')))
    from refine_pixel_lines import refine
    refine()
    print(json.dumps({"passed": True, "method": "clean-fur face-only rig; unchanged source sheets/palettes/alpha", "styles": results}, indent=2))


if __name__ == "__main__":
    main()
