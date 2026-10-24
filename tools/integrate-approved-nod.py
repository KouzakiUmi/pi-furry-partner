#!/usr/bin/env python3
"""Add the exact user-approved nod, preserving all existing19 image/QA payloads.

python tools/integrate-approved-nod.py --apply
Prepares and verifies a new candidate under work before publishing catalog last.
This changes repository assets only; never builds, installs, tags or publishes.
"""
import argparse, ast, copy, gzip, hashlib, json, shutil
from pathlib import Path
import importlib.util

ROOT=Path(__file__).resolve().parents[1]
def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
stage=load(ROOT/'tools/stage-motion-polish.py','nod_stage_helpers')
read,write,sha,file_sha,canonical=stage.read,stage.write,stage.sha,stage.file_sha,stage.canonical
ASSETS=ROOT/'assets/animated'
JOB=ROOT/'Hi-Res/sources/h3-motion-polish-20261023/nod/key-purple-pilot-v1'
PROCESSED=JOB/'processed-detail-v1'
PROVENANCE='provenance/auxiliary/nod-v1'
BASE_IDS=set('idle think listen wait rest work watch search joy grumpy sad cry shy flustered surprise proud affection work-enter work-exit'.split())

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    old=read(ASSETS/'catalog.json');assert set(old['clips'])==BASE_IDS, 'Refuse a changed baseline or duplicate nod'
    approved=read(JOB/'user-approval.json');manifest=read(PROCESSED/'manifest.json');spec=read(JOB/'spec.json')
    assert approved['status']=='USER_APPROVED_EXACT_NOD_OUTPUT_FOR_RUNTIME_INTEGRATION' and approved['userApproved'] is True
    for item in approved['files']:assert file_sha(Path(item['file']))==item['sha256'], item['file']
    assert approved['manifestSha256']==file_sha(PROCESSED/'manifest.json')
    assert manifest['source']['sha256']==approved['sourceVideoSha256']==file_sha(JOB/'Umi-nod-H3-source.mp4')
    assert len(manifest['frames'])==107 and manifest['fps']==24 and manifest['periodMs']==4458
    assert manifest['canvas']==[640,640] and manifest['pivot']==[320,608] and spec['worldPaintRect']==dict(x=0,y=0,width=640,height=640)
    for reviewer in ['A','B']:assert read(JOB/f'detail-output-review-{reviewer}.json')['readyForUserReview'] is True
    for f in manifest['frames']:assert file_sha(PROCESSED/'rgba'/f['file'])==f['sha256']
    revision='animated-auxiliary-nod-v1-'+sha(canonical({'previous':file_sha(ASSETS/'catalog.json'),'approval':file_sha(JOB/'user-approval.json'),'manifest':file_sha(PROCESSED/'manifest.json')}))[:16]
    target=ROOT/'work'/f'nod-integration-{revision.rsplit("-",1)[-1]}'
    assert not target.exists(), 'Fresh candidate required; failed/history candidates are never overwritten'
    target.mkdir(parents=True);assets=target/'assets/animated';assets.mkdir(parents=True)
    stage.PROVENANCE=PROVENANCE
    idle=stage.decode_indexed(ASSETS/old['clips']['idle']['indexed']['umi']['file'])
    choice={'selection':'approved-new','paintRect':spec['worldPaintRect'],'sourceVideoSha256':approved['sourceVideoSha256'],
        'processedManifestSha256':approved['manifestSha256'],'userApprovalSha256':file_sha(JOB/'user-approval.json')}
    plan={'choice':choice,'manifest':manifest,'old':{'family':'action','loop':False},'source':JOB/'Umi-nod-H3-source.mp4',
        'approval':JOB/'user-approval.json','processed':PROCESSED,'job':JOB,'technical':None,'baseline':{'palette':idle['palette']}}
    encoder=load(ROOT/'scripts/encode_indexed_binary.py','nod_encoder')
    indexer=load(ROOT/'scripts/export_approved_h3_actions.py','nod_indexer')
    clip,raw,proof=stage.new_clip(target,'nod',plan,revision,indexer)
    del idle
    records=proof['records'];destination=assets/PROVENANCE/'clips/nod'
    helpers=['work/motion-polish-20261023/'+x for x in ['process-nod-purple.py','apply-nod-key-edge.py','restore-nod-face-core.py','key-color-matte.py','repair-key-edge-color.py']]+['scripts/build_watch_matte.py','scripts/process_approved_h3_actions.py','scripts/export_approved_h3_actions.py','scripts/encode_indexed_binary.py','tools/stage-motion-polish.py','tools/integrate-approved-nod.py']
    for name in helpers:
        source=ROOT/name;copied=destination/'helpers'/Path(name).name;copied.parent.mkdir(exist_ok=True)
        shutil.copy2(source,copied);records['helpers/'+copied.name]={'path':copied.relative_to(target).as_posix(),'sha256':file_sha(copied)}
    outside=Path('C:/Users/Fractal/Documents/Codex/2026-10-15/x20')
    for source,name in [(JOB/'source-user-approval.json','source-user-approval.json'),(JOB/'detail-eye-proof.png','detail-eye-proof.png'),(JOB/'source-core-proof.jpg','source-core-proof.jpg'),(outside/'nod_alpha_review_server.py','review-page.py'),(outside/'nod-alpha-config.json','review-page-config.json')]:
        shutil.copy2(source,destination/name);records[name]={'path':(destination/name).relative_to(target).as_posix(),'sha256':file_sha(destination/name)}
    page_node=next(n.value for n in ast.parse((outside/'nod_alpha_review_server.py').read_text(encoding='utf8')).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PAGE' for t in n.targets))
    page=ast.literal_eval(page_node.func.value).encode('utf8');(destination/'review-page.html').write_bytes(page)
    records['review-page.html']={'path':(destination/'review-page.html').relative_to(target).as_posix(),'sha256':sha(page)}
    write(destination/'inputs.json',{'selection':choice,'records':records,'historicalPathsAreBuildDependencies':False})
    clip['qa']['inputRecord']['sha256']=file_sha(destination/'inputs.json');raw['qa']=copy.deepcopy(clip['qa'])
    baseline_catalog=assets/PROVENANCE/'baseline-catalog.json';shutil.copy2(ASSETS/'catalog.json',baseline_catalog)
    shutil.copy2(ASSETS/old['indexedBinaryProvenance']['file'],assets/PROVENANCE/'baseline-indexed-binary.json')
    catalog=copy.deepcopy(old);catalog['revision']=revision;catalog['clips']['nod']=clip
    catalog['pixelPolicy']='legacy-only';catalog['publicStyles']=['umi'];catalog['distributionRevision']='illustration-only-auxiliary-20261023'
    binaries=[];retained={}
    for action in [*old['clips'],'nod']:
        if action=='nod':data=raw;file='indexed/umi/nod.uix.gz';source_json_sha=sha(canonical(data))
        else:
            previous=stage.decode_indexed(ASSETS/old['clips'][action]['indexed']['umi']['file']);data=copy.deepcopy(previous);data['revision']=revision
            compare={**data,'revision':old['revision']};assert compare==previous
            file=old['clips'][action]['indexed']['umi']['file'];source_json_sha=old['clips'][action]['indexed']['umi']['sourceJsonSha256']
            retained[action]={'qa':copy.deepcopy(old['clips'][action]['qa']),'beforeCanonicalDecodedSha256':sha(canonical(previous)),'decodedEqualExceptTopLevelRevision':True,
                'hdFiles':{f['file']:file_sha(ASSETS/old['clips'][action]['hires']['baseUrl']/f['file']) for f in old['clips'][action]['hires']['frames']}}
        binary,payload,encoding=encoder.encode(data);packed=gzip.compress(binary,compresslevel=6,mtime=0);encoder.verify(packed,data)
        path=assets/file;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(packed);assert stage.decode_indexed(path)==data
        entry={'file':file,'sha256':sha(packed),'sourceJsonSha256':source_json_sha,'encoding':'gzip-'+encoding,'width':data['width'],'height':data['height'],'frameCount':len(data['frames'])}
        if action=='nod':catalog['clips'][action]['indexed']={'umi':entry,'illustration':{**entry,'aliasOf':'umi'}}
        else:
            for style in catalog['clips'][action]['indexed']:catalog['clips'][action]['indexed'][style].update(sha256=entry['sha256'],encoding=entry['encoding'])
        record={**entry,'encoding':encoding,'payloadSha256':payload,'indexedPreEncodingCanonicalJsonSha256':sha(canonical(data)),
            'comparisonBaseline':'newApprovedDerivativePreEncodingJson' if action=='nod' else 'priorRuntimeDecodedExceptRevision',
            'fullIndicesEqual':True,'paletteClockMetadataEqualExceptRevision':True,'gzipBytes':len(packed),'sourceBytes':len(canonical(data))}
        binaries.append(record)
        if action=='nod':proof['indexed']=record
        print(f'prepared {action}: exact indexed payload verified',flush=True)
    proof.update(fullRgbaHdVerified=True,perFrameFit=False)
    write(destination/'derivation.json',proof)
    provenance={'schemaVersion':1,'action':'nod','revision':revision,'previousRevision':old['revision'],'baselineCatalog':{'file':f'{PROVENANCE}/baseline-catalog.json','sha256':file_sha(baseline_catalog)},
        'approvedSource':choice,'newClips':['nod'],'retainedClipCount':19,'retainedClips':retained,'derivation':{'file':f'{PROVENANCE}/clips/nod/derivation.json','sha256':file_sha(destination/'derivation.json')},
        'sourceAssetPolicy':'canonical assets/animated/hires/nod/*.webp; generation work folders are historical inputs only',
        'palettePolicy':'Use unchanged approved idle indexed palette and existing indexed(pixel=False) quantizer; fixed640 world then240, fractionalalpha black composite',
        'historicalPathsAreBuildDependencies':False,'runtimeIntegrated':bool(args.apply),'runtimeInstalled':False,'publiclyReleased':False}
    write(assets/PROVENANCE/'integration.json',provenance)
    catalog['auxiliaryMotionProvenance']={'schemaVersion':1,'clips':{'nod':{'file':f'{PROVENANCE}/integration.json','sha256':file_sha(assets/PROVENANCE/'integration.json')}}}
    binary_provenance={'schemaVersion':1,'format':'UMIIDX01','compression':'gzip6','revision':revision,'previousRevision':old['revision'],
        'previousCatalogSha256':file_sha(ASSETS/'catalog.json'),'physicalFiles':20,'logicalEntries':40,'HDReencoded':False,
        'HDReencodedScope':'All existing19 HD untouched; nod direct approved WebP copies, no HD reencoding by integration',
        'paletteIndicesClockExact':True,'comparisonScope':'Existing19 decoded data identical except top-levelrevision; nod exact approved54 even-source sampling',
        'motionPolishProvenance':catalog['motionPolishProvenance'],'auxiliaryMotionProvenance':catalog['auxiliaryMotionProvenance'],'files':binaries}
    binary_file='provenance/indexed-binary-nod-v1.json';write(assets/binary_file,binary_provenance)
    catalog['indexedBinaryProvenance']={'file':binary_file,'sha256':file_sha(assets/binary_file),'previousRevision':old['revision']}
    write(assets/'catalog.json',catalog)
    assert len(catalog['clips'])==20
    if args.apply:
        assert file_sha(ASSETS/'catalog.json')==file_sha(baseline_catalog), 'Baseline changed during preparation'
        assert not (ASSETS/'hires/nod').exists() and not (ASSETS/PROVENANCE).exists() and not (ASSETS/binary_file).exists()
        shutil.copytree(assets/'hires/nod',ASSETS/'hires/nod');shutil.copytree(assets/PROVENANCE,ASSETS/PROVENANCE)
        for record in binaries:shutil.copy2(assets/record['file'],ASSETS/record['file'])
        shutil.copy2(assets/binary_file,ASSETS/binary_file)
        for action,record in retained.items():
            assert catalog['clips'][action]['qa']==record['qa']
            for name,expected in record['hdFiles'].items():assert file_sha(ASSETS/catalog['clips'][action]['hires']['baseUrl']/name)==expected
        pending=ASSETS/'catalog.nod-pending.json';shutil.copy2(assets/'catalog.json',pending);pending.replace(ASSETS/'catalog.json')
    write(target/'integration-result.json',{'appliedToRepository':args.apply,'catalogSha256':file_sha(assets/'catalog.json'),'revision':revision,'clips':20,'installed':False,'published':False})
    print(json.dumps({'candidate':str(target),'appliedToRepository':args.apply,'catalogSha256':file_sha(assets/'catalog.json'),'revision':revision,'clips':20}))

if __name__=='__main__':main()
