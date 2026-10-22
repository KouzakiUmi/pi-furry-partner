"""Resolve a release tag and validate that only its two audited platform packages upload."""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def release_target(root, tag):
    configuration = read(root / 'build/editions.json')
    matches = [(edition, spec) for edition, spec in configuration['editions'].items()
               if tag == 'v' + spec['version']]
    assert len(matches) == 1, 'Tag must match exactly one version in build/editions.json'
    edition, spec = matches[0]
    version = spec['version']
    assert re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?', version)
    prerelease = '-' in version.split('+', 1)[0]
    changelog = (root / 'CHANGELOG.md').read_text(encoding='utf-8')
    sections = re.split(r'^## ', changelog, flags=re.MULTILINE)
    notes = [section.split('\n', 1)[1].strip() for section in sections
             if re.match(re.escape(version) + r'\s+·[^\n]*\n', section)]
    assert len(notes) == 1 and notes[0], 'A nonempty exact-version changelog section is required'
    return {'tag': tag, 'edition': edition, 'version': version, 'prerelease': prerelease,
            'latest': 'false' if prerelease else 'true',
            'title': f"pi-furry-partner {tag} · {spec['label']}"}, notes[0]


def prepare(root, tag, output, github_output=None):
    plan, notes = release_target(root, tag)
    output.mkdir(parents=True, exist_ok=True)
    notes_file = output / 'release-notes.md'
    notes_file.write_text(notes + '\n', encoding='utf-8')
    plan['notesFile'] = str(notes_file.resolve())
    (output / 'release-plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if github_output:
        with github_output.open('a', encoding='utf-8') as stream:
            stream.write(f"edition={plan['edition']}\nversion={plan['version']}\n")
    return plan


def file_digest(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(part)
    return digest.hexdigest()


def release_assets(root, plan, releases):
    expected_plan, notes = release_target(root, plan['tag'])
    for key, value in expected_plan.items():
        assert plan[key] == value, f'Release plan changed: {key}'
    assert Path(plan['notesFile']).read_text(encoding='utf-8').strip() == notes
    edition, version = plan['edition'], plan['version']
    platforms = read(root / 'build/editions.json')['platforms']
    builds = [row for row in read(releases / 'built-editions.json')['builds'] if row['edition'] == edition]
    audits = read(releases / f'edition-audit-{edition}.json')
    expected = {(edition, platform) for platform in platforms}
    keys = [(row['edition'], row['platform']) for row in builds]
    audit_keys = [(row['edition'], row['platform']) for row in audits]
    assert len(keys) == len(set(keys)) and set(keys) == expected, 'Require both platform builds, without duplicates'
    assert len(audit_keys) == len(set(audit_keys)) and set(audit_keys) == expected, 'Require both platform audits, without duplicates'
    by_key = dict(zip(audit_keys, audits))
    assets = []
    for build in builds:
        platform = build['platform']
        profile = platforms[platform]['resourceProfile']
        audit = by_key[(edition, platform)]
        archive = Path(build['archive']).resolve()
        report_file = Path(build['report']).resolve()
        report = read(report_file)
        suffix = '-pi-core' if profile == 'pi-core' else ''
        assert archive.name == f'pi-furry-partner-{edition}-{version}{suffix}.tgz'
        assert archive.parent == releases.resolve() and report_file.parent == releases.resolve()
        assert build['version'] == audit['version'] == version
        assert build['profile'] == audit['profile'] == profile
        assert Path(audit['archive']).resolve() == Path(report['archive']).resolve() == archive
        assert report['capabilities']['track'] == edition
        assert report['capabilities']['targetPlatform'] == platform
        assert report['capabilities']['resourceProfile'] == profile
        assert report['allArchiveEntriesVerified'] is True and audit['runtimeSmokePassed'] is True
        assert audit['runtimeEvidence']['passed'] is True
        assert audit['runtimeEvidence']['version'] == version and audit['runtimeEvidence']['profile'] == profile
        assert audit['newPixelResourcesAbsent'] is True
        assert report['fileCount'] == audit['allEntriesReverified']
        assert archive.stat().st_size == build['archiveBytes'] == audit['archiveBytes'] == report['archiveBytes']
        digest = file_digest(archive)
        assert digest == build['archiveSha256'] == audit['archiveSha256'] == report['archiveSha256']
        checksum = archive.with_suffix('.tgz.sha256')
        assert checksum.read_text(encoding='utf-8').strip() == f'{digest}  {archive.name}'
        assets.extend([str(archive), str(checksum), str(report_file)])
    assert len(assets) == len(set(assets)) == len(platforms) * 3
    return assets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    resolve = sub.add_parser('resolve')
    resolve.add_argument('--tag', required=True)
    resolve.add_argument('--output', type=Path, default=ROOT / 'dist/release')
    resolve.add_argument('--github-output', type=Path)
    assets = sub.add_parser('assets')
    assets.add_argument('--plan', type=Path, required=True)
    assets.add_argument('--releases', type=Path, default=ROOT / 'dist/releases')
    args = parser.parse_args()
    if args.command == 'resolve':
        print(json.dumps(prepare(ROOT, args.tag, args.output, args.github_output), ensure_ascii=False))
    else:
        paths = release_assets(ROOT, read(args.plan), args.releases)
        target = args.plan.parent / 'release-assets.json'
        target.write_text(json.dumps(paths, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'edition': read(args.plan)['edition'], 'assets': paths}, ensure_ascii=False))


if __name__ == '__main__':
    main()
