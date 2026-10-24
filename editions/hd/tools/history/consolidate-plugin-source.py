"""One-time import of verified local releases into the canonical repository.

External historical worktrees are inputs to this migration only. Builds must
subsequently use repository-local sources exclusively.
"""
from pathlib import Path
import hashlib,json,shutil

ROOT=Path(__file__).resolve().parents[1]
REGULAR=Path(r'D:\Software Projects\pi-furry-partner-regular')
ANIMATED=ROOT/'work/animated-remake-20261021'
BACKUP=ROOT/'work/source-consolidation-20261022/before'
assert not BACKUP.exists(), 'Migration backup already exists; do not overwrite'
BACKUP.mkdir(parents=True)
rows=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def install(source,relative):
    target=ROOT/relative
    if target.exists() and sha(target)==sha(source):return
    previous=BACKUP/relative
    if target.exists() and not previous.exists():
        previous.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,previous)
    target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
    rows.append({'path':str(relative).replace('\\','/'),'source':str(source),'sha256':sha(target)})

for folder in ['assets','lib','tests','scripts']:
    for source in (REGULAR/folder).rglob('*'):
        if source.is_file() and '__pycache__' not in source.parts and not source.name.endswith('.log'):
            install(source,source.relative_to(REGULAR))
for name in ['index.ts','package.json','install.ps1','uninstall.ps1','cordis.patch.yml']:
    install(REGULAR/name,Path(name))
# One shared implementation; original paired eye frames remain common.
for name in ['index.ts','lib/index.js','lib/dsh-client-source.js','lib/dsh-presentation.mjs',
             'lib/approved-motion.mjs','lib/approved-motion-codec.mjs','lib/approved-motion-node.mjs',
             'scripts/build-dsh-client.mjs','scripts/encode_indexed_binary.py']:
    install(ANIMATED/name,Path(name))
for source in (ANIMATED/'tests').glob('*'):
    if source.is_file() and (source.name.startswith(('approved-motion','animated-host','test_animated_export'))):
        install(source,source.relative_to(ANIMATED))
# Import only the approved illustration motion resources, excluding new pixel
# variants entirely. Historical complete packs remain in work/ as provenance.
catalog=json.loads((ANIMATED/'assets/animated/catalog.json').read_text(encoding='utf-8'))
kept=set()
removed=[]
for clip in catalog['clips'].values():
    for style in list(clip['indexed']):
        if style not in ['umi','illustration']:
            removed.append(clip['indexed'].pop(style)['file'])
    for entry in clip['indexed'].values():kept.add(entry['file'])
    for frame in clip['hires']['frames']:kept.add(clip['hires']['baseUrl']+frame['file'])
catalog['revision']+='-illustration-only'
catalog['pixelPolicy']='Original pixel artwork and legacy animation only; no regenerated pixel motion resources.'
for relative in kept:install(ANIMATED/'assets/animated'/relative,Path('assets/animated')/relative)
target=ROOT/'assets/animated/catalog.json';target.parent.mkdir(parents=True,exist_ok=True)
assert not target.exists(), 'Unexpected current animated catalog; preserve before changing'
target.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
report={'copiedOrUpdated':rows,'illustrationMotionResourceFiles':len(kept),
        'excludedNewPixelResources':sorted(set(removed)),
        'externalSourcesAreHistoricalOnly':True,'oldPixelRestoration':'pending source audit'}
(BACKUP.parent/'migration-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'updatedFiles':len(rows),'motionResourceFiles':len(kept),'excludedPixelFiles':len(set(removed))}))
