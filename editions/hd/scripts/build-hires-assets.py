#!/usr/bin/env python3
"""Build 640x640 RGBA continuous-A8-alpha WebP runtime assets for DSH from Hi-Res."""
from __future__ import annotations

import argparse
import json
import hashlib
import shutil
import tempfile
import uuid
import copy
import re
import io
from pathlib import Path
from PIL import Image

import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_poke_reactions import umi_poke_pose
from expression_publication import assert_no_withdrawal, assert_source_native_metadata


def save_webp(im: Image.Image, target: Path, quality: int = 92) -> int:
    target.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGBA").save(
        target,
        format="WEBP",
        quality=quality,
        alpha_quality=100,
        method=4,
    )
    return target.stat().st_size


def save_expression_webp(im: Image.Image, target: Path) -> int:
    """Expression publication preserves authored RGBA, including hidden RGB."""
    target.parent.mkdir(parents=True, exist_ok=True)
    im.convert('RGBA').save(target, format='WEBP', lossless=True, exact=True, method=4)
    return target.stat().st_size


def build_talk_blinks(poses_dir: Path, out_poses_dir: Path, quality: int) -> list[str]:
    """Composite the 4 speaking mouth shapes onto talk-blink at 640x640 RGBA."""
    names = ["talk-closed", "talk-small", "talk-medium", "talk-wide"]
    eyes = Image.open(poses_dir / "talk-blink.png").convert("RGBA")
    shapes = [Image.open(poses_dir / f"{name}.png").convert("RGBA") for name in names]
    # Mouth region on 640x640 Umi canvas
    mouth_box = (230, 310, 370, 405)
    created = []
    for name, shape in zip(names, shapes):
        merged = eyes.copy()
        crop = shape.crop(mouth_box)
        merged.paste(crop, mouth_box)
        out_id = f"{name}-blink"
        save_webp(merged, out_poses_dir / f"{out_id}.webp", quality=quality)
        created.append(out_id)
    return created



GESTURE_IDS = frozenset(('wave', 'stretch', 'joy', 'grumpy', 'sad', 'cry', 'shy', 'flustered', 'surprise', 'proud', 'affection'))


def sha_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_reviewed_gestures(source: Path) -> tuple[dict, list[dict]]:
    """Preflight preserved approved PNGs before touching any runtime output.

    Reuse the published acceptance record; rebuilding WebP does not perform or
    invent a new anatomy/motion review. Unknown/unreviewed folders stay dormant.
    """
    reviewed, skipped = {}, []
    for folder in sorted((source / 'animations-640').glob('emotion-*')):
        if not folder.is_dir():
            continue
        action = folder.name.removeprefix('emotion-')
        timeline_path = folder / 'timeline.json'
        if action not in GESTURE_IDS:
            skipped.append({'action': action, 'reason': 'Unsupported action'})
            continue
        assert_no_withdrawal(folder)
        if not timeline_path.is_file():
            skipped.append({'action': action, 'reason': 'No reviewed timeline'})
            continue
        timeline = json.loads(timeline_path.read_text(encoding='utf-8'))
        if timeline.get('qa', {}).get('accepted') is not True:
            skipped.append({'action': action, 'reason': 'Timeline is not approved'})
            continue
        assert_source_native_metadata(timeline)
        publication_directories = [folder]
        source_file = timeline.get('source', {}).get('file')
        if source_file:
            if not isinstance(source_file, str):
                raise ValueError(f'{action}: invalid preserved source path')
            source_path = Path(source_file)
            if not source_path.is_absolute():
                source_path = source.parent / source_path
            publication_directories.append(source_path.resolve().parent)
        assert_no_withdrawal(*publication_directories)
        if timeline.get('schemaVersion') != 1 or timeline.get('width') != 640 or timeline.get('height') != 640:
            raise ValueError(f'{action}: approved gesture must keep its fixed 640x640 canvas')
        qa = timeline['qa']
        if any(not re.fullmatch(r'[0-9a-f]{64}', str(qa.get(key, ''))) for key in ('sourceSha256', 'reviewSha256')):
            raise ValueError(f'{action}: approved gesture must preserve source and review hashes')
        if timeline.get('source', {}).get('sha256') != qa['sourceSha256']:
            raise ValueError(f'{action}: source hash differs from the acceptance record')
        clip = timeline.get('clips', {}).get(action)
        if not isinstance(clip, dict) or clip.get('qa') != qa:
            raise ValueError(f'{action}: clip acceptance record differs from the reviewed timeline')
        ids, frames = clip.get('ids'), clip.get('frames')
        steps = timeline.get('sequence', {}).get('steps')
        evidence = timeline.get('sourceFrames')
        if not isinstance(ids, list) or not 2 <= len(ids) <= 96 or ids != [f'gesture-{action}-{n:03d}' for n in range(len(ids))]:
            raise ValueError(f'{action}: expected 2..96 ordered safe gesture frame IDs')
        if any(not isinstance(records, list) or len(records) != len(ids) for records in (frames, steps, evidence)):
            raise ValueError(f'{action}: incomplete frame timeline, sequence or PNG evidence')
        paths, end, previous_source = [], 0, -1
        for n, frame_id in enumerate(ids):
            step, frame, record = steps[n], frames[n], evidence[n]
            duration = step.get('durationMs')
            if type(duration) is not int or not 40 <= duration <= 2000:
                raise ValueError(f'{action}: each captured step must last 40..2000ms')
            if step.get('id') != frame_id or frame != {'atMs': end, 'id': frame_id}:
                raise ValueError(f'{action}: frames must retain exact forward contiguous timestamps')
            if record.get('id') != frame_id or record.get('atMs') != end or record.get('durationMs') != duration:
                raise ValueError(f'{action}: source evidence does not match playback timing')
            source_frame = record.get('sourceFrame')
            if type(source_frame) is not int or source_frame <= previous_source:
                raise ValueError(f'{action}: captured source order must increase')
            png = (folder / f'{frame_id}.png').resolve()
            if not png.is_relative_to(folder.resolve()) or not png.is_file() or sha_file(png) != record.get('sha256'):
                raise ValueError(f'{action}: preserved reviewed PNG is missing or changed: {frame_id}')
            with Image.open(png) as image:
                if image.size != (640, 640) or image.mode != 'RGBA':
                    raise ValueError(f'{action}: reviewed PNG must remain 640x640 RGBA')
            paths.append(png); end += duration; previous_source = source_frame
        if not 80 <= end <= 15000 or any(value != end for value in
            (clip.get('periodMs'), clip.get('durationMs'), timeline.get('sequence', {}).get('periodMs'))):
            raise ValueError(f'{action}: recorded periods must equal the full captured timeline')
        reviewed[action] = {'clip': copy.deepcopy(clip), 'frames': paths,
                            'frameHashes': {record['id']: record['sha256'] for record in evidence},
                            'timelinePath': timeline_path, 'timelineSha256': sha_file(timeline_path),
                            'publicationDirectories': publication_directories}
    return reviewed, skipped


