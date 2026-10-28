"""Rebase release metadata for a flat, self-contained output directory."""
import argparse
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def sibling(directory, value):
    path = Path(value)
    if path.is_absolute() or path.name != str(path):
        path = Path(path.name)
    target = directory / path
    assert target.is_file(), f'Missing release output: {target}'
    return path.name


def rebase(directory):
    directory = Path(directory).resolve()
    builds_path = directory / 'built-editions.json'
    audit_path = directory / 'edition-audit.json'
    summary_path = directory / 'release-summary.json'
    builds = read(builds_path)
    audits = read(audit_path)
    summary = read(summary_path)

    for build in builds['builds']:
        build['archive'] = sibling(directory, build['archive'])
        build['report'] = sibling(directory, build['report'])
    for audit in audits:
        audit['archive'] = sibling(directory, audit['archive'])
    for package in summary['packages']:
        package['archive'] = sibling(directory, package['archive'])
    summary['verification']['auditReport'] = sibling(directory, summary['verification']['auditReport'])

    write(builds_path, builds)
    write(audit_path, audits)
    write(summary_path, summary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    args = parser.parse_args()
    rebase(args.directory)


if __name__ == '__main__':
    main()
