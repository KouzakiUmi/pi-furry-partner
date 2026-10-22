"""Read-only publication checks for approved sources and the derived banks."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1]
approved=root/'Hi-Res/approved-static-20261018'
manifest=json.loads((approved/'manifest.json').read_text(encoding='utf-8'))
registration=json.loads((approved/'runtime-registration.json').read_text(encoding='utf-8'))
assert len(manifest['records'])==40
assert len({r['sha256'] for r in manifest['records']})==39
for record in manifest['records']:
    name=record['id']; source=approved/record['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest()==record['sha256'],name
    reg=registration['records'][name]
    assert reg['sourceSha256']==record['sha256']
    assert reg['scale']==(1024/1448*.6 if name=='search' else 456/1086)
    png=Image.open(root/f'Hi-Res/poses-640/{name}.png').convert('RGBA')
    webp=Image.open(root/f'assets/hires/umi/poses/{name}.webp').convert('RGBA')
    assert png.size==(640,640) and np.array_equal(np.asarray(png),np.asarray(webp)),name
    alpha=np.asarray(png)[:,:,3]
    assert not np.any(alpha[0,:]>=128) and not np.any(alpha[-1,:]>=128),name
    assert not np.any(alpha[:,0]>=128) and not np.any(alpha[:,-1]>=128),name
    y,x=np.where(alpha>=128)
    assert abs(int(y.max())-608)<=2,(name,int(y.max()))
for style in ['umi','umi-pixel','pixel','illustration']:
    folder=root/f'assets/reactions/{style}'
    sheet=json.loads((folder/'reaction-sheet.json').read_text(encoding='utf-8'))
    palette=np.asarray(sheet['palette'],dtype=np.uint8)
    for frame in sheet['frames']:
        indices=np.asarray(frame['pixels']).reshape(sheet['height'],sheet['width'])
        preview=np.asarray(Image.open(folder/f"{frame['id']}.png").convert('RGBA'))
        assert np.array_equal(preview[:,:,:3],palette[indices]),(style,frame['id'])
        assert np.array_equal(preview[:,:,3],np.where(indices,255,0)),(style,frame['id'])
print('Approved exports: frozen hashes, 40/39 coverage, common world scale, 640 PNG/WebP RGBA equality, baseline/edge coverage and indexed PNG/JSON identity passed.')
