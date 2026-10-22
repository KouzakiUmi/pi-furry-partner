"""Build either edition from this repository's shared sources and artwork.

Only the generated edition literal, package metadata and motion asset inclusion
differ. No historical worktree or absolute user path is a build dependency.
"""
import argparse, hashlib, json, os, shutil, subprocess, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
def run(args,cwd): subprocess.run(args,cwd=cwd,check=True)
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--edition',choices=['hd-remaster','full-animation','all'],default='all')
    parser.add_argument('--profile',choices=['full','pi-core'],default='full')
    parser.add_argument('--platform',choices=['pi','dsh','all'],help='Build host-specific packages; --profile remains supported for older commands')
    parser.add_argument('--out',type=Path,default=ROOT/'dist/releases')
    parser.add_argument('--prepare-only',action='store_true')
    parser.add_argument('--test',action='store_true')
    args=parser.parse_args()
    configuration=read(ROOT/'build/editions.json')
    specs=configuration['editions']
    platforms=configuration['platforms']
    targets=list(platforms) if args.platform=='all' else [args.platform] if args.platform else ['pi' if args.profile=='pi-core' else 'dsh']
    names=list(specs) if args.edition=='all' else [args.edition]
    build_info=[]
    for edition in names:
        spec=specs[edition]
        stage=ROOT/'dist/staging'/edition
        # Generated stages are disposable. Verify the resolved target before
        # removing anything; never operate on a caller-supplied source path.
        assert stage.resolve().parent==(ROOT/'dist/staging').resolve()
        assert stage.name in specs
        if stage.exists(): shutil.rmtree(stage)
        stage.mkdir(parents=True)
        for folder in ['lib','assets','prompts','themes','tests','scripts','build']:
            ignore=shutil.ignore_patterns('__pycache__','*.pyc','*-validation','*-validation.json','*.log')
            def filtered(directory,files,ignore=ignore):
                skipped=set(ignore(directory,files))
                if Path(directory)==ROOT/'assets':
                    if not spec['fullAnimation']:skipped.add('animated')
                    skipped.add('poses') # Generation sources are not runtime dependencies.
                if Path(directory)==ROOT/'assets/reactions':
                    skipped.update(set(files)-{'umi','pixel'})
                return skipped
            shutil.copytree(ROOT/folder,stage/folder,ignore=filtered)
        for filename in ['package.json','index.ts','config.json','install.ps1','uninstall.ps1',
                         'cordis.patch.yml','LICENSE','NOTICE','ASSET_LICENSE.md','README.md','README.en.md']:
            if (ROOT/filename).exists():shutil.copy2(ROOT/filename,stage/filename)
        if (ROOT/'docs').exists():shutil.copytree(ROOT/'docs',stage/'docs')
        profile=stage/'lib/build-profile.mjs'
        source=profile.read_text(encoding='utf-8')
        literal="export const BUILD_EDITION = 'hd-remaster';"
        assert source.count(literal)==1,'Build profile must have exactly one edition literal'
        profile.write_text(source.replace(literal,f"export const BUILD_EDITION = '{edition}';"),encoding='utf-8')
        package=read(stage/'package.json');package['version']=spec['version']
        # Only the published runtime is declared; build/test entrypoints remain
        # at repository root, not broken commands inside the install package.
        package['scripts']={'test':'node tests/run.mjs','test:dsh':'node tests/run-dsh.mjs','build:dsh':'node scripts/build-dsh-client.mjs'}
        (stage/'package.json').write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        run(['node','scripts/build-dsh-client.mjs'],stage)
        if args.test:
            run(['node','tests/run.mjs'],stage)
            run(['node','tests/run-dsh.mjs'],stage)
        for platform in targets:
            profile=platforms[platform]['resourceProfile'] if args.platform else args.profile
            row={'edition':edition,'platform':platform,'version':spec['version'],'stage':str(stage),'profile':profile,
                 'sourceRepository':str(ROOT),'newPixelAnimation':False,'testsRun':args.test}
            if not args.prepare_only:
                run([sys.executable,str(ROOT/'tools/build-local-distribution.py'),'--source',str(stage),
                     '--out',str(args.out.resolve()),'--track',edition,'--profile',profile,'--version',spec['version']],ROOT)
                stem=f'pi-furry-partner-{edition}-{spec["version"]}'+('-pi-core' if profile=='pi-core' else '')
                row['report']=str(args.out.resolve()/f'{stem}.report.json')
                report=read(Path(row['report']))
                row.update({k:report[k] for k in ['archive','archiveBytes','archiveSha256','allArchiveEntriesVerified']})
            build_info.append(row)
    args.out.mkdir(parents=True,exist_ok=True)
    result=args.out/('prepared-editions.json' if args.prepare_only else 'built-editions.json')
    result.write_text(json.dumps({'schemaVersion':1,'source':'single repository','builds':build_info},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'report':str(result),'editions':names},ensure_ascii=False))
if __name__=='__main__':main()
