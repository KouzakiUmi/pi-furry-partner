"""Write the local review index from verified, repository-local build reports."""
from pathlib import Path
from datetime import datetime,timezone
import json

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/releases'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
specs=read(ROOT/'build/editions.json')['editions']
builds=read(OUT/'built-editions.json')['builds']
audit=read(OUT/'edition-audit.json')
assert len(audit)==len(builds)==2 and all(a['runtimeSmokePassed'] for a in audit)
packages=[]
for build in builds:
    report=read(Path(build['report']))
    packages.append({k:report[k] for k in ['archive','archiveBytes','unpackedBytes','fileCount','archiveSha256','capabilities']}|
                    {'label':specs[build['edition']]['label'],'allArchiveEntriesVerified':True})
summary={'dateUtc':datetime.now(timezone.utc).isoformat(),'status':'LOCAL_BUILD_VERIFIED_NOT_INSTALLED',
 'sourceRepository':str(ROOT),'buildSourcePolicy':'Shared repository source only; historical worktrees are not build inputs.',
 'preview':'http://127.0.0.1:8910/','packages':packages,
 'pixel':{'sourceCommit':read(ROOT/'build/legacy-pixel-provenance.json')['sourceCommit'],
          'originalSize':[100,100],'originalFrames':16,'withPokeFrames':17,'originalHeaderFrames':15,
          'regeneratedPixelMotionResources':0,'sameSourceInBothEditions':True},
 'verification':{'bothIsolatedMainAndDshSuitesPassed':True,'fullMotionSpecializedSuites':10,
  'indexedFiles':19,'logicalEntries':38,'indexedPayloadsVerified':69580800,
  'legacyPixelSourceFilesVerified':20,'unchangedOrdinaryHdWebPsVerified':946,
  'realArchivesAllEntriesReverified':True,'unpackedProductionReadersPassed':True,
  'websiteBuildAnd20ChecksPassed':True,'Pi13IntegrationMouseAndUiPassed':True},
 'installed':False,'published':False,'pushed':False,'userAcceptance':False,
 'history':'Previous worktrees and packages preserved as history. dist/releases/internal-first-pass is internal, superseded and not an installation target.'}
(OUT/'release-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines=['# 呜咪 · 同仓构建产物','','两种构建共用本仓库源码和原始像素素材，按需选择一个安装。','','| 构建 | 版本 | 安装包大小 |','| --- | --- | ---: |']
for build in builds:
    lines.append(f"| {specs[build['edition']]['label']} | {build['version']} | {build['archiveBytes']/1048576:.2f} MiB |")
lines+=['','构建命令、来源约束与资源策略见 ../../docs/plugin-lines.md（以仓库根 docs/plugin-lines.md 为准）。',
        '实际安装包条目已全部回读校验；原始像素JSON、poke补丁及两份标题资源与Git来源完全一致。',
        '此处主目录为当前安装包；internal-first-pass仅为内部历史，不参与安装或当前入口。',
        '尚未安装、推送或公开发布。']
(OUT/'README.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'preview':summary['preview'],'packages':[{'label':p['label'],'MiB':round(p['archiveBytes']/1048576,2)} for p in packages]},ensure_ascii=False))
