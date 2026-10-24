import json
import re
from pathlib import Path
from datetime import datetime, timezone

repo = Path(r'D:\Software Projects\pi-furry-partner')
release = repo / 'work/plugin-complete-20261022'
ordinary = Path(r'D:\Software Projects\pi-furry-partner-regular')
animated = repo / 'work/animated-remake-20261021'
read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
imports = lambda path: len(re.findall(r'^await import\(', path.read_text(encoding='utf-8'), re.M))
packages = []
for name, label in [
    ('pi-furry-partner-hd-remaster-2.4.2.report.json', '原逻辑高清重制版 · Pi／DSH完整包'),
    ('pi-furry-partner-full-animation-2.5.0-preview.4.report.json', '全动态重做版 · Pi／DSH完整高清包'),
    ('pi-furry-partner-full-animation-2.5.0-preview.4-pi-core.report.json', '全动态重做版 · Pi终端精简包'),
]:
    report = read(release / name)
    assert report['allArchiveEntriesVerified']
    packages.append({key: report[key] for key in ['archive','archiveBytes','unpackedBytes','fileCount','archiveSha256','capabilities']} | {'label':label,'allArchiveEntriesVerified':True})
summary = {
    'status':'BUILD_COMPLETE_AWAITING_REAL_HOST_INSTALLATION_ACCEPTANCE',
    'dateUtc':datetime.now(timezone.utc).isoformat(),
    'preview':'http://127.0.0.1:8901/',
    'scope':'Two separate plugin product lines; character-impression film paused; no image/video generation in this completion work.',
    'packages':packages,
    'tracks':{
        'ordinary':{'source':str(ordinary),'version':'2.4.2','mainSuiteImports':imports(ordinary/'tests/run.mjs'),'dshSuiteImports':imports(ordinary/'tests/run-dsh.mjs'),
                    'reportedPassedBy':'/root/ear_seam_diagnosis','commandsPassed':['build:dsh','Pi1.2 full main tests','DSH full tests','Pi1.3 actual integration','Pi1.3 UI localization'],
                    'artworkChangedInCompletion':False},
        'animated':{'source':str(animated),'version':'2.5.0-preview.4','mainSuiteImports':imports(animated/'tests/run.mjs'),'dshSuiteImports':imports(animated/'tests/run-dsh.mjs'),
                    'commandsPassed':['build:dsh','Pi1.2 full main tests','DSH full tests','Pi1.3 actual integration','Pi1.3 native mouse routing'],
                    'logs':[str(animated/'work/final-20261022-main-tests.log'),str(animated/'work/final-20261022-dsh-tests.log'),str(animated/'work/final-20261022-pi13-integration.log'),str(animated/'work/final-20261022-pi13-mouse.log')],
                    'catalogRevision':read(animated/'assets/animated/catalog.json')['revision'],'clipCount':19,'hdReencodedInCompletion':False},
    },
    'optimization':{
        'indexedBeforeBytes':238331400,'indexedAfterBytes':27285922,'indexedBytesSaved':211045478,'exactIndicesVerified':89392000,
        'hdPixelsAndEncodingUnchanged':True,'decodedMotionBitmapBudgetBytes':48*1024*1024,
        'budgetScope':'Resident approved-motion bitmap pixel estimates only; excludes in-flight/browser/GPU and ordinary fallback resources.',
        'legacyHdStartupPreloadBefore':40,'legacyHdStartupPreloadAfter':3,
        'releaseOn':['pause','pixel style','hidden document','disabled','dispose'],
        'packageComparison':read(release/'animated-package-comparison.json'),
    },
    'actualBrowserChecks':{
        'environment':'Local IAB browser using real built client and Host readers; not installed DSH.',
        'binaryCatalogLoaded':'animated-indexed-binary-v1-37c4d44b0ef59da3',
        'binaryHttpStatus':200,'binaryHttpType':'application/gzip','binaryHttpContentEncodingAbsent':True,
        'illustrationAndPixelPlayback':True,'keyboardEntryObservedAtMs':163,'displayScaleObserved':1,
        'pausedOrPixelHdFramesBytesDownloadsObserved':[0,0,0],
        'ordinaryObserved':'Current remastered idle-open portrait, display scale1, no approved full-motion catalog',
    },
    'packagedRuntimeSmoke':{'source':'Actual unpacked Pi-core archive','all76AnimatedEntriesDecoded':True,'sixStyleAliasesResolved':True,'header15Frames4800ms':True,'sharedRuntimeAndIndexedFilesMatchFullArchive':True},
    'independentHdLifecycleReview':{'reviewer':'/root/ear_spatial_diagnosis','scope':'Static code review only; current-frame protection, late bitmap close, 48MiB eviction, three-pose lazy preload, keyboard prefetch','newBlockers':False},
    'installed':False,'published':False,'pushed':False,'userAcceptance':False,
    'installationPolicy':'User previously chose 暂时只保留安装包; no live installation/configuration modified.',
    'hostAcceptanceRemaining':'Install one product line in actual DSH/Pi and visually verify native positioning and live-session behavior when the user requests installation.',
}
(release/'release-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines = ['# 呜咪插件 · 本地完整构建', '', '两条产品线分别保留插画／像素两种画风。安装时选择一条产品线；两者使用同一个插件名，后安装者会替换前者。', '', '| 构建 | 压缩包 | 解包体积 |', '| --- | ---: | ---: |']
for package in packages:
    lines.append(f"| {package['label']} | {package['archiveBytes']/1048576:.2f} MiB | {package['unpackedBytes']/1048576:.2f} MiB |")
lines += ['', 'Pi精简包省去Web高清位图，所有终端动作与时间轴保留。DSH请选择完整包。完整高清包保留原生分辨率、Alpha和全部旧回退，因此仍然较大；没有通过降质缩包。', '',
          f"普通版：{summary['tracks']['ordinary']['mainSuiteImports']}个主套件和{summary['tracks']['ordinary']['dshSuiteImports']}个DSH套件通过；动态版：{summary['tracks']['animated']['mainSuiteImports']}个主套件和{summary['tracks']['animated']['dshSuiteImports']}个DSH套件通过。另有Pi1.3实际编辑器、拖选／UI集成检查。", '',
          '精确索引资源238,331,400→27,285,922字节；全部89,392,000索引一致。动作HD像素和编码字节不变。完整包与Pi精简包共用264个字节完全相同的程序／索引文件，只有5个发行说明与能力元数据文件按资源类型不同。', '',
          '本轮只生成安装包，未安装、未推送、未发布。真实宿主安装后视觉验收仍单独进行。SHA-256校验文件与完整entry清单在安装包旁。', '',
          '## DSH安装方式（尚未执行）', '', '保存工作并退出DSH后，在此目录选择一个完整包：', '', '```powershell',
          'dsh plugin --profile desktop add "./pi-furry-partner-hd-remaster-2.4.2.tgz"', '# 或选择全动态版完整包',
          'dsh plugin --profile desktop add "./pi-furry-partner-full-animation-2.5.0-preview.4.tgz"', '```', '',
          '## 当前入口', '', '[本地运行预览](http://127.0.0.1:8901/)。`release-summary.json`记录完整测试、优化边界和安装状态。', '']
(release/'README.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps({'summary':str(release/'release-summary.json'),'packages':[{ 'label':p['label'],'bytes':p['archiveBytes']} for p in packages]},ensure_ascii=False))
