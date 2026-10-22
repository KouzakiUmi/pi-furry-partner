import json
from pathlib import Path

root = Path(r'D:\Software Projects\pi-furry-partner-regular')
path = root / 'package.json'
package = json.loads(path.read_text(encoding='utf-8'))
package['version'] = '2.4.2'
path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
for filename in ['docs/regular-version.md', 'docs/ordinary-animation-restoration.md']:
    path = root / filename
    text = path.read_text(encoding='utf-8')
    prefix = '> 当前本地修复构建：**原逻辑高清重制版 2.4.2**。文中2.4.1是修复基线。27套Pi主回归、14套DSH回归与Pi1.3集成已通过；本轮仅保留安装包，尚未安装或发布。\n\n'
    if not text.startswith(prefix):
        path.write_text(prefix + text, encoding='utf-8')
print('Ordinary local build metadata is2.4.2; artwork and runtime code unchanged.')