def write_reviewed_gestures(reviewed: dict, output: Path) -> tuple[dict, int]:
    clips, total_bytes = {}, 0
    for action, entry in reviewed.items():
        assert_no_withdrawal(*entry.get('publicationDirectories', [entry['timelinePath'].parent]))
        for png in entry['frames']:
            target = output / f'gesture-{action}' / f'{png.stem}.webp'
            target.parent.mkdir(parents=True, exist_ok=True)
            data = png.read_bytes()
            if hashlib.sha256(data).hexdigest() != entry['frameHashes'][png.stem]:
                raise ValueError(f'{action}: preserved reviewed PNG changed during rebuild: {png.stem}')
            with Image.open(io.BytesIO(data)) as image:
                # Same lossless/exact encoding used by the reviewed packer.
                image.save(target, format='WEBP', lossless=True, exact=True, method=4)
            total_bytes += target.stat().st_size
        clips[action] = copy.deepcopy(entry['clip'])
    return clips, total_bytes


def runtime_revision(output: Path, manifest: dict) -> str:
    digest = hashlib.sha256()
    for image_file in sorted(output.rglob('*.webp')):
        digest.update(image_file.relative_to(output).as_posix().encode())
        digest.update(image_file.read_bytes())
    digest.update(json.dumps(manifest.get('animations', {}).get('gestures', {}), sort_keys=True,
                             separators=(',', ':')).encode())
    return digest.hexdigest()[:20]


def assert_existing_gestures_rebuildable(output: Path, reviewed: dict) -> None:
    manifest_path = output / 'manifest.json'
    if not manifest_path.is_file():
        return
    existing = json.loads(manifest_path.read_text(encoding='utf-8'))
    missing = [action for action, clip in existing.get('animations', {}).get('gestures', {}).items()
               if clip.get('qa', {}).get('accepted') is True and action not in reviewed]
    if missing:
        raise ValueError('Refusing to discard existing approved H3 clips without reviewed Hi-Res sources: ' + ', '.join(missing))


