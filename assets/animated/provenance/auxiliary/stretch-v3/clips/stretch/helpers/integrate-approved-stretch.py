#!/usr/bin/env python3
"""Add the exact user-approved stretch, preserving all existing23 image/QA payloads.

python tools/integrate-approved-stretch.py --apply
Prepares and verifies a new candidate under work before publishing catalog last.
This changes repository assets only; never builds, installs, tags or publishes.
"""
import argparse, ast, copy, gzip, hashlib, json, shutil
from pathlib import Path
import importlib.util

ROOT=Path(__file__).resolve().parents[1]
def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
stage=load(ROOT/'tools/stage-motion-polish.py','stretch_stage_helpers')
read,write,sha,file_sha,canonical=stage.read,stage.write,stage.sha,stage.file_sha,stage.canonical
ASSETS=ROOT/'assets/animated'
JOB=ROOT/'Hi-Res/sources/h3-motion-polish-20261023/stretch/key-purple-pilot-v3'
PROCESSED=JOB/'processed-detail-v1'
PROVENANCE='provenance/auxiliary/stretch-v3'
BASE_IDS=set('idle think listen wait rest work watch search joy grumpy sad cry shy flustered surprise proud affection work-enter work-exit nod idle-center idle-right wave'.split())

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    old=read(ASSETS/'catalog.json');assert set(old['clips'])==BASE_IDS, 'Refuse a changed baseline or duplicate stretch'
    approved=read(JOB/'user-approval.json');manifest=read(PROCESSED/'manifest.json');spec=read(JOB/'spec.json')
    assert approved['status']=='USER_APPROVED_EXACT_STRETCH_OUTPUT_FOR_RUNTIME_INTEGRATION' and approved['userApproved'] is True
    for item in approved['files']:assert file_sha(Path(item['file']))==item['sha256'], item['file']
    assert approved['manifestSha256']==file_sha(PROCESSED/'manifest.json')
    assert manifest['source']['sha256']==approved['sourceVideoSha256']==file_sha(JOB/'Umi-stretch-H3-source.mp4')
    assert len(manifest['frames'])==107 and manifest['fps']==24 and manifest['periodMs']==4458
    assert manifest['canvas']==[896,896] and manifest['pivot']==[448,736] and spec['worldPaintRect']==dict(x=-128,y=-128,width=896,height=896)
    for reviewer in ['A','B']:assert read(JOB/f'detail-output-review-{reviewer}.json')['readyForUserReview'] is True
    for f in manifest['frames']:assert file_sha(PROCESSED/'rgba'/f['file'])==f['sha256']
    revision='animated-auxiliary-stretch-v3-'+sha(canonical({'previous':file_sha(ASSETS/'catalog.json'),'approval':file_sha(JOB/'user-approval.json'),'manifest':file_sha(PROCESSED/'manifest.json')}))[:16]
    target=ROOT/'work'/f'stretch-integration-{revision.rsplit("-",1)[-1]}'
    assert not target.exists(), 'Fresh candidate required; failed/history candidates are never overwritten'
    target.mkdir(parents=True);assets=target/'assets/animated';assets.mkdir(parents=True)
    stage.PROVENANCE=PROVENANCE
    idle=stage.decode_indexed(ASSETS/old['clips']['idle']['indexed']['umi']['file'])
    choice={'selection':'approved-new','paintRect':spec['worldPaintRect'],'sourceVideoSha256':approved['sourceVideoSha256'],
        'processedManifestSha256':approved['manifestSha256'],'userApprovalSha256':file_sha(JOB/'user-approval.json')}
    plan={'choice':choice,'manifest':manifest,'old':{'family':'action','loop':False},'source':JOB/'Umi-stretch-H3-source.mp4',
        'approval':JOB/'user-approval.json','processed':PROCESSED,'job':JOB,'technical':None,'baseline':{'palette':idle['palette']}}
    encoder=load(ROOT/'scripts/encode_indexed_binary.py','stretch_encoder')
    indexer=load(ROOT/'scripts/export_approved_h3_actions.py','stretch_indexer')
    # Preserve every source pixel outside640world and the old.375px/world density.
    # new_clip's normal640world sampler is intentionally bypassed only here.
    import types
    def full_source(image,rect):
        assert image.size==(896,896) and rect==dict(x=-128,y=-128,width=896,height=896)
        return image
    stage.world_frame=full_source
    full_indexer=types.SimpleNamespace(indexed=lambda image,palette,width,pixel=False:indexer.indexed(image,palette,336,pixel=False))
    clip,raw,proof=stage.new_clip(target,'stretch',plan,revision,full_indexer)
    raw['width']=raw['height']=336
    raw['viewport']={'worldRect':[-128,-128,896,896],'sourceScale':1,'worldAnchor':[320,608],'bitmapPivot':[448,736],
        'policy':'Full896 source at original.375px/world then336; no640world crop, no frame fitting. Runtime must retain full registered viewport.'}
    proof['indexedCanvas']=[336,336];proof['indexedViewport']=raw['viewport']
    proof['samplingPolicy']='Native24fps even0,2,...106, sourceatMs unchanged,4458ms period; full896 to336 fractionalalpha black composite. No640world crop, no retime.'
    proof['integrationConstraints']={'keepFull896PaintRect':True,'forbidWorld640Cropping':True,'requiresRealPiDshExtremaAndStableScaleTests':True}

    del idle
    records=proof['records'];destination=assets/PROVENANCE/'clips/stretch'
    helpers=['work/motion-polish-20261023/'+x for x in ['process-stretch-v3-purple.py','apply-stretch-v3-key-edge.py','restore-stretch-v3-face-core.py','check-stretch-v3-detail.py','key-color-matte.py','repair-key-edge-color.py']]+['scripts/build_watch_matte.py','scripts/process_approved_h3_actions.py','scripts/export_approved_h3_actions.py','scripts/encode_indexed_binary.py','tools/stage-motion-polish.py','tools/integrate-approved-stretch.py']
    for name in helpers:
        source=ROOT/name;copied=destination/'helpers'/Path(name).name;copied.parent.mkdir(exist_ok=True)
        shutil.copy2(source,copied);records['helpers/'+copied.name]={'path':copied.relative_to(target).as_posix(),'sha256':file_sha(copied)}
    outside=Path('C:/Users/Fractal/Documents/Codex/2026-10-15/x20')
    extras=[(JOB/name,name) for name in ['detail-eye-proof.png','source-core-proof.jpg','middle-keypose-purple.png','middle-keypose-rgba.png']]
    extras += [(outside/name,name) for name in ['peek_stretch_v2_review_server.py','peek-stretch-v2-review-config.json','peek-stretch-v2-final-review-evidence.json','prepare_peek_stretch_v2_page.py','peek-stretch-v2-page-script.js']]
    rendered=ROOT/'work/motion-polish-20261023/auxiliary-v2-review-world/stretch'
    extras.append((rendered/'manifest.json','review-world-manifest.json'))
    for bg in ['black','gray','white']:extras.append((rendered/f'world-{bg}.mp4',f'review-world-{bg}.mp4'))
    for source,name in extras:
        shutil.copy2(source,destination/name);records[name]={'path':(destination/name).relative_to(target).as_posix(),'sha256':file_sha(destination/name)}
    write(destination/'inputs.json',{'selection':choice,'records':records,'historicalPathsAreBuildDependencies':False})
    clip['qa']['inputRecord']['sha256']=file_sha(destination/'inputs.json');raw['qa']=copy.deepcopy(clip['qa'])
    baseline_catalog=assets/PROVENANCE/'baseline-catalog.json';shutil.copy2(ASSETS/'catalog.json',baseline_catalog)
    shutil.copy2(ASSETS/old['indexedBinaryProvenance']['file'],assets/PROVENANCE/'baseline-indexed-binary.json')
    catalog=copy.deepcopy(old);catalog['revision']=revision;catalog['clips']['stretch']=clip
    catalog['pixelPolicy']='legacy-only';catalog['publicStyles']=['umi'];catalog['distributionRevision']='illustration-only-auxiliary-20261023'
    binaries=[];retained={}
    for action in [*old['clips'],'stretch']:
        if action=='stretch':data=raw;file='indexed/umi/stretch.uix.gz';source_json_sha=sha(canonical(data))
        else:
            previous=stage.decode_indexed(ASSETS/old['clips'][action]['indexed']['umi']['file']);data=copy.deepcopy(previous);data['revision']=revision
            compare={**data,'revision':old['revision']};assert compare==previous
            file=old['clips'][action]['indexed']['umi']['file'];source_json_sha=old['clips'][action]['indexed']['umi']['sourceJsonSha256']
            retained[action]={'qa':copy.deepcopy(old['clips'][action]['qa']),'beforeCanonicalDecodedSha256':sha(canonical(previous)),'decodedEqualExceptTopLevelRevision':True,
                'hdFiles':{f['file']:file_sha(ASSETS/old['clips'][action]['hires']['baseUrl']/f['file']) for f in old['clips'][action]['hires']['frames']}}
        binary,payload,encoding=encoder.encode(data);packed=gzip.compress(binary,compresslevel=6,mtime=0);encoder.verify(packed,data)
        path=assets/file;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(packed);assert stage.decode_indexed(path)==data
        entry={'file':file,'sha256':sha(packed),'sourceJsonSha256':source_json_sha,'encoding':'gzip-'+encoding,'width':data['width'],'height':data['height'],'frameCount':len(data['frames'])}
        if action=='stretch':catalog['clips'][action]['indexed']={'umi':entry,'illustration':{**entry,'aliasOf':'umi'}}
        else:
            for style in catalog['clips'][action]['indexed']:catalog['clips'][action]['indexed'][style].update(sha256=entry['sha256'],encoding=entry['encoding'])
        record={**entry,'encoding':encoding,'payloadSha256':payload,'indexedPreEncodingCanonicalJsonSha256':sha(canonical(data)),
            'comparisonBaseline':'newApprovedDerivativePreEncodingJson' if action=='stretch' else 'priorRuntimeDecodedExceptRevision',
            'fullIndicesEqual':True,'paletteClockMetadataEqualExceptRevision':True,'gzipBytes':len(packed),'sourceBytes':len(canonical(data))}
        binaries.append(record)
        if action=='stretch':proof['indexed']=record
        print(f'prepared {action}: exact indexed payload verified',flush=True)
    proof.update(fullRgbaHdVerified=True,perFrameFit=False)
    write(destination/'derivation.json',proof)
    provenance={'schemaVersion':1,'action':'stretch','revision':revision,'previousRevision':old['revision'],'baselineCatalog':{'file':f'{PROVENANCE}/baseline-catalog.json','sha256':file_sha(baseline_catalog)},
        'approvedSource':choice,'newClips':['stretch'],'retainedClipCount':23,'retainedClips':retained,'indexedFullSourceViewport':raw['viewport'],'integrationConstraints':proof['integrationConstraints'],'derivation':{'file':f'{PROVENANCE}/clips/stretch/derivation.json','sha256':file_sha(destination/'derivation.json')},
        'sourceAssetPolicy':'canonical assets/animated/hires/stretch/*.webp; generation work folders are historical inputs only',
        'palettePolicy':'Use unchanged approved idle indexed palette and existing indexed(pixel=False) quantizer; full896 source then336 at original.375px/world, fractionalalpha black composite; no640world crop',
        'historicalPathsAreBuildDependencies':False,'runtimeIntegrated':bool(args.apply),'runtimeInstalled':False,'publiclyReleased':False}
    write(assets/PROVENANCE/'integration.json',provenance)
    catalog['auxiliaryMotionProvenance']=copy.deepcopy(old['auxiliaryMotionProvenance']);catalog['auxiliaryMotionProvenance']['clips']['stretch']={'file':f'{PROVENANCE}/integration.json','sha256':file_sha(assets/PROVENANCE/'integration.json')}
    binary_provenance={'schemaVersion':1,'format':'UMIIDX01','compression':'gzip6','revision':revision,'previousRevision':old['revision'],
        'previousCatalogSha256':file_sha(ASSETS/'catalog.json'),'physicalFiles':24,'logicalEntries':48,'HDReencoded':False,
        'HDReencodedScope':'All existing23 HD untouched; stretch direct approved WebP copies, no HD reencoding by integration',
        'paletteIndicesClockExact':True,'comparisonScope':'Existing23 decoded data identical except top-levelrevision; stretch exact approved54 even-source sampling',
        'motionPolishProvenance':catalog['motionPolishProvenance'],'auxiliaryMotionProvenance':catalog['auxiliaryMotionProvenance'],'files':binaries}
    binary_file='provenance/indexed-binary-stretch-v3.json';write(assets/binary_file,binary_provenance)
    catalog['indexedBinaryProvenance']={'file':binary_file,'sha256':file_sha(assets/binary_file),'previousRevision':old['revision']}
    write(assets/'catalog.json',catalog)
    assert len(catalog['clips'])==24
    if args.apply:
        assert file_sha(ASSETS/'catalog.json')==file_sha(baseline_catalog), 'Baseline changed during preparation'
        assert not (ASSETS/'hires/stretch').exists() and not (ASSETS/PROVENANCE).exists() and not (ASSETS/binary_file).exists()
        shutil.copytree(assets/'hires/stretch',ASSETS/'hires/stretch');shutil.copytree(assets/PROVENANCE,ASSETS/PROVENANCE)
        for record in binaries:shutil.copy2(assets/record['file'],ASSETS/record['file'])
        shutil.copy2(assets/binary_file,ASSETS/binary_file)
        for action,record in retained.items():
            assert catalog['clips'][action]['qa']==record['qa']
            for name,expected in record['hdFiles'].items():assert file_sha(ASSETS/catalog['clips'][action]['hires']['baseUrl']/name)==expected
        pending=ASSETS/'catalog.stretch-pending.json';shutil.copy2(assets/'catalog.json',pending);pending.replace(ASSETS/'catalog.json')
    write(target/'integration-result.json',{'appliedToRepository':args.apply,'catalogSha256':file_sha(assets/'catalog.json'),'revision':revision,'clips':24,'installed':False,'published':False})
    print(json.dumps({'candidate':str(target),'appliedToRepository':args.apply,'catalogSha256':file_sha(assets/'catalog.json'),'revision':revision,'clips':24}))

if __name__=='__main__':main()
