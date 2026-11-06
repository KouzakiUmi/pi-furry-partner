"""Archive only the original-resource product from a tag or source tree."""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import stat
import subprocess
import zipfile

ARCHIVE_PREFIX = 'pi-furry-partner/'
EXCLUDED_TOP_LEVEL = frozenset({'editions', '.github', '.git'})


def allowed(relative):
    return relative.parts and relative.parts[0] not in EXCLUDED_TOP_LEVEL


def verify_archive(output):
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        assert names and all(name.startswith(ARCHIVE_PREFIX) for name in names)
        assert not any(name.startswith(f'{ARCHIVE_PREFIX}editions/') for name in names)
        assert not any(name.startswith(f'{ARCHIVE_PREFIX}.github/') for name in names)


def assert_required(names):
    top_level = {name.split('/', 1)[0] for name in names}
    assert {'index.ts', 'lib', 'assets'} <= top_level


def archive_tag(root, tag, output):
    names = subprocess.check_output(
        ['git', 'ls-tree', '--name-only', tag], cwd=root, text=True
    ).splitlines()
    names = [name for name in names if name not in EXCLUDED_TOP_LEVEL]
    assert_required(names)
    subprocess.run([
        'git', 'archive', '--format=zip', '--prefix=' + ARCHIVE_PREFIX,
        f'--output={output.resolve()}', tag, '--', *names,
    ], cwd=root, check=True)


def archive_source(source, output):
    files = [
        path for path in source.rglob('*')
        if path.is_file() and allowed(path.relative_to(source))
    ]
    files.sort(key=lambda path: path.relative_to(source).as_posix())
    relative_names = [path.relative_to(source).as_posix() for path in files]
    assert_required(relative_names)

    epoch = max(int(os.environ.get('SOURCE_DATE_EPOCH', '0')), 315532800)
    timestamp = datetime.fromtimestamp(epoch, timezone.utc).replace(microsecond=0)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            relative = path.relative_to(source).as_posix()
            info = zipfile.ZipInfo(ARCHIVE_PREFIX + relative, date_time=timestamp.timetuple()[:6])
            info.create_system = 3
            # Ignore the source tree's permission bits: a Git checkout and a Nix
            # store (or unpacked build dir) do not agree on them, and the
            # archive must stay identical regardless of where it was built.
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument('--tag')
    source_group.add_argument('--source', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()

    if args.tag:
        root = Path(__file__).resolve().parents[1]
        archive_tag(root, args.tag, args.out)
    else:
        source = args.source.resolve(strict=True)
        archive_source(source, args.out)

    verify_archive(args.out)
    print(f'Original-resource archive verified: {args.out}')


if __name__ == '__main__':
    main()