def publish_runtime(staged: Path, output: Path) -> None:
    """Swap a complete prebuilt bank, preserving the previous bank on failure."""
    output.parent.mkdir(parents=True, exist_ok=True)
    backup = output.with_name(f'.{output.name}-previous-{uuid.uuid4().hex}')
    had_previous = output.exists()
    if had_previous:
        output.rename(backup)
    try:
        staged.rename(output)
    except BaseException:
        if had_previous:
            backup.rename(output)
        raise
    if had_previous:
        shutil.rmtree(backup)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=ROOT / 'Hi-Res',
    )
    parser.add_argument("--output", type=Path, default=ROOT / "assets" / "hires" / "umi")
    parser.add_argument('--expressions-only', action='store_true', help='Append reviewed expression keyframes to the existing runtime bank')
    args = parser.parse_args()

    src: Path = args.source
    out: Path = args.output.resolve()
    runtime_root=(ROOT/'assets/hires').resolve()
    if not out.is_relative_to(runtime_root) or out==runtime_root:
        raise ValueError('Runtime output must be a child directory of this project assets/hires')
    if args.expressions_only:
        manifest_path=out/'manifest.json'
        manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
        files=sorted((ROOT/'assets/poses/expressions').glob('emotion-*.png'))
        if len(files)!=9: raise ValueError('Nine reviewed expression keyframes are required')
        metadata=json.loads((ROOT/'assets/poses/expressions/metadata.json').read_text(encoding='utf-8'))
        assert_no_withdrawal(ROOT/'assets/poses/expressions', src/'poses-640')
        assert_source_native_metadata(metadata)
        for png in files:
            with Image.open(png) as image: save_expression_webp(image,out/'poses'/f'{png.stem}.webp')
            if png.stem not in manifest['poses']: manifest['poses'].append(png.stem)
        manifest['expressions']={'sourceSha256':metadata['sourceSha256'],'baselineY':metadata['baselineY'],'poses':[p.stem for p in files]}
        manifest['revision']=runtime_revision(out, manifest)
        manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
        print(json.dumps({'expressions':len(files),'output':str(out),'revision':manifest['revision']}))
        return
    reviewed, skipped = load_reviewed_gestures(src)
    assert_existing_gestures_rebuildable(out, reviewed)
    previous_manifest_hash = sha_file(out / 'manifest.json') if (out / 'manifest.json').is_file() else None
    # No runtime directory is cleared while sources, metadata or WebP encoding
    # can still fail. Temporary output stays inside the verified runtime root.
    runtime_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f'.{out.name}-build-', dir=runtime_root) as temporary:
        staged = Path(temporary) / out.name
        result = build_runtime_bank(src, staged, reviewed)
        current_manifest_hash = sha_file(out / 'manifest.json') if (out / 'manifest.json').is_file() else None
        if current_manifest_hash != previous_manifest_hash:
            raise ValueError('Runtime manifest changed during rebuild; refusing to replace a concurrent update')
        for action, entry in reviewed.items():
            assert_no_withdrawal(*entry['publicationDirectories'])
            if sha_file(entry['timelinePath']) != entry['timelineSha256']:
                raise ValueError(f'{action}: reviewed timeline changed during rebuild')
        publish_runtime(staged, out)
    result['output'] = str(out)
    result['skippedGestureSources'] = skipped
    print(json.dumps(result, ensure_ascii=False, indent=2))


