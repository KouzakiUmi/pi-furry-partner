from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1]
audit=json.loads((root/'work/stable-blinks/audit.json').read_text(encoding='utf-8'))
records=audit['records']+[{'base':'idle-open','closed':'idle-blink','eyeRoisLtrbInclusive':[(200,266,303,346),(338,267,437,347)]}]
for r in records:
    base=np.array(Image.open(root/f"assets/hires/umi/poses/{r['base']}.webp").convert('RGBA'))
    closed=np.array(Image.open(root/f"assets/hires/umi/poses/{r['closed']}.webp").convert('RGBA'))
    allowed=np.zeros((640,640),bool)
    for x0,y0,x1,y1 in r['eyeRoisLtrbInclusive']:allowed[y0:y1+1,x0:x1+1]=True
    assert np.array_equal(base[:,:,3],closed[:,:,3]),r['base']+' alpha changed'
    assert np.array_equal(base[~allowed],closed[~allowed]),r['base']+' outside eye region changed'
    assert np.any(base!=closed),r['base']+' missing closed eyes'
for style in ['umi','umi-pixel','illustration','pixel']:
    rel=f'assets/reactions/{style}/reaction-sheet.json'
    sheet=json.loads((root/rel).read_text(encoding='utf-8'))
    before=json.loads((root/'work/stable-blinks/before'/rel).read_text(encoding='utf-8'))
    assert sheet['palette']==before['palette']
    modified={r['closed'] for r in records}
    for frame in sheet['frames']:
        if frame['id'] not in modified:assert frame==before['frames'][before['ids'][frame['id']]],style+'/'+frame['id']
    n=sheet['width']
    for r in records:
        op=np.array(sheet['frames'][sheet['ids'][r['base']]]['pixels']).reshape(n,n)
        cl=np.array(sheet['frames'][sheet['ids'][r['closed']]]['pixels']).reshape(n,n)
        assert np.array_equal(op==0,cl==0)
        # Lanczos has a 3px sampling support at the eye-region edge; require exact
        # palette-index identity for all remaining head/body/cloak/paw pixels.
        allowed=np.zeros((n,n),bool)
        for x0,y0,x1,y1 in r['eyeRoisLtrbInclusive']:
            allowed[max(0,int(y0*n/640)-3):min(n,int(y1*n/640)+4),max(0,int(x0*n/640)-3):min(n,int(x1*n/640)+4)]=True
        assert np.array_equal(op[~allowed],cl[~allowed]),style+'/'+r['base']
result={'hdPairsPassed':len(records),'indexedBanksPassed':4,'paletteAndNonBlinkFramesUnchanged':True,'alphaAndOutsideEyePixelsIdentical':True,'reviewers':['regular_scale_audit','regular_render_audit'],'installationAuthorizedByUser':True,'newDynamicRemakeIncluded':False}
(root/'work/stable-blinks/verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
