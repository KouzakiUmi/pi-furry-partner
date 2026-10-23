"""Lossless fixed registration into a shared review canvas; no motion or art edits."""
from pathlib import Path
from PIL import Image
import argparse
import hashlib
import json
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['peek', 'stretch'])
parser.add_argument('source', help='Final original output, relative to repository root')
args = parser.parse_args()
root = Path('D:/Software Projects/pi-furry-partner').resolve()
source = (root / args.source).resolve()
assert source.is_relative_to(root)
out = root / 'work/motion-polish-20261023/auxiliary-peek-lean-tilt-review-world-v1' / args.action
assert not out.exists(), 'Never overwrite a frozen review render'
out.mkdir(parents=True)
(out / 'rgba').mkdir()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
canvas = manifest['canvas']
assert len(manifest['frames']) == 107 and manifest['fps'] == 24
assert canvas in [[640, 640], [896, 896]]
offset = (128, 128) if canvas == [640, 640] else (0, 0)
frames = []
for i, old in enumerate(manifest['frames']):
    image = Image.open(source / 'rgba' / f'{i:03}.png').convert('RGBA')
    assert list(image.size) == canvas
    stage = Image.new('RGBA', (896, 896), (0, 0, 0, 0))
    stage.paste(image, offset)
    assert stage.crop((offset[0], offset[1], offset[0] + image.width, offset[1] + image.height)).tobytes() == image.tobytes()
    path = out / 'rgba' / f'{i:03}.png'
    stage.save(path)
    frames.append({**old, 'sha256': sha(path), 'originalRgbaFileSha256': sha(source / 'rgba' / f'{i:03}.png'), 'unchangedRgbaAtFixedOffset': True})
reference = root / 'Hi-Res/sources/h3-motion-polish-20261023/idle/key-purple-batch10-v1/registered-reference.png'
original = Image.open(reference).convert('RGBA')
assert original.size == (640, 640)
stage = Image.new('RGBA', (896, 896), (0, 0, 0, 0))
stage.paste(original, (128, 128))
stage.save(out / 'registered-reference.png')
videos = {}
for color, rgb in [('black', (0, 0, 0)), ('gray', (127, 127, 127)), ('white', (255, 255, 255))]:
    path = out / f'world-{color}.mp4'
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '896x896', '-framerate', '24', '-i', 'pipe:0', '-frames:v', '107', '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(path)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    for i in range(107):
        foreground = Image.open(out / 'rgba' / f'{i:03}.png').convert('RGBA')
        background = Image.new('RGBA', (896, 896), rgb + (255,))
        process.stdin.write(Image.alpha_composite(background, foreground).convert('RGB').tobytes())
    process.stdin.close()
    assert process.wait() == 0
    videos[color] = {'file': path.name, 'sha256': sha(path)}
proof = {**manifest, 'canvas': [896, 896], 'pivot': [448, 736], 'frames': frames,
         'reviewOnly': True, 'originalOutput': args.source, 'originalManifestSha256': sha(source / 'manifest.json'),
         'fixedRegistration': {'originalCanvas': canvas, 'offset': offset, 'scale': 1, 'worldOriginInReviewCanvas': [128, 128], 'noRetimingOrInterpolation': True, 'all107RgbaArraysPreserved': True},
         'videos': videos}
(out / 'manifest.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'action': args.action, 'output': str(out), 'manifestSha256': sha(out / 'manifest.json'), 'all107RgbaArraysPreserved': True}, ensure_ascii=False), flush=True)
