#!/usr/bin/env python3
"""Integrate only the three exact approved auxiliary outputs; publish catalog last.
python tools/integrate-approved-idle-wave.py --apply
Never installs/builds/publishes. Frozen prior provenance is retained.
"""
import argparse,ast,copy,gzip,hashlib,importlib.util,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(p,n):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
stage=load(ROOT/'tools/stage-motion-polish.py','idle_wave_stage')
read,write,sha,file_sha,canonical=stage.read,stage.write,stage.sha,stage.file_sha,stage.canonical
ASSETS=ROOT/'assets/animated';WORK=ROOT/'work/motion-polish-20261023'
OUTSIDE=Path('C:/Users/Fractal/Documents/Codex/2026-10-15/x20')
PROVENANCE='provenance/auxiliary/idle-wave-v1'
ENTRIES={
 'idle-center':('idle/key-purple-center-v1','processed-detail-v1','detail-output-review','state',True),
 'idle-right':('idle/key-purple-right-v1','processed-detail-v1','detail-output-review','state',True),
 'wave':('wave/key-purple-pilot-v2','processed-edge-v2','output-review','action',False)}

def approval(action,job,variant,review):
 processed=job/variant;m=read(processed/'manifest.json');source=job/Path(m['source']['file']).name
 files=[source,job/'reference.png',job/'registered-reference.png',job/'prompt.txt',job/'spec.json',job/'motion-contract.json',processed/'manifest.json']
 files += [job/f'{review}-{r}.json' for r in ['A','B']]
 for name in ['source-review-A.json','source-review-B.json','source-core-review-A.json','source-core-review-B.json','source-core-preflight.json','source-core-proof.jpg','detail-eye-proof.png','detail-technical-review.json','edge-technical-review.json']:
  if (job/name).is_file():files.append(job/name)
 helpers=['key-color-matte.py','repair-key-edge-color.py']+(['process-wave-v2-purple.py','apply-wave-v2-key-edge.py','check-wave-v2-output.py'] if action=='wave' else ['process-idle-variant-purple.py','apply-idle-variant-key-edge.py','restore-idle-variant-face-core.py','check-idle-variant-detail.py'])
 files += [WORK/name for name in helpers]
 files += [OUTSIDE/name for name in ['auxiliary_review_server.py','auxiliary-review-config.json','auxiliary-review-evidence.json']]
 files += [processed/f'world-{b}.mp4' for b in ['black','gray','white']]
 for r in ['A','B']:assert read(job/f'{review}-{r}.json')['readyForUserReview'] is True
 assert len(m['frames'])==107 and m['fps']==24 and m['periodMs']==4458 and m['canvas']==[640,640] and m['pivot']==[320,608]
 assert file_sha(source)==m['source']['sha256']
 for f in m['frames']:assert file_sha(processed/'rgba'/f['file'])==f['sha256']
 evidence=read(OUTSIDE/'auxiliary-review-evidence.json');assert evidence['items'][action]['manifestSha256']==file_sha(processed/'manifest.json')
 records=[{'file':str(p),'sha256':file_sha(p)} for p in files]
 result={'schemaVersion':1,'status':'USER_APPROVED_EXACT_OUTPUT_FOR_RUNTIME_INTEGRATION','userApproved':True,'humanAccepted':True,
  'recordedDate':'2026-10-23','action':action,'authorization':'Human approval relayed by root: 两条新待机都可用，接入随机轮换；挥爪可以，接入并继续下一批。',
  'scope':'This exact source performance, original timing/amplitude/loop and displayed transparent edges; idle-center/right join approved full-cycle nonrepeating randomized idle playlist; wave becomes real auxiliary action. No future outputs approved.',
  'knownLimitations':['Fine dark-purple soft contour/fur-tip/bottom grains remain disclosed.','Right idle uses visible three-quarter turn; wave includes mid-clip open small smile/short fang.'],
  'processedVariant':variant,'manifestSha256':file_sha(processed/'manifest.json'),'sourceVideoSha256':file_sha(source),
  'referenceSha256':file_sha(job/'reference.png'),'promptSha256':file_sha(job/'prompt.txt'),'contractSha256':file_sha(job/'motion-contract.json'),
  'reviewASha256':file_sha(job/f'{review}-A.json'),'reviewBSha256':file_sha(job/f'{review}-B.json'),
  'reviewUrl':evidence['url'],'servedPageSha256':evidence['servedPageSha256'],'runtimeInstalled':False,'publiclyReleased':False,'files':records}
 path=job/'user-approval.json'
 if path.exists():assert read(path)==result,'Refuse to overwrite an existing approval'
 else:write(path,result)
 return path,source,helpers

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--apply',action='store_true');args=p.parse_args()
 old=read(ASSETS/'catalog.json');assert len(old['clips'])==20 and 'nod' in old['clips'] and not (set(ENTRIES)&set(old['clips']))
 baseline_hash=file_sha(ASSETS/'catalog.json');plans={}
 palette=stage.decode_indexed(ASSETS/old['clips']['idle']['indexed']['umi']['file'])['palette']
 for action,(relative,variant,review,family,loop) in ENTRIES.items():
  job=ROOT/'Hi-Res/sources/h3-motion-polish-20261023'/relative;approved,source,helpers=approval(action,job,variant,review);processed=job/variant
  choice={'selection':'approved-new','paintRect':dict(x=0,y=0,width=640,height=640),'sourceVideoSha256':file_sha(source),'processedManifestSha256':file_sha(processed/'manifest.json'),'userApprovalSha256':file_sha(approved)}
  plans[action]={'choice':choice,'manifest':read(processed/'manifest.json'),'old':{'family':family,'loop':loop},'source':source,'approval':approved,'processed':processed,'job':job,'technical':None,'baseline':{'palette':palette},'helpers':helpers}
 revision='animated-idle-wave-v1-'+sha(canonical({'baseline':baseline_hash,'approvals':{a:p['choice'] for a,p in plans.items()}}))[:16]
 target=ROOT/'work'/('idle-wave-integration-'+revision.rsplit('-',1)[-1]);assert not target.exists(),'Fresh candidate only';target.mkdir(parents=True)
 assets=target/'assets/animated';assets.mkdir(parents=True);stage.PROVENANCE=PROVENANCE
 encoder=load(ROOT/'scripts/encode_indexed_binary.py','idle_wave_encoder');indexer=load(ROOT/'scripts/export_approved_h3_actions.py','idle_wave_indexer')
 catalog=copy.deepcopy(old);catalog['revision']=revision;catalog['idleVariants']=['idle','idle-center','idle-right']
 prepared={};proofs={}
 for action,plan in plans.items():
  clip,raw,proof=stage.new_clip(target,action,plan,revision,indexer);dest=assets/PROVENANCE/'clips'/action;records=proof['records']
  extra=[(WORK/name,'helpers/'+name) for name in plan['helpers']]
  extra += [(ROOT/name,'helpers/'+Path(name).name) for name in ['tools/stage-motion-polish.py','tools/integrate-approved-idle-wave.py','scripts/build_watch_matte.py','scripts/process_approved_h3_actions.py','scripts/export_approved_h3_actions.py','scripts/encode_indexed_binary.py']]
  extra += [(OUTSIDE/name,name) for name in ['auxiliary_review_server.py','auxiliary-review-config.json','auxiliary-review-evidence.json']]
  for name in ['source-core-proof.jpg','detail-eye-proof.png','middle-paw-purple.png']:
   if (plan['job']/name).is_file():extra.append((plan['job']/name,name))
  for source,name in extra:
   output=dest/name;output.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,output);records[name]={'path':output.relative_to(target).as_posix(),'sha256':file_sha(output)}
  write(dest/'inputs.json',{'selection':plan['choice'],'records':records,'historicalPathsAreBuildDependencies':False})
  clip['qa']['inputRecord']['sha256']=file_sha(dest/'inputs.json');raw['qa']=copy.deepcopy(clip['qa'])
  catalog['clips'][action]=clip;prepared[action]=raw;proofs[action]=proof
  print('Prepared exact107HD/54indexed '+action,flush=True)
 baseline=assets/PROVENANCE/'baseline-catalog.json';shutil.copy2(ASSETS/'catalog.json',baseline)
 shutil.copy2(ASSETS/old['indexedBinaryProvenance']['file'],assets/PROVENANCE/'baseline-indexed-binary.json')
 binaries=[];retained={}
 for action,clip in catalog['clips'].items():
  if action in prepared:data=prepared[action];file=f'indexed/umi/{action}.uix.gz';source_json_sha=sha(canonical(data))
  else:
   previous=stage.decode_indexed(ASSETS/old['clips'][action]['indexed']['umi']['file']);data=copy.deepcopy(previous);data['revision']=revision
   assert {**data,'revision':old['revision']}==previous
   file=old['clips'][action]['indexed']['umi']['file'];source_json_sha=old['clips'][action]['indexed']['umi']['sourceJsonSha256']
   retained[action]={'qa':copy.deepcopy(old['clips'][action]['qa']),'beforeCanonicalDecodedSha256':sha(canonical(previous)),'decodedEqualExceptTopLevelRevision':True,'hdFiles':{f['file']:file_sha(ASSETS/clip['hires']['baseUrl']/f['file']) for f in clip['hires']['frames']}}
  binary,payload,encoding=encoder.encode(data);packed=gzip.compress(binary,compresslevel=6,mtime=0);encoder.verify(packed,data)
  path=assets/file;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(packed);assert stage.decode_indexed(path)==data
  entry={'file':file,'sha256':sha(packed),'sourceJsonSha256':source_json_sha,'encoding':'gzip-'+encoding,'width':data['width'],'height':data['height'],'frameCount':len(data['frames'])}
  if action in prepared:clip['indexed']={'umi':entry,'illustration':{**entry,'aliasOf':'umi'}}
  else:
   for style in clip['indexed']:clip['indexed'][style].update(sha256=entry['sha256'],encoding=entry['encoding'])
  record={**entry,'encoding':encoding,'payloadSha256':payload,'indexedPreEncodingCanonicalJsonSha256':sha(canonical(data)),'comparisonBaseline':'newApprovedDerivativePreEncodingJson' if action in prepared else 'priorRuntimeDecodedExceptRevision','fullIndicesEqual':True,'paletteClockMetadataEqualExceptRevision':True,'gzipBytes':len(packed),'sourceBytes':len(canonical(data))}
  binaries.append(record)
  if action in prepared:proofs[action]['indexed']=record
  print('Verified binary '+action,flush=True)
 refs=copy.deepcopy(old['auxiliaryMotionProvenance'])
 for action,proof in proofs.items():
  proof.update(fullRgbaHdVerified=True,perFrameFit=False);dest=assets/PROVENANCE/'clips'/action;write(dest/'derivation.json',proof)
  refs['clips'][action]={'file':f'{PROVENANCE}/integration.json','sha256':None}
 integration={'schemaVersion':1,'revision':revision,'previousRevision':old['revision'],'baselineCatalog':{'file':f'{PROVENANCE}/baseline-catalog.json','sha256':file_sha(baseline)},'newClips':list(ENTRIES),'retainedClipCount':20,'retainedClips':retained,
  'derivations':{a:{'file':f'{PROVENANCE}/clips/{a}/derivation.json','sha256':file_sha(assets/PROVENANCE/'clips'/a/'derivation.json')} for a in ENTRIES},
  'idleVariants':catalog['idleVariants'],'approvedSources':{a:p['choice'] for a,p in plans.items()},'historicalPathsAreBuildDependencies':False,
  'palettePolicy':'Unchanged approved idle palette; fixed640world then240 same pixel=False quantizer/fractionalalpha black composite;54 native even0..106 sourceatMs unchanged.',
  'sourceAssetPolicy':'Canonical assets/animated/hires/<clip>/*.webp; historical generation source/ref media are provenance only.',
  'runtimeIntegrated':bool(args.apply),'runtimeInstalled':False,'publiclyReleased':False}
 write(assets/PROVENANCE/'integration.json',integration)
 for a in ENTRIES:refs['clips'][a]['sha256']=file_sha(assets/PROVENANCE/'integration.json')
 catalog['auxiliaryMotionProvenance']=refs
 bp={'schemaVersion':1,'format':'UMIIDX01','compression':'gzip6','revision':revision,'previousRevision':old['revision'],'previousCatalogSha256':baseline_hash,'physicalFiles':23,'logicalEntries':46,'HDReencoded':False,'HDReencodedScope':'Existing20 unchanged; new3 exact approved losslessWebP direct copy','paletteIndicesClockExact':True,'comparisonScope':'Existing20 full decoded data identical except top-levelrevision;new3 exact54 even-source sampling','motionPolishProvenance':catalog['motionPolishProvenance'],'auxiliaryMotionProvenance':refs,'files':binaries}
 binary_file='provenance/indexed-binary-idle-wave-v1.json';write(assets/binary_file,bp);catalog['indexedBinaryProvenance']={'file':binary_file,'sha256':file_sha(assets/binary_file),'previousRevision':old['revision']}
 write(assets/'catalog.json',catalog);assert len(catalog['clips'])==23
 if args.apply:
  assert file_sha(ASSETS/'catalog.json')==baseline_hash,'Baseline changed during preparation'
  for a in ENTRIES:assert not (ASSETS/'hires'/a).exists() and not (ASSETS/'indexed/umi'/f'{a}.uix.gz').exists()
  assert not (ASSETS/PROVENANCE).exists() and not (ASSETS/binary_file).exists()
  for a in ENTRIES:shutil.copytree(assets/'hires'/a,ASSETS/'hires'/a)
  shutil.copytree(assets/PROVENANCE,ASSETS/PROVENANCE)
  for item in binaries:shutil.copy2(assets/item['file'],ASSETS/item['file'])
  shutil.copy2(assets/binary_file,ASSETS/binary_file)
  for a,record in retained.items():
   assert catalog['clips'][a]['qa']==record['qa']
   for name,expected in record['hdFiles'].items():assert file_sha(ASSETS/catalog['clips'][a]['hires']['baseUrl']/name)==expected
  pending=ASSETS/'catalog.idle-wave-pending.json';shutil.copy2(assets/'catalog.json',pending);pending.replace(ASSETS/'catalog.json')
 write(target/'integration-result.json',{'appliedToRepository':args.apply,'revision':revision,'catalogSha256':file_sha(assets/'catalog.json'),'clips':23,'newClips':list(ENTRIES),'installed':False,'published':False})
 print(json.dumps({'candidate':str(target),'revision':revision,'catalogSha256':file_sha(assets/'catalog.json'),'applied':args.apply}))
if __name__=='__main__':main()
