"""Write a configured-platform local index using observed build/audit evidence only."""
from pathlib import Path
import json

from reproducibility import logical_path, source_date_utc

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/releases'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def collect_release(root=ROOT, out=OUT):
    configuration = read(root / 'build/editions.json')
    specs, platforms = configuration['editions'], configuration['platforms']
    builds = read(out / 'built-editions.json')['builds']
    audits = read(out / 'edition-audit.json')
    expected = {(edition, platform) for edition in specs for platform in platforms}
    build_keys = [(build['edition'], build['platform']) for build in builds]
    audit_keys = [(audit['edition'], audit['platform']) for audit in audits]
    assert len(build_keys) == len(set(build_keys)) and set(build_keys) == expected
    assert len(audit_keys) == len(set(audit_keys)) and set(audit_keys) == expected
    by_key = dict(zip(audit_keys, audits))
    packages = []
    for build in builds:
        edition, platform = build['edition'], build['platform']
        report_path = Path(build['report'])
        if not report_path.is_absolute():
            report_path = root / report_path
        report = read(report_path)
        audit = by_key[(edition, platform)]
        profile = platforms[platform]['resourceProfile']
        assert build['version'] == specs[edition]['version'] == audit['version']
        assert build['profile'] == profile == audit['profile']
        assert audit['runtimeSmokePassed'] is True and audit['newPixelResourcesAbsent'] is True
        assert report['allArchiveEntriesVerified'] is True
        archive_path = Path(build['archive'])
        if not archive_path.is_absolute():
            archive_path = root / archive_path
        report_archive = Path(report['archive'])
        if not report_archive.is_absolute():
            report_archive = report_path.parent / report_archive
        audit_archive = Path(audit['archive'])
        if not audit_archive.is_absolute():
            audit_archive = root / audit_archive
        assert archive_path.resolve() == report_archive.resolve() == audit_archive.resolve()
        assert build['archiveSha256'] == report['archiveSha256'] == audit['archiveSha256']
        assert report['archiveBytes'] == build['archiveBytes'] == audit['archiveBytes']
        assert report['fileCount'] == audit['allEntriesReverified']
        assert report['capabilities']['track'] == edition
        assert report['capabilities']['targetPlatform'] == platform
        assert report['capabilities']['resourceProfile'] == profile
        package = {key: report[key] for key in ['archive', 'archiveBytes', 'unpackedBytes', 'fileCount', 'archiveSha256', 'capabilities']}
        package['archive'] = build['archive']
        packages.append(package |
                        {'edition': edition, 'platform': platform, 'profile': profile, 'version': build['version'],
                         'label': f"{specs[edition]['label']} · {platforms[platform]['label']}",
                         'allArchiveEntriesVerified': True, 'runtimeSmokePassed': True,
                         'runtimeEvidence': audit['runtimeEvidence'],
                         'exactOriginalPixelRuntimeFiles': audit['exactOriginalPixelRuntimeFiles'],
                         'buildSuitesRecordedPassed': build.get('testsRun') is True,
                         'testRuntimeVersions': build.get('testRuntimeVersions', [])})
    summary = {'dateUtc': source_date_utc(),
               'status': 'LOCAL_BUILD_VERIFIED_NOT_INSTALLED', 'sourceRepository': 'source',
               'buildSourcePolicy': 'Shared repository source only; historical worktrees are not build inputs.',
               'packages': packages,
               'pixel': {'policy': 'legacy-only', 'shippedInMain': False},
               'verification': {'packageCount': len(packages),
                                'allPackageBuildSuitesRecordedPassed': all(p['buildSuitesRecordedPassed'] for p in packages),
                                'realArchivesAllEntriesReverified': True, 'unpackedProductionReadersPassed': True,
                                'auditReport': logical_path(out / 'edition-audit.json', root),
                                'scope': 'Build suite status comes from testsRun; package entry and runtime checks come from matching audit records. No website or external-platform test result is inferred.'},
               'installed': False, 'published': False, 'pushed': False, 'userAcceptance': False,
               'history': 'Earlier packages remain historical; only the matched builds listed here are current.'}
    return summary


HOST_LABELS = {'pi': 'Pi', 'dsh': 'DSH'}


def release_readme(summary):
    """Describe the platforms that were actually built, not a fixed host list."""
    packages = summary['packages']
    hosts = [host for host in HOST_LABELS
             if any(package['platform'] == host for package in packages)]
    if hosts:
        heading = f"当前分支提供 {' 与 '.join(HOST_LABELS[host] for host in hosts)} 包；按宿主选择一个安装。"
    else:
        heading = '当前分支尚未构建安装包。'
    lines = ['# 呜咪 · 同仓构建产物', '', heading, '',
             '| 产品 | 平台 | 资源 | 版本 | 安装包大小 |', '| --- | --- | --- | --- | ---: |']
    for package in packages:
        lines.append(f"| {package['label']} | {package['platform']} | {package['profile']} | {package['version']} | {package['archiveBytes']/1048576:.2f} MiB |")
    notes = [f"{HOST_LABELS[host]} 使用 {'、'.join(dict.fromkeys(package['profile'] for package in packages if package['platform'] == host))} 包。"
             for host in hosts]
    if 'dsh' in hosts and any(package['profile'] == 'full' for package in packages):
        notes.append('完整包也保留 Pi 入口。')
    if notes:
        lines += ['', ''.join(notes)]
    lines += ['构建命令与资源策略见仓库 docs/plugin-lines.md。',
              '各包分别完成实际归档条目回读与解包后的生产读取器验证；main不含像素资源，原像素仅在Legacy保留。',
              '完整构建测试是否运行以各包 buildSuitesRecordedPassed 为准；此处不推断网站或额外平台的测试结果。',
              '未代为安装、推送或公开发布；旧包仅作历史记录。']
    return '\n'.join(lines) + '\n'


def main():
    summary = collect_release()
    (OUT / 'release-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (OUT / 'README.md').write_text(release_readme(summary), encoding='utf-8')
    print(json.dumps({'packages':
                     [{'label': p['label'], 'platform': p['platform'], 'MiB': round(p['archiveBytes']/1048576, 2)}
                      for p in summary['packages']]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
