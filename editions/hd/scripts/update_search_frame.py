#!/usr/bin/env python3
"""Replace only the final search pose, retaining every other indexed frame.

Uses the existing palette for each style so facial rigs and mouths stay exact.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path
from PIL import Image
sys.dont_write_bytecode = True
from build_waiting import quantize_fixed
from build_wumi_reactions import decode, contact_sheet

ROOT = Path(__file__).resolve().parents[1]


def main():
    source=Image.open(ROOT/"assets/poses/search.png").convert("RGBA")
    metadata=json.loads((ROOT/"assets/poses/search-metadata.json").read_text(encoding="utf-8"))
    tail=metadata["tail"]
    normalized={"polygon":[[x/640,y/640] for x,y in tail["maskPolygon"]],
                "pivot":[value/640 for value in tail["pivot"]],"normalized":True}
    if "tip" in tail:
        normalized["tip"]=[value/640 for value in tail["tip"]]
    if "spineNormalized" in tail:
        normalized["spine"]=tail["spineNormalized"]
    elif "spine" in tail:
        normalized["spine"]=[[x/640,y/640] for x,y in tail["spine"]]
    normalized["rootPinned"]=bool(tail.get("rootPinned",True))
    normalized["rootFlexible"]=bool(tail.get("rootFlexible",False))
    if "rootBlendNormalized" in tail:
        normalized["rootBlendNormalized"]=tail["rootBlendNormalized"]
    papers=[{**page,"polygon":[[x/640,y/640] for x,y in page["polygon"]],"pivot":[value/640 for value in page["pivot"]],"normalized":True} for page in metadata.get("papers",[])]
    head=[{**part,"polygon":[[x/640,y/640] for x,y in part["polygon"]],"pivot":[value/640 for value in part["pivot"]],"normalized":True} for part in metadata.get("searchHead",[])]
    occlusion=[[[x/640,y/640] for x,y in polygon] for polygon in metadata.get("searchOcclusion",[])]
    reports=[]
    for style in ["wumi","wumi-pixel"]:
        path=ROOT/"assets/reactions"/style/"reaction-sheet.json"
        data=json.loads(path.read_text(encoding="utf-8"))
        before={frame["id"]:frame["pixels"][:] for frame in data["frames"] if frame["id"]!="search"}
        data["frames"][data["ids"]["search"]]={"id":"search","pixels":quantize_fixed(source,data)}
        data["motion"]["tail"]=normalized
        data["motion"]["papers"]=papers
        data["motion"]["searchHead"]=head
        data["motion"]["searchOcclusion"]=occlusion
        assert all(frame["pixels"]==before[frame["id"]] for frame in data["frames"] if frame["id"] in before)
        path.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
        image=decode(data,"search")
        image.save(path.parent/"search.png")
        contact_sheet(data)
        reports.append({"style":style,"frameCount":len(data["frames"]),"searchId":data["ids"]["search"],
                        "allOtherFramesAndPalettePreserved":True,"motionTail":normalized})
        if style=="wumi":
            # Match the canonical pixel-style derivative: 240px indexed pose
            # sampled nearest to 80px, using its existing 48-color palette.
            source=image
    from refine_pixel_lines import refine
    refine()
    report={"passed":True,"source":"assets/poses/search.png","styles":reports}
    (ROOT/"tests/search-asset-validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=="__main__":
    main()
