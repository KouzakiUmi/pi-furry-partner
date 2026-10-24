# Pi HD user guide

[简体中文](guide.zh-CN.md) · [HD home](../README.en.md) · [Documentation index](../../../docs/README.md) · [Release rules](../../../docs/release-line.md)

This guide applies only to `editions/hd/` on main. HD source is **2.5.1-preview.6**, illustration only; no new independent HD Release has been published. Repository Latest is the original-resource v2.5.1. DSH installation belongs to the [separate DSH repository](https://github.com/KouzakiUmi/dsh-furry-partner).

## Installation and updates

Install one Pi edition and one installation route at a time. Both editions retain the same plugin identity and theme for replacement upgrades. Exit Pi and remove the previous source before switching; keep backups.

After obtaining the repository, install HD from its local subdirectory, from the repository root:

```sh
pi install ./editions/hd
```

Alternatively enter `editions/hd/` and run its Windows installer:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
pi
```

A remote `pi install git:github.com/KouzakiUmi/pi-furry-partner@main`, even when pinned to an `hd-v…` tag, reads the repository root manifest and does not select HD. Use the local HD directory or an HD-specific built package.

Run builds inside `editions/hd/`:

```sh
npm run build:animated
python tools/audit-edition-bundles.py --edition full-animation
```

The artifact is `dist/releases/pi-furry-partner-hd-full-animation-2.5.1-preview.6-pi-core.tgz`, with checksum and audit files. Builds do not install or publish. For a future dedicated HD release, extract its tgz, enter the inner `package/` and use that installer's script, or load the local package through Pi.

## Supported runtime and display

Automated coverage includes Windows, Pi **1.2.0 / 1.3.0**, Windows PowerShell **5.1 / 7**. Native Chinese UI and compact documentation prompts are guarded by reviewed versions and structures; unknown versions keep native behavior. Configure Pi and its model provider first.

Use `/mascot render auto|kitty|sixel|blocks`; the terminal must support the selected protocol. Full reactions use `/mascot layout editor`; header layout has its own title portrait. Narrow windows may collapse the dock. Fullscreen uses Pi's native mouse routing; regular mode retains terminal mouse behavior and shows key hints. Automated rendering checks do not establish visual acceptance in every terminal.

## Actions, completion and pause

```text
/mascot action nod
/mascot action shy
/mascot action all
/mascot action off
```

Completion and menus follow the 17 IDs in `lib/gestures.mjs`: wave, nod, peek, stretch, ear-flick, nuzzle, bounce, head-shake, joy, grumpy, sad, cry, shy, flustered, surprise, proud, affection. Single actions finish, all cycles, off stops. Real work, prompts, typing and explicit interactions take priority. Actions do not send model requests or modify the draft.

The 17 selectable gestures/expressions are distinct from the **29 approved complete clips** in `assets/animated/catalog.json`, which also cover task states, three idles and keyboard transitions, with **58 indexed entries**. The eight auxiliary gestures and nine expressions currently last 4458ms; approved catalog timing overrides old nominal metadata. See [gesture definitions](shared-gesture-modules.md).

Reading uses watch/magnifier. Editing and execution use `work-enter → work → work-exit`, with 400ms entry and exit. Ordinary short actions have a 1200ms minimum starting when the first frame becomes visible; short work includes at least 800ms of keyboard loop. A completed tool may retain only a safe visual phase for up to 2000ms; real phase/toolCount end immediately. Answer, prompt, error, cancellation and explicit interaction may preempt presentation.

Pause stops loops while real state keeps updating; an explicit poke may still play once. Missing complete motion and paused display use authored HD static poses, without the original edition's deformation player. Only umi illustration is exposed; historical pixel settings migrate to illustration.

## Controls and independent preferences

Use `/mascot language auto|en|zh-CN|status`; auto follows the system. Custom names remain unchanged. `/mascot menu` or `Ctrl+Alt+W` opens quick actions.

| Command | Purpose |
| --- | --- |
| `poke` | Local interaction without submitting a message |
| `on`, `off`, `pause`, `play` | Visibility and animation |
| `layout editor|header`, `style umi` | Layout and the single illustration style |
| `size auto|small|compact|normal|large` | Portrait size |
| `render auto|kitty|sixel|blocks`, `info compact|native` | Graphics and information layout |
| `locale on|off|status` | Guarded native Chinese UI compatibility |
| `prompt on|off|status` | Compact recognized native documentation on the next request |
| `persona on|off|status` | Independent character voice on the next request |
| `demo [all|state|off]`, `wink` | Display demonstration, separate from the 17 action IDs |

Language, native translation, compact prompts and persona remain separate preferences. Changes preserve real tasks and drafts. User content, tool output, custom system prompts and unknown structures are not rewritten by general translation rules.

## Backups, removal and troubleshooting

Script installation stages files and keeps backups and compatible 2.x preferences. Exit Pi and use `uninstall.ps1` from the same product directory; recovery preserves later user changes. Package-manager installations should be removed through their original source. Avoid a second automatically discovered extension alongside a package entry.

Check on, play, editor layout and window size if the portrait is missing. Use blocks to isolate protocol problems. Report Pi/terminal versions, dimensions, renderer and minimal reproduction. Development and isolated tests are in [CONTRIBUTING](../CONTRIBUTING.md). Code/docs are Apache-2.0; character assets remain ARR under [ASSET_LICENSE](../ASSET_LICENSE.md).
