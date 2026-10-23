"""Retain the restored Pi header in the separate whole-animation build."""
import hashlib
import json
import shutil
from pathlib import Path

ordinary = Path(r'D:\Software Projects\pi-furry-partner-regular')
animated = Path(r'D:\Software Projects\pi-furry-partner\work\animated-remake-20261021')
backup = animated / 'work/header-restoration-before-20261022'
rows = []
for name in ['assets/native-frames.json', 'assets/illustration/native-frames.json', 'assets/terminal-frames.json']:
    source, destination = ordinary / name, animated / name
    raw = source.read_bytes()
    data = json.loads(raw)
    if 'variants' in data:
        assert all(len(variant['frames']) == 15 for variant in data['variants'].values())
    else:
        assert len(data['frames']) == 15 and data['loopDurationMs'] == 4800
        assert data['headerRestoration']['scale'] == 1 and not data['headerRestoration']['perFrameFit']
    old = backup / name
    old.parent.mkdir(parents=True, exist_ok=True)
    if not old.exists():
        shutil.copy2(destination, old)
    shutil.copy2(source, destination)
    rows.append({'file': name, 'source': str(source), 'sha256': hashlib.sha256(raw).hexdigest()})
shutil.copy2(ordinary / 'tests/header-timeline.mjs', animated / 'tests/header-timeline.mjs')
report = {'scope': 'Pi title animation only; DSH static waving branding and approved motion art unchanged.', 'files': rows}
(animated / 'docs/header-restoration-integration.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
