<div align="center">

[**简体中文**](README.md) | **English**

# pi-furry-partner

**A furry friend to keep you company while good ideas become real work.**

呜咪 · Umi — a little furry partner for your Pi terminal.

<sub>Thinking paws · Typing paws · A swishing tail · A friend who waits for you</sub>

[![Release v2.2.0](https://img.shields.io/badge/release-v2.2.0-8fb9ea?style=flat-square)](https://github.com/KouzakiUmi/pi-furry-partner/releases/tag/v2.2.0)
[![Pi](https://img.shields.io/badge/Pi-1.2.0-c4b5e6?style=flat-square)](https://github.com/earendil-works/pi)
[![Code license](https://img.shields.io/badge/code%20%26%20docs-Apache--2.0-a9dbc9?style=flat-square)](LICENSE)
[![Character assets](https://img.shields.io/badge/character%20assets-All%20Rights%20Reserved-e8bac5?style=flat-square)](ASSET_LICENSE.md)

[**Download the latest release**](https://github.com/KouzakiUmi/pi-furry-partner/releases/latest) · [**Quick installation**](#installation) · [User guide](docs/guide.en.md)

[Meet Umi](#meet-umi) · [Quick actions](#getting-comfortable) · [Language](#your-preferred-language) · [Independent switches](#three-independent-switches)

![Umi beside the Pi editor — an offline layout preview](editor-preview.png)

<sub>Offline preview exported with the production animation code. Conversation content illustrates the layout.</sub>

</div>

> 🐾 “I'm right here. Tell me what you've got in mind.”

Umi stays beside the [Pi Coding Agent](https://github.com/earendil-works/pi) editor. He rests a paw under his chin while thinking, taps at a keyboard while working, and dives into a pile of papers to find things, leaving his tail swishing above the stack. When you need to decide, he tilts his head and waits; stay away a little longer and he dozes off, ready to wake when you return.

The extension also tidies up the editor, footer and everyday actions. Companion text, controls and information panels support **English and Simplified Chinese**. The **native Chinese UI patch, concise Chinese default prompt and optional character voice** each have their own switch, so you can keep your existing models and workflow.

## Meet Umi

<table>
<tr>
<td align="center" width="50%">
<strong>Waiting for your answer</strong><br>
<sub>A curious head tilt, then a tiny nap</sub><br><br>
<img src="waiting-preview.gif" alt="Umi tilts his head, dozes, and wakes again; inactive waiting time is shortened" width="520">
</td>
<td align="center" width="50%">
<strong>Let me dig into that</strong><br>
<sub>A buried head and a tail that gives him away</sub><br><br>
<img src="tail-wave-preview.gif" alt="Illustrated and pixel Umi searching through papers with a traveling tail wave" width="520">
</td>
</tr>
</table>

<div align="center"><sub>Offline animation previews · Some inactive waiting is omitted on the left · Illustrated and pixel styles appear together on the right</sub></div>

| Thinking it through | Getting things done | Waiting for you | Wrapping things up |
| --- | --- | --- | --- |
| Chin on a gray paw, blinks, and `· · ·` in a bubble | Shared typing motion for editing and running; short calls stay visible | Head tilt and question mark, a nap after 10 seconds, then a startled wake-up | A little wave and wink for success; xx eyes for a stumble |

Searching and context compaction share the paper-pile pose: a wave travels along the tail, the head gently burrows, and loose pages move at different moments. Speech uses four `w / — / o / O` mouth shapes and closes naturally when no new text arrives. Breathing, ear twitches and short transitions soften the changes between poses.

<details>
<summary><strong>See the full animation and both Umi styles</strong></summary>

![Offline preview of waking, thinking, speaking, working, searching, errors and success](editor-preview.gif)

![Illustrated and pixel renditions of the same Umi design](style-comparison.png)

These are offline exports. The local `preview.html` can demonstrate states and layouts without making model requests. Optional standalone showcase source is also retained; see the [local preview instructions](CONTRIBUTING.md#可选展示页).

</details>

## Installation

Install and configure Pi first. Tested on **Windows with Pi 1.2.0, Windows PowerShell 5.1 and PowerShell 7**. Other operating systems have not been tested. Images use Sixel or true-color half-block characters; terminal support affects visual quality.

Choose one installation route to avoid loading the extension twice.

### Complete Windows installation

Download `pi-furry-partner-v2.2.0.zip` from [Releases](https://github.com/KouzakiUmi/pi-furry-partner/releases/latest), extract it, close Pi, and open PowerShell in the extracted directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
pi
```

The script installs the extension to `~/.pi/agent/extensions/pi-furry-partner/` and installs the `pi-furry-night` theme. It selects the theme, compact startup header and collapsed changelog, and uses `fullscreen` only when the TUI mode is unset. Existing mode choices and companion preferences survive updates. Model/provider settings, tools and unrelated packages are preserved. The execution-policy option applies only to this process.

If you used **pi-wink-companion**, run the new installer directly: it backs up and migrates the old installation, preserves your configuration, and archives the old extension directory to avoid duplicate loading. Fully exit and restart Pi afterwards. See [backup and recovery details](docs/guide.en.md#installation-and-updates).

### Pi package manager

```sh
pi install git:github.com/KouzakiUmi/pi-furry-partner@v2.2.0
```

This loads the extension and theme through the package manifest. It **does not run the PowerShell installer or configure Pi's four UI options**. Restart Pi, select `pi-furry-night` with `/theme`, and choose your interface mode in `/settings`. The Git tag pins your version; choose a newer release tag when updating. See [Pi's package documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).

If you already installed with the script, keep that route for updates, or uninstall that copy before switching to the package manager.

## Getting comfortable

```text
/mascot style wumi          Illustrated Umi
/mascot style wumi-pixel    Pixel Umi in the same design
/mascot menu                Open everyday actions
/mascot language en         Switch to English
/mascot language zh-CN      Switch to Simplified Chinese
/mascot demo thinking       Try the chin-on-paw pose; no model request
/mascot demo off            Return to the real session
```

Use `/mascot` to inspect your settings. Size, layout, rendering and demo commands are listed in the [user guide](docs/guide.en.md#commands).

The character's English name is **Umi**. Existing `wumi` and `wumi-pixel` style IDs remain unchanged for configuration compatibility.

**The editor follows Pi's current interface mode.** In `fullscreen`, its lower edge has clickable controls for models, thinking levels and more actions. In `regular`, these become keyboard hints. Switching modes in `/settings` updates the controls immediately. In either mode, press **Ctrl+Alt+W** or enter `/mascot menu` to view usage, inspect tools, copy the latest answer, or access session and conversation-tree actions.

The compact footer shows your actual model/provider, thinking level, context, and available token, cache and cost data. Narrow windows prioritize editing space and collapse the large portrait when needed. Text editing, completion and sending still use Pi's native editor.

## Your preferred language

```text
/mascot language en         English
/mascot language zh-CN      Simplified Chinese
/mascot language status     Show the current language
```

Your choice is saved in `config.json`. Existing configurations without a language setting default to Simplified Chinese. Status phrases, bubbles, editor controls, quick actions and information panels update immediately; the active task, input draft and animation timing continue. The default character name appears as **Umi** in English and “呜咪” in Chinese. Custom names and subtitles remain exactly as you wrote them.

English mode uses Pi's native English interface and default system prompt. The `locale` preference is retained, so returning to Chinese applies your previous patch setting. `prompt` and `persona` remain independent; the persona chooses the template for your selected language. Prompt and persona changes apply to the next request. Switching language does not translate code, tool output, model names, paths or project instructions.

## Three independent switches

| Feature | Default | Commands |
| --- | --- | --- |
| Native Chinese UI preference | On; applied in Chinese mode | `/mascot locale on` / `off` |
| Concise Chinese default-prompt sections | On; applied in Chinese mode | `/mascot prompt on` / `off` |
| Umi's character voice | Off | `/mascot persona on` / `off` |

All three accept `status`. `/mascot off` hides the companion; the independent switches retain their settings and can be disabled separately.

- **Native Chinese UI:** in Chinese mode, translates known fixed UI labels in **Pi 1.2.0** and 24 built-in command descriptions. Chinese labels are searchable in the main settings list. English mode uses native English; unknown versions and unmatched content retain their original text.
- **Concise Chinese prompt:** in Chinese mode, replaces precisely recognized Pi default sections with concise Chinese for the next request. English mode keeps Pi's native default prompt. Custom `SYSTEM.md`, project `AGENTS.md`, skills, tool rules and dynamic context are preserved. Shorter wording does not imply the same token reduction for every model.
- **Character voice:** gentle, cute, lively and a little playful, while serious and steady where it matters. Separate Chinese and English templates follow your language choice. They adjust expression; technical accuracy, code and structured output take priority.

Animations, local language processing, read-only panels and previews do not make additional model requests. Normal Pi conversations and explicitly selected session summaries use your existing model configuration. Non-interactive JSON/RPC use does not display the companion or apply these interactive UI features.

## Documentation and development

| What you need | Start here |
| --- | --- |
| Installation, language, styles, uninstall and recovery | [English guide](docs/guide.en.md) · [完整中文指南](docs/guide.zh-CN.md) |
| States, rendering and compatibility boundaries | [Architecture · 中文](docs/architecture.md) |
| Contributing, copy changes and local checks | [Contributing · 中文](CONTRIBUTING.md) |
| Release changes | [Changelog](CHANGELOG.md) |
| Bug reports and ideas | [GitHub Issues](https://github.com/KouzakiUmi/pi-furry-partner/issues) |

Tests cover activity timing, editor layout, mouse routing, Sixel data, Chinese compatibility and prompt boundaries. Installer checks use isolated directories for installation, migration and recovery. Full tests need actual Pi 1.2.0 modules; see the contributing guide for setup. These checks do not establish support for every terminal or extension combination.

The GitHub README is the project's main landing page. Optional standalone showcase source remains in `site/` and has not been published as a separate website.

## License and thanks

Code and documentation use [Apache License 2.0](LICENSE). **The Umi character design, illustrations, pixel art, animations and previews containing the character are All Rights Reserved** and are excluded from the code license. See [ASSET_LICENSE.md](ASSET_LICENSE.md).

This is an independently made Pi extension. Thanks to [Pi](https://github.com/earendil-works/pi) for its extension and terminal UI capabilities. Quick-action and on-demand detail interaction designs were informed by [tomsej/pi-ext](https://github.com/tomsej/pi-ext) and [narumiruna/pi-extensions](https://github.com/narumiruna/pi-extensions); their extension source code was not copied.