def build_runtime_bank(src: Path, out: Path, reviewed: dict) -> dict:
    assert_no_withdrawal(src/'poses-640', ROOT/'assets/poses/expressions')
    expression_metadata = ROOT/'assets/poses/expressions/metadata.json'
    if expression_metadata.is_file():
        assert_source_native_metadata(json.loads(expression_metadata.read_text(encoding='utf-8')))
    out_poses = out / "poses"
    out_watch = out / "watch"
    out_search = out / "search"
    out_poses.mkdir(parents=True, exist_ok=True)
    out_watch.mkdir(parents=True, exist_ok=True)
    out_search.mkdir(parents=True, exist_ok=True)

    pose_ids: list[str] = []
    total_bytes = 0

    # 1. 21 base poses from Hi-Res/poses-640
    poses_src = src / "poses-640"
    for png in sorted(poses_src.glob("*.png")):
        pose_id = png.stem
        im = Image.open(png).convert("RGBA")
        if pose_id.startswith('emotion-'):
            total_bytes += save_expression_webp(im, out_poses / f"{pose_id}.webp")
        else:
            total_bytes += save_webp(im, out_poses / f"{pose_id}.webp", quality=94)
        pose_ids.append(pose_id)

    # 2. 4 talk-*-blink composite poses at 640x640
    for blink_id in build_talk_blinks(poses_src, out_poses, quality=94):
        total_bytes += (out_poses / f"{blink_id}.webp").stat().st_size
        pose_ids.append(blink_id)

    # 3. listen & listen-blink at 640x640 from assets/poses
    for listen_id in ("listen", "listen-blink"):
        listen_png = ROOT / "assets" / "poses" / f"{listen_id}.png"
        if listen_png.exists():
            im = Image.open(listen_png).convert("RGBA")
            total_bytes += save_webp(im, out_poses / f"{listen_id}.webp", quality=94)
            pose_ids.append(listen_id)

    # 4. poke at 640x640 generated from Hi-Res/poses-640/idle-open.png
    idle_open_im = Image.open(poses_src / "idle-open.png").convert("RGBA")
    poke_im = umi_poke_pose(idle_open_im)
    total_bytes += save_webp(poke_im, out_poses / "poke.webp", quality=94)
    pose_ids.append("poke")

    # 5. Watch 640x640 animation frames + timeline
    watch_src = src / "animations-640" / "watch"
    watch_frames: list[str] = []
    for png in sorted(watch_src.glob("*.png")):
        im = Image.open(png).convert("RGBA")
        total_bytes += save_webp(im, out_watch / f"{png.stem}.webp", quality=88)
        watch_frames.append(png.stem)
    watch_timeline = json.loads((watch_src / "timeline.json").read_text(encoding="utf-8"))

    # 6. Search 640x640 animation frames + timeline
    search_src = src / "animations-640" / "search"
    search_frames: list[str] = []
    for png in sorted(search_src.glob("*.png")):
        im = Image.open(png).convert("RGBA")
        total_bytes += save_webp(im, out_search / f"{png.stem}.webp", quality=88)
        search_frames.append(png.stem)
    search_timeline = json.loads((search_src / "timeline.json").read_text(encoding="utf-8"))

    # Load motion rig metadata from reaction-sheet / listen / poke
    umi_sheet = json.loads((ROOT / "assets" / "reactions" / "umi" / "reaction-sheet.json").read_text(encoding="utf-8"))
    listen_meta = json.loads((ROOT / "assets" / "reactions" / "umi" / "listen-frames.json").read_text(encoding="utf-8"))
    poke_meta = json.loads((ROOT / "assets" / "reactions" / "umi" / "poke-patch.json").read_text(encoding="utf-8"))

    manifest = {
        "schemaVersion": 1,
        "style": "umi",
        "width": 640,
        "height": 640,
        "anchor": {"name": "nose", "x": 288, "y": 318},
        "format": "webp",
        "alpha": "continuous A8 preserved",
        "poses": sorted(set(pose_ids)),
        "animations": {
            "watch": {
                "frames": watch_frames,
                "clips": {
                    k: {
                        "durationMs": v["durationMs"],
                        "fps": v["fps"],
                        "frames": [
                            {"atMs": round(f["atMs"], 2), "id": Path(f["file"]).stem}
                            for f in v["frames"]
                        ],
                    }
                    for k, v in watch_timeline.get("clips", {}).items()
                },
            },
            "search": {
                "frames": search_frames,
                "clips": {
                    k: {
                        "durationMs": v["durationMs"],
                        "fps": v["fps"],
                        "frames": [
                            {"atMs": round(f["atMs"], 2), "id": Path(f["file"]).stem}
                            for f in v["frames"]
                        ],
                    }
                    for k, v in search_timeline.get("clips", {}).items()
                },
            },
        },
        "motion": {
            "ears": umi_sheet.get("motion", {}).get("ears"),
            "paws": umi_sheet.get("motion", {}).get("paws"),
            "wave": umi_sheet.get("motion", {}).get("wave"),
            "listen": listen_meta.get("motion"),
            "pokeFace": poke_meta.get("motion", {}).get("face"),
        },
    }
    gestures, gesture_bytes = write_reviewed_gestures(reviewed, out)
    manifest['animations']['gestures'] = gestures
    total_bytes += gesture_bytes
    expression_metadata=ROOT/'assets/poses/expressions/metadata.json'
    expression_ids=[p for p in manifest['poses'] if p.startswith('emotion-')]
    if len(expression_ids)==9 and expression_metadata.exists():
        metadata=json.loads(expression_metadata.read_text(encoding='utf-8'))
        manifest['expressions']={'sourceSha256':metadata['sourceSha256'],'baselineY':metadata['baselineY'],'poses':expression_ids}
    manifest['revision'] = runtime_revision(out, manifest)
    (out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return {
        'output': str(out), 'poses': len(pose_ids), 'watchFrames': len(watch_frames),
        'searchFrames': len(search_frames), 'gestureClips': sorted(gestures),
        'gestureFrames': sum(len(clip['ids']) for clip in gestures.values()),
        'totalMB': round(total_bytes / (1024 * 1024), 2), 'revision': manifest['revision'],
    }


if __name__ == "__main__":
    main()
