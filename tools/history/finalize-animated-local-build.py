import json
from pathlib import Path

root = Path(r'D:\Software Projects\pi-furry-partner\work\animated-remake-20261021')
package_path = root / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '2.5.0-preview.4'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
for filename, banner in [
    ('README.md', '> **全动态重做版 · 本地构建 2.5.0-preview.4**：17段完整动作＋两段键盘过渡，固定人物坐标，精确无损索引资源与按需高清加载。Pi／DSH共用动作逻辑；原逻辑高清重制版独立维护。此构建已完成代码与资源验证，待真实宿主安装验收，尚未公开发布。\n\n'),
    ('README.en.md', '> **Full-animation remake · local build 2.5.0-preview.4**: 17 whole-frame actions plus two keyboard transitions, fixed world coordinates, exact compressed indexed resources and on-demand HD loading. The ordinary HD remaster remains separate. Local code/resource validation is complete; real-host installation acceptance and public release remain pending.\n\n'),
]:
    path = root / filename
    text = path.read_text(encoding='utf-8')
    if text.startswith('> '):
        text = text.split('\n\n', 1)[1]
    path.write_text(banner + text, encoding='utf-8')

preview = root / 'docs/animated-preview.md'
backup = root / 'work/release-doc-history-20261022'
backup.mkdir(exist_ok=True)
if not (backup / preview.name).exists():
    (backup / preview.name).write_bytes(preview.read_bytes())
preview.write_text('''# 全动态重做版 · 本地完整构建

当前程序版本为 `2.5.0-preview.4`。普通“原逻辑高清重制版”独立维护；两条产品线各自只展示插画／像素两项画风。此前 preview.1～3 安装包和记录保留为历史，本轮没有覆盖本机安装或公开发布。

## 已接入内容

- 17段已认可连续动作，加键盘进入／退出两段400ms转场；九种表情及待机、思考、打字、倾听、等待、休息、放大镜和搜索均已映射。
- Pi和DSH共用状态优先级与动作时钟；说话仍保留独立口型，倾听、错误、戳戳和动画关闭可以打断动作。
- 固定640逻辑世界和支撑锚点`[320,608]`，按明确paintRect绘制896等扩展画布，不按每帧透明边界fit或挤入640方框。
- Pi标题保留原15帧／4800ms简单循环；DSH标题继续独立静态挥爪图，输入框不加入桌宠组件。
- 提问、等回答、久等及睡醒气泡使用双语场景句子，工具注册名和真实调用不改。

## 无损存储与生命周期

57个索引文件、76逻辑条目已改为有界gzip二进制载荷，独立生产decoder核对了89,392,000个索引、全部调色板、透明项、逐帧元信息和时钟。索引资源实际从238,331,400字节降至27,285,922字节；这是索引存储减少88.55%，不等同于完整安装包缩小88.55%。完整高清帧的像素、Alpha、分辨率、帧率与编码字节不变。

当前完整包继续保留高清和旧回退；另提供Pi-only精简包，省去两套Web高清位图，保留所有终端资源和动作。APNG待机试点比现有WebP更大，因此未用它替换整包。

高清完整动作保留最多两段缓存、每段最多四个在途下载／解码；已解码动作位图使用全局48MiB字节预算。该预算不包含浏览器内部、GPU、普通回退或在途解码内存，不是进程总内存承诺。暂停、像素画风、隐藏、禁用会abort并释放动作位图，迟到解码会close。启动只预载三个普通姿态，其余按实际绘制按需加载。

## 已完成验证与边界

完整Pi测试使用明确的Pi1.2.0兼容fixture；另在实际Pi1.3.0运行编辑器／布局与拖选集成。DSH独立控制器、固定尺度／绘制矩形、键盘399／400ms边界、延迟帧隔离、样式切换、暂停和释放测试通过。真实浏览器已从Host读取新二进制资源并播放插画与像素动作。

详细命令、最终包体、逐文件SHA及安装状态以本轮`release-summary.json`和安装包旁的report为准。浏览器控制器检查不冒充真实DSH宿主安装验收；本轮遵循用户“暂时只保留安装包”。
''', encoding='utf-8')
print('Animated local metadata and current release documentation updated.')
