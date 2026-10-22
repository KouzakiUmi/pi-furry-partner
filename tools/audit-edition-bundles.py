"""Audit real tarballs and unpack their runtime without duplicating HD media."""
from pathlib import Path
import hashlib,json,subprocess,tarfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/releases'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
builds=read(OUT/'built-editions.json')['builds']
origin=read(ROOT/'build/legacy-pixel-provenance.json')
results=[]
for build in builds:
    report=read(Path(build['report']))
    names={row['path']:row for row in report['files']}
    assert not any(path.startswith(('assets/reactions/umi-pixel/','assets/reactions/wumi',
      'assets/animated/indexed/umi-pixel/','assets/animated/indexed/pixel/')) for path in names)
    assert not any('state-idle' in path for path in names), 'Withdrawn unused bank must not return'
    assert any(path.startswith('assets/animated/') for path in names)==(build['edition']=='full-animation')
    checked=[]
    for source in origin['files']:
        if source['path'] not in names:continue # Original preview PNGs remain in the source repository.
        assert names[source['path']]['sha256']==source['sha256']
        checked.append(source['path'])
    assert len(checked)==4 # Sprite JSON, poke patch, native header, terminal fallbacks.
    target=ROOT/'dist/verified'/build['edition']
    assert target.resolve().is_relative_to((ROOT/'dist').resolve())
    target.mkdir(parents=True,exist_ok=True)
    # Single streaming pass: verify every entry, save only the portable runtime.
    count=0
    with tarfile.open(build['archive'],mode='r|gz') as archive:
        for member in archive:
            assert member.isfile() and member.name.startswith('package/')
            relative=member.name.removeprefix('package/')
            assert relative in names
            stream=archive.extractfile(member)
            digest=hashlib.sha256()
            save=not relative.startswith(('assets/hires/','assets/animated/hires/'))
            path=target/'package'/relative
            assert path.resolve().is_relative_to(target.resolve())
            if save:path.parent.mkdir(parents=True,exist_ok=True)
            output=path.open('wb') if save else None
            try:
                for part in iter(lambda:stream.read(1024*1024),b''):
                    digest.update(part)
                    if output:output.write(part)
            finally:
                if output:output.close()
            assert digest.hexdigest()==names[relative]['sha256']
            count+=1
    assert count==report['fileCount']
    subprocess.run(['node',str(ROOT/'tools/verify-packaged-runtime.mjs'),str(target/'package')],cwd=ROOT,check=True)
    results.append({'edition':build['edition'],'version':build['version'],'archive':build['archive'],
      'archiveBytes':build['archiveBytes'],'allEntriesReverified':count,'exactOriginalPixelRuntimeFiles':checked,
      'newPixelResourcesAbsent':True,'runtimeSmokePassed':True,'sourceRepository':str(ROOT),
      'installed':False,'published':False})
(OUT/'edition-audit.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(results,ensure_ascii=False))
