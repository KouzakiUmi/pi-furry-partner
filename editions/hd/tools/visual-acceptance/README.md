# 本机 Pi / Kitty 视觉验收工具

供 Windows 脚本及其他 Agent 调用；操作命令向 stdout 返回一个 JSON 对象（`--help` 除外）。默认使用已部署的 `archlinux` WSL、Node 24.13.0、Kitty 0.49.1 和隔离的 Pi 1.3.0，也可选择 1.2.0。不开放 TCP/HTTP 端口。

## 边界

- 截图来自 **Kitty 实际渲染的像素帧**，不是终端文本重排、Canvas 模拟或整张 Windows 桌面截图。
- 宿主加载指定源码快照中的项目扩展，使用真实 Pi `CustomEditor`、主屏/全屏渲染器、原生 `SelectList` 和真实终端 PTY。模型会话、任务事件与历史是离线 fixture，不等同于完整 Pi `InteractiveMode` 的所有业务流程。
- 不创建 `AgentSession`、不配置/迁移模型凭据。普通输入与 Enter 只在 fixture 内记录；`/mascot` 命令会交给项目扩展。
- 只对可信、已审查源码使用。扩展代码会以当前 WSL 用户执行；**这不是不可信代码沙箱**。
- 每次启动创建私有源码快照、空 Pi 配置、0700 会话/运行目录和 0600 Unix socket。Kitty 仅允许 socket 控制，不允许终端转义序列开启任意远程控制。
- 默认 TTL 900 秒，到期关闭窗口。`stop` 只操作经过 PID 起始时间和会话标题校验的自有 Kitty 进程，不杀其他终端。
- 保留截图、状态、日志和源码 SHA-256。`visualAcceptance` 固定为 `not-evaluated`；基础设施成功或截图存在**不表示产品视觉验收通过**，最终由人或视觉模型读取图片判定。

## 字体

默认使用 Windows 系统已安装的 **Maple Mono NF CN**。启动器通过字体注册表解析 Regular/Bold/Italic/BoldItalic，WSL 会话通过只读字体文件链接和独立 Fontconfig 配置引用本机文件，不复制或再分发字体。内嵌许可已核验为 SIL OFL 1.1。

Windows 的 Segoe UI Emoji 仅作为本机 emoji 字形回退引用，不作为代码资产打包。字体族、实际匹配文件和 SHA-256 会写进启动结果与截图旁车。

可用 `--font` 指定另一个已安装字体族，或重复传 `--font-file` 指定明确的本机字体文件。字体匹配失败会报错，不会静默冒用其他字体。

## PowerShell 示例

先从仓库根目录进入 `editions/hd/` 再运行，或把 `$cli` 改成此目录中工具的绝对路径。以下示例是本机验收环境记录，不保证其他机器有相同 WSL、字体或 Kitty：

```powershell
$cli = '.\tools\visual-acceptance\pi-visual.py'
$session = python $cli start --mode fullscreen --renderer blocks --phase thinking | ConvertFrom-Json
if (-not $session.ok) { throw ($session.error | ConvertTo-Json) }
$id = $session.result.id

python $cli status $id
python $cli text $id '视觉验收：中文 ABC 123'
python $cli key $id left
python $cli screenshot $id --output 'D:\visual-evidence\thinking.png'

python $cli scene $id --overlay right
python $cli screenshot $id --output 'D:\visual-evidence\overlay-right.png'
python $cli key $id escape

python $cli scene $id --mode regular --history 120 --phase speaking
python $cli resize $id --columns 90 --rows 32
python $cli screenshot $id --output 'D:\visual-evidence\regular.png'
python $cli stop $id
```

也可以调用同目录的 `pi-visual.cmd`。默认源码是当前仓库；用 `--source 'D:\path with spaces\reviewed-source'` 显式选择别的可信快照。`--distro` 是全局选项，放在子命令之前。

### Kitty 后端

Kitty 是承载窗口的终端，而 `--renderer` 是被测项目选择的图像后端。当前本地源码如果没有 Kitty 后端，`--renderer auto` 会如实报告有效后端；显式要求 `--renderer kitty` 时会返回 `SOURCE_HAS_NO_KITTY_BACKEND`，不会注入 PR 代码或改写生产源码。验收 Kitty PR 时请用 `--source` 指向其已审查源码快照。

