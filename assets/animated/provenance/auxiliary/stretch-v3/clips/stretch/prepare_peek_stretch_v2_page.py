from pathlib import Path
import json

here = Path(__file__).resolve().parent
source = (here / 'next_auxiliary_review_server.py').read_text(encoding='utf-8')
source = source.replace("assert reference.is_file()", "assert reference.is_file()\n    keypose = (root / entry['keypose']).resolve()\n    assert keypose.is_relative_to(root) and keypose.is_file()", 1)
source = source.replace("'referencePath': reference}", "'referencePath': reference, 'keyposePath': keypose}", 1)
source = source.replace('<h2>同一份无损 RGBA 帧</h2>', '<h2>中段关键姿势设计</h2><p>这张新图只负责表达动作意图；人物身份、配色和开闭坐姿仍以左侧原待机为准，不能把它当作已批准的首尾。</p><img id="keypose" style="max-width:640px"><h2>同一份无损 RGBA 帧</h2>', 1)
source = source.replace("document.querySelector('#reference').src='/reference.png?id='+encodeURIComponent(id);", "document.querySelector('#reference').src='/reference.png?id='+encodeURIComponent(id);document.querySelector('#keypose').src='/keypose.png?id='+encodeURIComponent(id);", 1)
source = source.replace("elif parsed.path == '/frame.png':", "elif parsed.path == '/keypose.png':\n                path = item['keyposePath']\n            elif parsed.path == '/frame.png':", 1)
source = source.replace('每条保持 H3 原生 1× 时间、完整 107 帧与统一 640px 世界注册。', '第二版改用原待机＋明确的中段关键姿势作为 H3 双参考；原生 1× 时间、完整 107 帧与固定 640px 注册保持。', 1)
(here / 'peek_stretch_v2_review_server.py').write_text(source, encoding='utf-8')
config = json.loads((here / 'peek-stretch-review-config.json').read_text(encoding='utf-8'))
for key, item in config['items'].items():
    item['output'] = item['output'].replace('key-purple-pilot-v1', 'key-purple-pilot-v2')
    item['reference'] = item['reference'].replace('key-purple-pilot-v1', 'key-purple-pilot-v2')
    item['keypose'] = f'Hi-Res/sources/h3-motion-polish-20261023/auxiliary-keypose-v2/{key}.png'
    item['note'] = '最终复核后填写本片实际表演与已知问题。'
(here / 'peek-stretch-v2-review-config.json').write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Prepared independent v2 page; final output paths and notes still await actual source/output review.')
