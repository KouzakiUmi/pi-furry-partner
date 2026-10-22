"""Audit all edition/platform tarballs and unpack each into an isolated runtime."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/releases'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def digest_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(part)
    return digest.hexdigest()


def verify_runtime(root, package):
    result = subprocess.run(['node', str(root / 'tools/verify-packaged-runtime.mjs'), str(package)],
                            cwd=root, check=True, capture_output=True, text=True, encoding='utf-8')
    if result.stdout:
        print(result.stdout, end='')
    evidence = json.loads(result.stdout.strip().splitlines()[-1])
    assert evidence.get('passed') is True
    return evidence


def audit_builds(root=ROOT, out=OUT, verifier=verify_runtime, edition=None):
    configuration = read(root / 'build/editions.json')
    builds = read(out / 'built-editions.json')['builds']
    if edition is not None:
        assert edition in configuration['editions'], 'Unknown edition filter'
        builds = [build for build in builds if build['edition'] == edition]
    editions = [edition] if edition is not None else configuration['editions']
    expected = {(edition, platform) for edition in editions
                for platform in configuration['platforms']}
    keys = [(build['edition'], build['platform']) for build in builds]
    assert len(keys) == len(set(keys)) and set(keys) == expected, 'Require each edition/platform exactly once'
    origin = read(root / 'build/legacy-pixel-provenance.json')
    required_original = {entry['path'] for entry in origin['files'] if entry['path'].endswith('.json')}
    verified = root / 'dist/verified'
    verified.mkdir(parents=True, exist_ok=True)
    results = []
    for build in builds:
        edition, platform = build['edition'], build['platform']
        profile = configuration['platforms'][platform]['resourceProfile']
        report = read(Path(build['report']))
        assert build['profile'] == profile
        assert report['capabilities']['track'] == edition
        assert report['capabilities']['targetPlatform'] == platform
        assert report['capabilities']['resourceProfile'] == profile
        assert Path(report['archive']).resolve() == Path(build['archive']).resolve()
        archive_path = Path(build['archive'])
        assert archive_path.stat().st_size == report['archiveBytes'] == build['archiveBytes']
        archive_sha = digest_file(archive_path)
        assert archive_sha == report['archiveSha256'] == build['archiveSha256']
        names = {row['path']: row for row in report['files']}
        assert len(names) == len(report['files']) == report['fileCount']
        assert not any(path.startswith(('assets/reactions/umi-pixel/', 'assets/reactions/wumi',
                       'assets/animated/indexed/umi-pixel/', 'assets/animated/indexed/pixel/')) for path in names)
        assert not any('state-idle' in path for path in names), 'Withdrawn unused bank must not return'
        assert any(path.startswith('assets/animated/') for path in names) == configuration['editions'][edition]['fullAnimation']
        has_hd = any(path.startswith(('assets/hires/', 'assets/animated/hires/')) for path in names)
        assert has_hd == (profile == 'full'), 'Pi core excludes HD; DSH full retains HD'
        checked = []
        for source in origin['files']:
            if source['path'] not in names:
                continue  # Original preview PNGs are not runtime package inputs.
            assert names[source['path']]['sha256'] == source['sha256']
            checked.append(source['path'])
        assert required_original <= set(checked), 'Original pixel runtime/header files are mandatory'
        # A fresh directory prevents stale files from an earlier platform/version
        # from making a missing package dependency appear to pass.
        target = Path(tempfile.mkdtemp(prefix=f'{edition}-{platform}-', dir=verified))
        assert target.resolve().is_relative_to(verified.resolve())
        seen = set()
        with tarfile.open(archive_path, mode='r|gz') as archive:
            for member in archive:
                assert member.isfile() and member.name.startswith('package/')
                relative = member.name.removeprefix('package/')
                pure = PurePosixPath(relative)
                assert relative and not pure.is_absolute() and '..' not in pure.parts and '\\' not in relative
                assert relative in names and relative not in seen
                assert member.size == names[relative]['bytes']
                stream = archive.extractfile(member)
                digest = hashlib.sha256()
                save = not relative.startswith(('assets/hires/', 'assets/animated/hires/'))
                path = target / 'package' / relative
                assert path.resolve().is_relative_to(target.resolve())
                if save:
                    path.parent.mkdir(parents=True, exist_ok=True)
                output = path.open('wb') if save else None
                try:
                    for part in iter(lambda: stream.read(1024 * 1024), b''):
                        digest.update(part)
                        if output:
                            output.write(part)
                finally:
                    if output:
                        output.close()
                assert digest.hexdigest() == names[relative]['sha256']
                seen.add(relative)
        assert seen == set(names)
        evidence = verifier(root, target / 'package')
        assert evidence.get('passed') is True
        assert evidence.get('version') == build['version']
        assert evidence.get('profile') == profile
        results.append({'edition': edition, 'platform': platform, 'profile': profile,
                        'version': build['version'], 'archive': str(archive_path),
                        'archiveBytes': build['archiveBytes'], 'archiveSha256': archive_sha,
                        'allEntriesReverified': len(seen), 'exactOriginalPixelRuntimeFiles': checked,
                        'newPixelResourcesAbsent': True, 'runtimeSmokePassed': True,
                        'runtimeEvidence': evidence, 'verifiedRuntimeRoot': str(target / 'package'),
                        'sourceRepository': str(root), 'installed': False, 'published': False})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--edition', choices=['hd-remaster', 'full-animation'], help='Audit both platforms of only this edition; default requires all four combinations')
    args = parser.parse_args()
    results = audit_builds(edition=args.edition)
    filename = f'edition-audit-{args.edition}.json' if args.edition else 'edition-audit.json'
    (OUT / filename).write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(results, ensure_ascii=False))


if __name__ == '__main__':
    main()
