"""Review-only cape chroma / disconnected matte residue cleanup.

Reference: current approved idle fabric, preserving source luminance/motion.
Production assets are never overwritten. Not an artwork or silhouette redraw.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'work/remaster-color-audit-20261022/cape-pilot-v3'
LUMA = np.array([.2126, .7152, .0722])


def smooth(x, low, high):
    t = np.clip((x-low)/(high-low), 0, 1)
    return t*t*(3-2*t)


def fabric_palette():
    a = np.array(Image.open(ROOT/'assets/hires/umi/poses/idle-open.webp').convert('RGBA'))
    rgb = a[:, :, :3].astype(float)
    r, g, b = rgb.transpose(2, 0, 1)
    y = rgb @ LUMA
    # Opaque dark blue-grey only: white fur, gray paws and saturated scarf excluded.
    mask = (a[:, :, 3] > 245) & (b-r > 12) & (b-r < 60) & (g-r > 2) & (b-g > 4) & (y < 155)
    knots, chroma = [], []
    for lo, hi in [(20, 35), (35, 45), (45, 60), (60, 75), (75, 90), (90, 110), (110, 140)]:
        sel = mask & (y >= lo) & (y < hi)
        knots.append(float(np.median(y[sel])))
        chroma.append(np.median((rgb-y[:, :, None])[sel], axis=0))
    return np.array(knots), np.array(chroma)


def transform(a, action, palette):
    rgb = a[:, :, :3].astype(float)
    r, g, b = rgb.transpose(2, 0, 1)
    y = rgb @ LUMA
    spread = rgb.max(2)-rgb.min(2)
    yy, xx = np.mgrid[:a.shape[0], :a.shape[1]]
    # Use complete fabric chroma, rather than correcting only a large green excess.
    cloth = smooth(np.maximum(b-r, g-r), 3, 10)
    cloth *= 1-smooth(spread, 65, 85)
    cloth *= smooth(y, 15, 30)*(1-smooth(y, 145, 170))
    cloth *= 1-smooth(r-g, 0, 7)
    protected = np.zeros(y.shape, bool)
    if action == 'watch':
        # Full eye/lens sweep and handle: no changes to optics or accessory color.
        protected |= (xx >= 180) & (xx <= 462) & (yy >= 174) & (yy <= 388)
        protected |= (xx >= 210) & (xx <= 340) & (yy >= 350) & (yy <= 510)
    else:
        # Tail occupies the upper half throughout this approved clip. Protect
        # its material explicitly: video spill can give gray fur a fabric hue.
        protected |= (yy < 350) | (yy >= 448) | (xx >= 395)
    cloth[protected] = 0
    knots, chroma = palette
    target = np.stack([np.interp(y, knots, chroma[:, c]) for c in range(3)], axis=2)
    target -= (target @ LUMA)[:, :, None]
    desired = y[:, :, None] + target
    result = rgb+(desired-rgb)*cloth[:, :, None]
    out = a.copy()
    out[:, :, :3] = np.uint8(np.clip(np.rint(result), 0, 255))
    # Remove only disconnected matte components with no opaque subject support.
    # Preserve all subject pixels and every partially transparent attached edge.
    labels, count = ndimage.label(a[:, :, 3] > 0, structure=np.ones((3, 3)))
    maxima = ndimage.maximum(a[:, :, 3], labels, np.arange(count+1))
    remove = (labels > 0) & (maxima[labels] < 128)
    out[remove] = 0
    visible = a[:, :, 3] > 0
    luma_delta = np.abs((out[:, :, :3].astype(float)-rgb) @ LUMA)
    subject = a[:, :, 3] >= 128
    assert np.array_equal(out[:, :, 3][subject], a[:, :, 3][subject])
    assert np.array_equal(out[protected & ~remove], a[protected & ~remove])
    assert luma_delta[visible & ~remove].max() < 1.01
    return out, {
        'clothPixels': int(((out[:, :, :3] != a[:, :, :3]).any(2) & visible & ~remove).sum()),
        'removedDetachedMattePixels': int(remove.sum()),
        'maxRetainedPixelLumaDelta8bit': float(luma_delta[visible & ~remove].max()),
        'allSubjectAlphaAtLeast128Unchanged': True,
        'allProtectedRetainedPixelsExact': True,
    }


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    palette = fabric_palette()
    manifest = json.loads((ROOT/'assets/hires/umi/manifest.json').read_text())
    idle = Image.open(ROOT/'assets/hires/umi/poses/idle-open.webp').convert('RGBA')
    report = {
        'status': 'REVIEW_ONLY', 'runtimeApplied': False,
        'scope': 'Cape/hood chroma and detached low-alpha matte residue only',
        'reference': 'assets/hires/umi/poses/idle-open.webp',
        'paletteLuminanceKnots': palette[0].tolist(), 'paletteChroma': palette[1].tolist(),
        'mattePolicy': 'Remove disconnected components with maximum alpha below 128; attached alpha unchanged',
        'clips': {},
    }
    for action in ['watch', 'search']:
        clip = next(iter(manifest['animations'][action]['clips'].values()))
        frames = clip['frames']
        folder = OUT/action
        (folder/'rgba').mkdir(parents=True, exist_ok=True)
        encoder = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1920x680', '-r', '24', '-i', '-',
            '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '15', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', str(folder/'comparison.mp4')], stdin=subprocess.PIPE)
        rows = []
        samples = {0, len(frames)//2, len(frames)-1}
        for n, f in enumerate(frames):
            source = ROOT/f'assets/hires/umi/{action}/{f["id"]}.webp'
            before = Image.open(source).convert('RGBA')
            arr, checks = transform(np.array(before), action, palette)
            after = Image.fromarray(arr)
            candidate = folder/'rgba'/f'{n:03}.png'
            after.save(candidate)
            def comparison(bg):
                canvas = Image.new('RGB', (1920, 680), bg)
                draw = ImageDraw.Draw(canvas)
                for col, (title, im) in enumerate([('CURRENT', before), ('CAPE / MATTE PILOT', after), ('IDLE REFERENCE', idle)]):
                    draw.text((col*640+10, 10), title, fill='white' if bg == '#17191e' else 'black')
                    canvas.paste(Image.alpha_composite(Image.new('RGBA', im.size, bg), im).convert('RGB'), (col*640, 40))
                return canvas
            canvas = comparison('#17191e')
            encoder.stdin.write(canvas.tobytes())
            if n in samples:
                canvas.save(folder/f'comparison-{n:03}.png')
                comparison('#e5e7eb').save(folder/f'light-{n:03}.png')
            rows.append({'id': f['id'], 'atMs': f['atMs'], 'sourceSha256': digest(source), 'candidateSha256': digest(candidate), **checks})
        encoder.stdin.close()
        assert encoder.wait() == 0
        report['clips'][action] = {'frameCount': len(frames), 'periodMs': clip['durationMs'], 'frames': rows}
    (OUT/'review.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(OUT)


if __name__ == '__main__':
    main()
