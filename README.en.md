<div align="center">

[**简体中文**](README.md) | **English**

# pi-furry-partner

**A furry friend to keep you company while good ideas become real work.**

呜咪 · Umi — a little furry partner for your Pi terminal.

<sub>Thinking paws · Typing paws · A swishing tail · A friend who waits for you</sub>

[![Pi 2.5.1](https://img.shields.io/badge/Pi-2.5.1-8fb9ea?style=flat-square)](https://github.com/KouzakiUmi/pi-furry-partner/releases/tag/v2.5.1)
[![Pi](https://img.shields.io/badge/Pi-1.2.0-c4b5e6?style=flat-square)](https://github.com/earendil-works/pi)
[![Code license](https://img.shields.io/badge/code%20%26%20docs-Apache--2.0-a9dbc9?style=flat-square)](LICENSE)
[![Character assets](https://img.shields.io/badge/character%20assets-All%20Rights%20Reserved-e8bac5?style=flat-square)](ASSET_LICENSE.md)

[**Download Pi 2.5.1**](https://github.com/KouzakiUmi/pi-furry-partner/releases/tag/v2.5.1) · [**Quick installation**](#installation) · [User guide](docs/guide.en.md)

This repository maintains the **original-resource Pi edition**, preserving the v2.4.0 assets, four styles and action routing with compatibility and rendering fixes. **v2.5.1** is the stable Latest release. DSH is maintained in [dsh-furry-partner](https://github.com/KouzakiUmi/dsh-furry-partner). See [release rules](docs/release-line.md).

[Meet Umi](#meet-umi) · [Quick actions](#getting-comfortable) · [Language](#your-preferred-language) · [Independent switches](#three-independent-switches)

![Umi beside the Pi editor — an offline layout preview](editor-preview.png)

<sub>Offline preview exported with the production animation code. Conversation content illustrates the layout.</sub>

</div>

> 🐾 “I'm right here. Tell me what you've got in mind.”

Umi stays beside the [Pi Coding Agent](https://github.com/earendil-works/pi) editor. He rests a paw under his chin while thinking, types while editing and scans command results with a magnifying glass, and dives into a pile of papers to find things, leaving his tail swishing above the stack. When you need to decide, he tilts his head and waits; stay away a little longer and he dozes off, ready to wake when you return.

The extension also tidies up the editor, footer and everyday actions. Companion text, controls and information panels follow your system language by default and support **English and Simplified Chinese**. The **native Chinese UI patch, concise bilingual Pi documentation hints and optional character voice** each have their own switch, so you can keep your existing models and workflow.

## The wolf behind the paws

<table>
<tr>
<td align="center" width="360">
<img src="assets/profile/umi-photo.jpg" alt="Umi in costume, wearing a star-patterned hood and blue scarf, with blue eyes and a gray paw reaching toward the camera" width="320"><br>
<sub>Umi in costume · 角色实拍</sub>
</td>
<td valign="middle">
<h3>Umi · 呜咪</h3>
<p>A young Kemono wolf with white-and-gray fur and blue eyes. His gray paws, star-patterned hood and blue scarf are his familiar little signatures.</p>
<p>Gentle, lively and a little playful, he listens with a curious head tilt and a tail that sometimes gives him away. When a decision matters, he settles down and helps you see it through with care.</p>
<p>🐾 “Hm, tell me what you're thinking. We'll work it out together!”</p>
<sub>Umi in costume. Character and photograph: All Rights Reserved. See <a href="ASSET_LICENSE.md">asset rights</a>.</sub>
</td>
</tr>
</table>

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
<img src="tail-wave-preview.gif" alt="Illustrated and pixel Umi burrowing into papers, with coordinated head, tail and page movement" width="520">
</td>
</tr>
</table>

<div align="center"><sub>Offline animation previews · Some inactive waiting is omitted on the left · Illustrated and pixel styles appear together on the right</sub></div>

| Thinking it through | Getting things done | Waiting for you | Wrapping things up |
| --- | --- | --- | --- |
| Chin on a gray paw, blinks, and `· · ·` in a bubble | Typing paws for edits; a smooth magnifier scan with brief side pauses for command runs; short calls stay visible | Head tilt and question mark, a nap after 10 seconds, then a startled wake-up | A little wave and wink for success; xx eyes for a stumble |

Searching and context compaction share a continuous paper-pile animation: the head gently burrows, the tail swishes, and loose pages flutter with the body and cloak. Speech uses four `w / — / o / O` mouth shapes and closes naturally when no new text arrives. Breathing, ear twitches and short transitions bring the other poses to life too.

<details>
<summary><strong>See the full animation and both Umi styles</strong></summary>

![Offline preview of waking, thinking, speaking, working, searching, errors and success](editor-preview.gif)

![Full magnifier loop: the head and gripping paw follow the lens in illustrated and pixel styles](magnifier-preview.gif)

![Illustrated and pixel renditions of the same Umi design](style-comparison.png)

These are offline exports. The local `preview.html` can demonstrate states and layouts without making model requests. Optional standalone showcase source is also retained; see the [local preview instructions](CONTRIBUTING.md#可选展示页).

</details>

## Installation

Install and configure Pi first. Full automated coverage includes **Windows, Pi 1.2.0 / 1.3.0, Windows PowerShell 5.1 and PowerShell 7**. Native Chinese UI and concise Pi documentation hints support only the explicitly reviewed 1.2.0 / 1.3.0 releases; unknown versions keep native behavior. The earlier supplementary production check on **NixOS 26.05 (Yarara), Pi 1.3.0 and Kitty 0.49.1** (`TERM=xterm-kitty`) remains applicable. Images use Kitty PNG, Sixel, or true-color half-block characters; terminal support affects visual quality.

Choose one installation route to avoid loading the extension twice.

### Complete Windows installation

Download `pi-furry-partner-2.5.1.zip` from [Releases](https://github.com/KouzakiUmi/pi-furry-partner/releases/tag/v2.5.1), extract it, close Pi, and open PowerShell in the extracted directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
pi
```

The script installs the extension to `~/.pi/agent/extensions/pi-furry-partner/` and installs the `pi-furry-night` theme. It selects the theme, compact startup header and collapsed changelog, and uses `fullscreen` only when the TUI mode is unset. Existing mode choices and companion preferences survive updates. Model/provider settings, tools and unrelated packages are preserved. The execution-policy option applies only to this process.

If you used **pi-wink-companion**, run the new installer directly: it backs up and migrates the old installation, preserves your configuration, and archives the old extension directory to avoid duplicate loading. Fully exit and restart Pi afterwards. See [backup and recovery details](docs/guide.en.md#installation-and-updates).

### Pi package manager

```sh
pi install git:github.com/KouzakiUmi/pi-furry-partner@v2.5.1
```

This loads the extension and theme through the package manifest. It **does not run the PowerShell installer or configure Pi's four UI options**. Restart Pi, select `pi-furry-night` with `/theme`, and choose your interface mode in `/settings`. The Git tag pins your version; choose a newer release tag when updating. See [Pi's package documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).

If you already installed with the script, keep that route for updates, or uninstall that copy before switching to the package manager.

## Getting comfortable

```text
/mascot style umi           Illustrated Umi
/mascot style umi-pixel     Pixel Umi in the same design
/mascot menu                Open everyday actions
/mascot poke                Give Umi a gentle poke
/mascot language en         Switch to English
/mascot language zh-CN      Switch to Simplified Chinese
/mascot demo                Loop through all animations; no model request
/mascot demo off            Return to the real session
```

Use `/mascot` to inspect your settings. Size, layout, rendering and demo commands are listed in the [user guide](docs/guide.en.md#commands).

`/mascot demo` or `/mascot demo all` starts a repeating tour lasting a little over a minute: listening, thinking, speaking, working and a playful poke, with complete magnifier and search loops and time to doze and wake again. It makes no model requests and preserves settings and your draft. `demo off` or a real task ends the tour. Use `/mascot demo thinking` or `/mascot demo running` to focus on one pose.

The character name and style commands now consistently use **Umi / `umi`**. Legacy `wumi` and `wumi-pixel` commands remain accepted as aliases; new style saves use `umi` and `umi-pixel`.

`umi-pixel` preserves the illustrated character's design, face and poses at **80 × 80**. Local line protection keeps fine mouth strokes from disappearing during sampling, with a light color cleanup around those strokes and no character redesign.

**The editor follows Pi's current interface mode.** In `fullscreen`, its lower edge has clickable controls for models, thinking levels and more actions. In `regular`, these become keyboard hints. Switching modes in `/settings` updates the controls immediately. In either mode, press **Ctrl+Alt+W** or enter `/mascot menu` to view usage, inspect tools, copy the latest answer, or access session and conversation-tree actions.

**2.3.2 completes the closed-eye fixes across all styles.** Legacy illustration and pixel startup, dozing, blinking, error and poke expressions no longer retain open-eye lashes, gray shadows or iris pixels. The pixel header wink is fixed too. Saved styles and other preferences are preserved; restart Pi after upgrading to load the new artwork.

**2.3.1 fixes black portrait stripes and stalled output after text selection.** Image-marker deduplication prevents misplaced stripes; separate parsing of Pi's duplicated private caret markers prevents later output from being buffered indefinitely. Pi retains native selection, drafts, cursor and submission behavior. Verification exercises the real Pi selection and output protocols; it does not establish native-screen coverage of every Windows Terminal environment.

The compact footer shows your actual model/provider, thinking level, context, and available token, cache and cost data. Narrow windows prioritize editing space and collapse the large portrait when needed. Text editing, completion and sending still use Pi's native editor.

For a little interaction, click Umi's portrait in `fullscreen`, or use `/mascot poke` in either mode. He briefly makes a `>w<` face, scrunches up with a gentle wiggle and replies with a random little quip in the current language. While he's working, the wiggle is gentler and his reply stays focused on the task; when he's idle, he becomes a little more playful, before returning to the current activity.

The editor's **`Motion: On` / `Motion: Off`** control shows its current state. Turning it off stops looping motion while static poses still follow agent activity; an intentional poke still plays its brief reaction. You can also use `/mascot pause` / `/mascot play`.

After you send, the editor status shows request preparation, waiting for the first output, or thinking received while waiting for answer text, together with elapsed seconds. If no first output arrives after 10 seconds of waiting, it says so explicitly; after 15 seconds, the indicator uses a warning color. The wait indicator still updates once a second with looping motion off.

With motion enabled, changes to your draft while he's idle or waiting for your answer make Umi lift a gray paw to his ear, lean in and nod as he listens. About 1.8 seconds after you stop typing, he returns to the previous state. Active tool reactions keep their place, and a poke takes precedence.

## Your preferred language

```text
/mascot language auto       Follow the system language (default)
/mascot language en         English
/mascot language zh-CN      Simplified Chinese
/mascot language status     Show the current language
```

Your choice is saved in `config.json`. The default, `auto`, detects the system language: Chinese environments use Simplified Chinese; other languages use English. Configurations without a language field also use automatic detection. An existing explicit `en` or `zh-CN` preference is preserved. Use `/mascot language auto` to follow the system again, or `status` to see both your preference and the resolved language. Status phrases, bubbles, editor controls, quick actions and information panels update immediately; the active task, input draft and animation timing continue. The default character name appears as **Umi** in English and “呜咪” in Chinese. Custom names and subtitles remain exactly as you wrote them.

English mode uses Pi's native English interface. The `locale` preference is retained, so returning to Chinese applies your previous patch setting. With `prompt` enabled, only the recognized Pi documentation-hint section is condensed in the resolved language; disabling it restores that section's native wording. Pi's identity, tools and rules remain native. The independent `persona` switch also chooses a template for that language. Prompt and persona changes apply to the next request. Switching language does not translate code, tool output, model names, paths or project instructions.

## Three independent switches

| Feature | Default | Commands |
| --- | --- | --- |
| Native Chinese UI preference | On; applied in Chinese mode | `/mascot locale on` / `off` |
| Concise Pi documentation hints | On; Chinese or English follows the language | `/mascot prompt on` / `off` |
| Umi's character voice | Off | `/mascot persona on` / `off` |

All three accept `status`. `/mascot off` hides the companion; the independent switches retain their settings and can be disabled separately.

- **Native Chinese UI:** in Chinese mode, translates known fixed UI labels in **Pi 1.2.0 / 1.3.0** and 24 built-in command descriptions. Chinese labels are searchable in the main settings list. English mode uses native English; unknown versions and unmatched content retain their original text.
- **Concise Pi documentation hints:** condenses only the precisely recognized documentation-hint section into Chinese or English for the next request, retaining documentation paths, complete-file reading and cross-reference requirements. Pi's identity, tool list and rules stay native. Custom `SYSTEM.md`, project `AGENTS.md`, skills and dynamic content added by later extensions remain live. Disabling it removes this documentation-section replacement. Shorter wording does not imply the same token reduction for every model.
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

Tests cover activity timing, editor layout, mouse routing, Kitty PNG/Sixel data, Chinese compatibility, prompt boundaries and hierarchical command completion. Pi 1.2.0 / 1.3.0 run the full suite; installer checks use isolated directories. Original resource SHA-256 baselines come from v2.4.0 Git objects. Run `node tests/legacy-resources.mjs` to verify an extracted release archive as well. See [Contributing](CONTRIBUTING.md) for setup.

The GitHub README is the project's main landing page. Optional standalone showcase source remains in `site/` and has not been published as a separate website.

## License and thanks

Code and documentation use [Apache License 2.0](LICENSE). **The Umi character design, photographs, illustrations, pixel art, animations and previews containing the character are All Rights Reserved** and are excluded from the code license. See [ASSET_LICENSE.md](ASSET_LICENSE.md).

This is an independently made Pi extension. Thanks to [Pi](https://github.com/earendil-works/pi) for its extension and terminal UI capabilities. Quick-action and on-demand detail interaction designs were informed by [tomsej/pi-ext](https://github.com/tomsej/pi-ext) and [narumiruna/pi-extensions](https://github.com/narumiruna/pi-extensions); their extension source code was not copied.