### 场景与输入

- `scene` 支持 `--mode regular|fullscreen`、`--renderer auto|kitty|blocks`、四种项目风格、语言、editor/header 布局和活动 phase。
- `--animation off` 请求项目自身暂停；是否改变姿态由项目逻辑决定，不伪造帧。
- `--overlay right|crossing|off` 分别覆盖头像右侧、与头像相交、关闭弹层；`--row` / `--col` 可明确设定零基坐标。
- `--menu` 打开项目自己的快捷菜单；`--text` 直接设置可重复的 fixture 草稿，区别于 `text` 命令经过 Kitty/PTY 的真实输入路径。
- `key` 使用 Kitty 键名，如 `left`、`right`、`enter`、`escape`、`ctrl+a`。
- `drag ID --x1 1 --y1 2 --x2 20 --y2 4` 使用零基字符坐标，经 PTY 注入 SGR 鼠标 press/drag/release，验证 Pi fullscreen 的应用内选择；不会写系统剪贴板。
- regular 模式的终端原生鼠标选择需要桌面输入，`drag` 会明确拒绝，不把 SGR 注入宣称为 OS 指针/IME 验收。
- `resize` 发送原生窗口大小请求，返回的是实际终端行列数；某些窗口管理器可能不接受请求，不能只看命令退出码。

## 证据与调用约定

`start` 返回 `id`、源码内容哈希、Pi 版本、实际字体、会话目录、TTL 和实际 TUI 状态。状态包含草稿、光标、头像位置、弹层范围及最后渲染的纯文本，便于 Agent 定位字符坐标；不包含图片 APC payload。

`screenshot` 返回 PNG 尺寸、SHA-256、字体、源码哈希、捕获方法和场景状态。同名 JSON 旁车与图片一起写入 `--output`。默认输出到 Windows `%LOCALAPPDATA%\PiVisualAcceptance\artifacts\<ID>\`。已有图片或旁车一律拒绝覆盖。

Linux 证据和快照保留在 `~/.local/share/pi-terminal-test/visual/sessions/<ID>/`。`list` 返回已知会话及其实际运行状态。停止不会删除诊断证据。

退出码：成功为 0；参数、环境、源码能力、会话或截图失败为非零，并返回 `ok:false`。不要把键盘发送成功当作输入生效；核对返回的草稿、光标、弹层或后续截图。

Kitty 原生截图只捕获其当前可见内部窗口/标签页；窗口边框、Windows 桌面合成、硬件 IME 候选窗和真实鼠标指针不在截图验收范围内。

## 测试

```powershell
python -m py_compile tools/visual-acceptance/pi-visual.py tools/visual-acceptance/controller.py
node --check tools/visual-acceptance/host.mjs
wsl -d archlinux -- /usr/bin/python3 -m unittest discover -s /mnt/d/pi-furry-partner/tools/visual-acceptance -p 'test_*.py' -v
```

相关契约已使用 Context7 与实际安装包核验：Pi TUI 1.3.0、Kitty 0.49.1 的截图/控制命令、Fontconfig 2.17.1。已实测 Pi 1.2.0 与 1.3.0 的真实窗口控制：输入、方向键、SGR 拖选、弹层、截图、缩放和 regular/fullscreen 切换；9 项隔离/权限/字体/证据单元测试通过。Kitty 图片分支使用独立的已审查 PR 源码快照验证，不混入当前生产源码；工具也能保留该 PR 弹层缺行问题的真实像素证据。

- [Pi TUI 文档](https://github.com/earendil-works/pi/blob/v1.3.0/packages/tui/README.md)
- [Kitty 远程控制](https://sw.kovidgoyal.net/kitty/remote-control/)
- [Kitty 字体选择](https://sw.kovidgoyal.net/kitty/kittens/choose-fonts/)
- [Fontconfig 配置](https://fontconfig.pages.freedesktop.org/fontconfig/fontconfig-user.html)
