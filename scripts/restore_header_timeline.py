"""Verify or restore the accepted Pi title banks from repository-local sources.

The older generation procedure is retained under tools/history. This entry
restores exact reviewed artifacts, including the unchanged original pixel bank.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'Hi-Res/production/pi-header'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Restore the reviewed banks; otherwise verify only')
    args = parser.parse_args()
    manifest = json.loads((SOURCE/'manifest.json').read_text(encoding='utf-8'))
    for entry in manifest['files']:
        source = SOURCE/entry['path']
        target = ROOT/'assets'/entry['path']
        if sha(source) != entry['sha256']:
            raise ValueError('Accepted header source changed: '+entry['path'])
        if args.apply:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        if sha(target) != entry['sha256']:
            raise ValueError('Header differs from accepted source: '+entry['path'])
    print(json.dumps({'verified': len(manifest['files']), 'restored': args.apply, 'externalInputs': False}))

if __name__ == '__main__':
    main()
