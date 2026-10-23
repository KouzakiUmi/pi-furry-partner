"""Build inspectable local npm bundles without modifying or installing source trees."""
import argparse
import gzip
import hashlib
import io
import json
import re
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--track', choices=['hd-remaster', 'full-animation'], required=True)
    parser.add_argument('--profile', choices=['full', 'pi-core'], default='full')
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    args.out.mkdir(parents=True, exist_ok=True)
    package = json.loads((source / 'package.json').read_text(encoding='utf-8'))
    assert package['name'] == 'pi-furry-partner'
    platform = 'pi' if args.profile == 'pi-core' else 'dsh'
    configuration = json.loads((source / 'build/editions.json').read_text(encoding='utf-8'))
    prefix = configuration['platforms'][platform].get('artifactPrefix', f'{platform}-furry-partner')
    assert re.fullmatch(r'[a-z0-9][a-z0-9.-]*', prefix) and prefix.startswith(platform + '-'), 'Platform-specific safe artifact prefix required'
    filename = f'{prefix}-{args.track}-{args.version}' + ('-pi-core' if args.profile == 'pi-core' else '') + '.tgz'
    listing = subprocess.run(['npm.cmd', 'pack', '--dry-run', '--json', '--ignore-scripts'], cwd=source,
                             capture_output=True, text=True, encoding='utf-8', check=True)
    candidates = json.loads(listing.stdout)[0]['files']
    files = {}
    excluded = []
    for row in candidates:
        name = row['path'].replace('\\', '/')
        relative = Path(name)
        assert not relative.is_absolute() and '..' not in relative.parts
        assert relative.parts[0] not in {'.git', 'node_modules', 'work', 'dist'}
        assert not {'.git', 'node_modules'}.intersection(relative.parts)
        alias = name.startswith(('assets/reactions/wumi/', 'assets/reactions/wumi-pixel/'))
        hd = name.startswith(('assets/hires/', 'assets/animated/hires/'))
        generation_media = name.startswith('assets/animated/provenance/') and relative.suffix.lower() in {'.mp4', '.png', '.jpg', '.jpeg', '.webp', '.gif'}
        legacy_pixel = name.startswith(('assets/reactions/pixel/', 'assets/reactions/umi-pixel/')) or name in {'assets/native-frames.json','assets/terminal-frames.json','legacy-pixel-provenance.json','build/legacy-pixel-provenance.json'} or (relative.parent.as_posix() == 'assets' and relative.suffix.lower() in {'.png','.gif'})
        if legacy_pixel or alias or generation_media or (args.profile == 'pi-core' and hd):
            reason = 'pixel artwork belongs to the legacy release line' if legacy_pixel else 'canonical style alias' if alias else 'generation-only source/reference media; runtime frames and approval records retained' if generation_media else 'Pi uses indexed artwork'
            excluded.append({'path': name, 'bytes': row['size'], 'reason': reason})
            continue
        path = (source / relative).resolve(strict=True)
        assert path.is_relative_to(source)
        files[name] = path
    clip_ids, transition_count = [], 0
    if args.track == 'full-animation':
        catalog = json.loads((source / 'assets/animated/catalog.json').read_text(encoding='utf-8'))
        clip_ids = sorted(catalog['clips'])
        transition_count = sum(clip['family'] == 'transition' for clip in catalog['clips'].values())
        assert clip_ids and all(clip.get('qa', {}).get('accepted') is True for clip in catalog['clips'].values())
    source_version = package['version']
    package.update(version=args.version)
    capability = {
        'track': args.track, 'resourceProfile': args.profile,
        'targetPlatform': platform, 'artifactPrefix': prefix,
        'releaseLine': configuration.get('releaseLine', 'main'),
        'hdArtIncluded': args.profile == 'full', 'indexedArtIncluded': True,
        'sourceVersion': source_version,
        'description': 'Ordinary behavior with remastered artwork' if args.track == 'hd-remaster' else f'{len(clip_ids)} approved whole-frame motion clips with keyboard chain',
        'installation': 'Local package only; not installed or published by this build.',
        'pixelPolicy': 'legacy-only', 'publicStyles': ['umi'],
        'approvedMotionClipIds': clip_ids, 'approvedMotionClipCount': len(clip_ids),
        'fullMotionStyles': ['umi', 'illustration'] if args.track == 'full-animation' else [],
    }
    package['umiDistribution'] = capability
    overrides = {'package.json': (json.dumps(package, ensure_ascii=False, indent=2) + '\n').encode('utf-8'),
                 'distribution.json': (json.dumps(capability, ensure_ascii=False, indent=2) + '\n').encode('utf-8')}
    label = '原逻辑高清重制版' if args.track == 'hd-remaster' else '全动态重做版'
    intro = f'> 本地完整构建：**{label} {args.version}**。'
    intro += ' Pi 终端精简资源包，不含 DSH 高清位图；动作、索引像素和时间轴完整保留。' if args.profile == 'pi-core' else ' Pi / DSH 完整离线资源包。'
    intro += f' 下载附件以 {prefix}- 为前缀，按宿主区分。'
    intro += ' 安装前请保存并退出对应宿主；本包尚未代为安装或公开发布。\n\n'
    for readme in ['README.md', 'README.en.md']:
        content = (source / readme).read_text(encoding='utf-8')
        if content.startswith('> '):
            content = content.split('\n\n', 1)[1]
        content = '\n'.join(line for line in content.splitlines()
                            if not line.startswith(('[![Release ', '[**下载 ', '[**Download ')))
        header = intro if readme == 'README.md' else (
            f'> Local build: **{args.track} {args.version}**, resource profile **{args.profile}**. '
            'See LOCAL-BUILD.md for local installation; this build is not installed or publicly released.\n\n')
        overrides[readme] = (header + content + '\n').encode('utf-8')
    local_guide = f'''# 呜咪 · {label} {args.version}

本包目标宿主：{platform.upper()}；资源类型：{args.profile}；发布线路：{configuration.get('releaseLine', 'main')}。
Pi下载以pi-开头的包，DSH下载以dsh-开头的包。每个宿主只安装一个包；本高清／全动态包仅提供插画，像素仅在Legacy发行。
main为2.5起的全动态线路；旧资源维护版在legacy分支，使用独立legacy-v2.4.x标签。

## DSH

DSH请选择full完整包。保存工作并退出DSH后，在包所在目录执行：

```powershell
dsh plugin --profile desktop add "./dsh-furry-partner-{args.track}-{args.version}.tgz"
```

该语法依本机DSH 0.2.1-rc.2的组合包发布文档核对。此构建没有代你执行安装。
安装前保留现有插件配置和回退包；不同宿主中的真实运行验收仍需安装后完成。

## Pi

Pi可使用pi-core精简资源包，所有终端动作和时间轴完整保留；只省去Web端高清位图。
将tgz解压后，在package目录运行自带install.ps1；安装器会备份原配置和扩展。
完整包也可用于Pi，终端显示资源与精简包相同。

## 资源与验证

Legacy分支保留原版资源与简单帧；本main全动态包不混装为另一条高清重制线路。
全动态重做版包含{len(clip_ids)-transition_count}段完整角色动作和{transition_count}段键盘过渡；键盘过渡各400ms，说话保留独立口型。
全动态版索引载荷为精确无损字节编码；不降低原图分辨率、帧率或改变颜色、Alpha。
完整离线包保留高清与旧回退资源。安装包旁的report.json记录每个文件SHA-256及全包回读验证。
'''
    overrides['LOCAL-BUILD.md'] = local_guide.encode('utf-8')
    for name in ['docs/guide.zh-CN.md', 'docs/guide.en.md', 'docs/architecture.md',
                 'docs/regular-version.md', 'docs/animated-preview.md', 'docs/animated-resource-protocol.md']:
        if (source / name).is_file():
            files[name] = source / name
    if 'LICENSE' not in files:
        files['LICENSE'] = source / 'LICENSE'
    output = args.out / filename
    assert not output.exists(), 'Preserve earlier bundles; choose a new output directory/version.'
    report = {'createdUtc': datetime.now(timezone.utc).isoformat(), 'source': str(source), 'capabilities': capability,
              'archive': str(output), 'excluded': excluded, 'files': [], 'installed': False, 'published': False}
    with output.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, compresslevel=6, mtime=0) as zipped, tarfile.open(fileobj=zipped, mode='w|', format=tarfile.USTAR_FORMAT) as archive:
        for name in sorted(set(files) | set(overrides)):
            data = overrides.get(name)
            if data is None:
                data = files[name].read_bytes()
            entry = tarfile.TarInfo('package/' + name)
            entry.size, entry.mode, entry.mtime = len(data), 0o644, 0
            archive.addfile(entry, io.BytesIO(data))
            report['files'].append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    expected = {row['path']: row for row in report['files']}
    checked = set()
    with tarfile.open(output, 'r|gz') as archive:
        for entry in archive:
            assert entry.isfile() and entry.name.startswith('package/')
            name = entry.name[len('package/'):]
            assert name not in checked and name in expected
            checked.add(name)
            data = archive.extractfile(entry).read()
            assert len(data) == expected[name]['bytes']
            assert hashlib.sha256(data).hexdigest() == expected[name]['sha256'], name
    assert checked == set(expected)
    report.update(archiveBytes=output.stat().st_size, unpackedBytes=sum(row['bytes'] for row in report['files']),
                  fileCount=len(checked), archiveSha256=digest(output), allArchiveEntriesVerified=True)
    output.with_suffix('.tgz.sha256').write_text(f"{report['archiveSha256']}  {filename}\n", encoding='utf-8')
    output.with_suffix('.report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: report[key] for key in ['archive', 'archiveBytes', 'unpackedBytes', 'fileCount', 'archiveSha256', 'allArchiveEntriesVerified']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
