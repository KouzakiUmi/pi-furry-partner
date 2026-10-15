# pi-furry-partner · User guide

[**简体中文**](guide.zh-CN.md) | **English**

[Project home](../README.en.md) · [GitHub](https://github.com/KouzakiUmi/pi-furry-partner#readme) · [Latest release](https://github.com/KouzakiUmi/pi-furry-partner/releases/latest) · [Changelog](../CHANGELOG.md)

Umi is an animated companion for the interactive Pi Coding Agent terminal. This guide covers installation, language, controls and independent settings. Code and documentation use Apache-2.0; character artwork and animation are All Rights Reserved.

## Installation and updates

The tested environment is **Windows, Pi 1.2.0, Windows PowerShell 5.1 and PowerShell 7**. Other operating systems have not been tested. Configure Pi and your model provider before installing the extension.

Choose one route:

- **Windows installer:** download and extract `pi-furry-partner-v2.2.0.zip` from [Releases](https://github.com/KouzakiUmi/pi-furry-partner/releases/latest), fully exit Pi, and run the following from the extracted project directory.
- **Pi package manager:** use the Git command below. This route loads the manifest resources without running the PowerShell installer.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
pi
```

```sh
pi install git:github.com/KouzakiUmi/pi-furry-partner@v2.2.0
```

The installer deploys to `~/.pi/agent/extensions/pi-furry-partner/` and installs `pi-furry-night`. It manages four Pi UI settings: `theme`, `quietStartup`, `collapseChangelog` and `tuiMode`. It uses fullscreen only if the mode is unset; existing mode choices, model/provider settings and unrelated packages are preserved. The execution-policy option applies only to this process.

Updates preserve existing 2.x companion configuration. The installer can back up and migrate the former `pi-wink-companion` installation, then archive the old extension directory to prevent duplicate loading. Fully exit and restart Pi after an installation or migration.

The package-manager route does not configure those four Pi UI settings or migrate old script installations. Restart Pi, then select the theme with `/theme` and interface mode with `/settings`. Keep using the same installation route for updates, or uninstall the previous copy before switching. See [Pi's package documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).

## Language

```text
/mascot language en
/mascot language zh-CN
/mascot language status
```

The choice is saved in the extension's `config.json` under `language`. Existing configurations without this field default to `zh-CN`. `zh` is also accepted as an alias for Simplified Chinese.

Companion status phrases, speech bubbles, editor controls, quick actions and information panels update immediately. The current task, input draft and animation timing continue. The default character name/subtitle becomes **Umi / Your coding companion** in English and “呜咪 / 你的工作搭档” in Chinese. Custom names and subtitles remain unchanged.

| Independent setting | Simplified Chinese mode | English mode |
| --- | --- | --- |
| `locale` | Applies the native Chinese UI patch when enabled | Pauses that patch and retains your preference |
| `prompt` | Uses concise Chinese for recognized default sections when enabled | Keeps Pi's native English default prompt |
| `persona` | Adds the Chinese Umi template when enabled | Adds the English Umi template when enabled |

Prompt and persona changes apply to the next request. Language changes do not translate conversation history, code, tool output, model names, paths, custom `SYSTEM.md` files or project `AGENTS.md` instructions.

## States and animation

The companion reacts to actual Pi events: model thinking, text output, tool execution, user questions, context compaction and the turn's outcome. Editing and running share a typing motion; searching and compaction share the paper-pile pose. The tail carries a traveling wave rather than moving as a rigid piece. Speech uses `w / — / o / O` shapes and stops when text output stops.

The startup wake-up lasts about five seconds. Waiting for your answer produces a curious head tilt and question mark; after ten seconds, Umi dozes off. Resuming work triggers a short startled wake-up. These are visual reactions and do not delay tools or model output.

Short editing/running reactions remain visible for about 1.2 seconds, with a buffer before returning to thinking. The real status text updates immediately. Narrow or short terminals collapse the large portrait to preserve editing space. Animation can be paused without stopping Pi.

The `wumi` and `wumi-pixel` style IDs are retained for compatibility. The character's English name is **Umi**.

## Mouse and keyboard

In **fullscreen**, the lower edge of the editor contains clickable controls, with model, thinking and more actions on the right. Clicking the character can pause or resume animation. Dragging to select text is not treated as a button click.

In **regular**, the same space displays keyboard hints instead of mouse buttons. Pi's current native key mappings are used where available. The menu is always accessible through **Ctrl+Alt+W** or `/mascot menu`. Changing TUI mode in `/settings` updates the controls immediately while preserving your editor and draft.

The quick menu offers model selection, thinking level, usage, tool details, session history, conversation tree, branching, copying the latest answer, tool-output expansion, thinking-text visibility and an external editor. Actions unavailable during work are omitted or disabled. These use Pi's native handlers.

Usage panels show session data Pi has already recorded. Missing values stay unavailable; they do not query account balance or provider limits. Tool panels are read-only and do not execute tools or reveal call arguments. Use arrows and PgUp/PgDn to browse, Home/End to jump, and Enter/Esc to return.

## Commands

Use `/mascot` for current settings. The command values remain the same in both languages.

| Commands | Purpose |
| --- | --- |
| `/mascot language en` / `zh-CN` / `status` | Choose or inspect the display language |
| `/mascot menu` | Open quick actions |
| `/mascot style wumi` / `wumi-pixel` | Illustrated or pixel Umi |
| `/mascot style pixel` / `illustration` | Earlier header styles retained for comparison |
| `/mascot layout editor` / `header` | Input-area companion or startup header |
| `/mascot pause` / `play` | Pause or resume animation |
| `/mascot on` / `off` | Show or hide the companion |
| `/mascot size auto` / `small` / `compact` / `normal` / `large` | Choose a size within terminal limits |
| `/mascot render auto` / `sixel` / `blocks` | Select graphics transport |
| `/mascot info compact` / `native` | Compact or native footer |
| `/mascot locale on` / `off` / `status` | Native Chinese UI preference |
| `/mascot prompt on` / `off` / `status` | Concise Chinese default-prompt preference |
| `/mascot persona on` / `off` / `status` | Umi's character voice |
| `/mascot demo thinking` / `speaking` / `waking` | Preview a state without model calls |
| `/mascot demo off` | Return to the real session |

Other demo states include `idle`, `reading`, `editing`, `running`, `searching`, `waiting`, `success`, `error`, `cancelled` and `compacting`.

## Independent text features

`locale` and `prompt` default to enabled; `persona` defaults to disabled. `/mascot off` hides the companion and restores native visual elements, while the three text preferences keep their own settings.

The native Chinese compatibility layer strictly targets known **Pi 1.2.0** structures and fixed labels, including 24 built-in command descriptions. Dynamic text, tool output, identifiers and stored values remain intact. Unknown versions or structures retain the original behavior. Pi's installed files are not rewritten.

The prompt option changes only precisely recognized Pi default instructions in Chinese mode. Custom `SYSTEM.md`, project `AGENTS.md`, skills, tool rules and dynamic context remain unchanged. English mode keeps the native default prompt. Concise wording does not guarantee a fixed token reduction.

The persona is gentle, cute, lively and playful, but serious about important work. Technical accuracy, code and structured output take priority. Chinese uses `prompts/wumi-persona.md`; English uses `prompts/umi-persona.en.md`. They share the same independent persona switch. Template edits affect the next request; historical messages are not rewritten.

## Rendering and troubleshooting

Sixel requires terminal support. `auto` prefers Sixel in Windows Terminal and uses true-color half-blocks in other environments. Force `/mascot render blocks` if images are missing or the terminal shows protocol text. Font, DPI and terminal dimensions affect the result.

For missing portraits, first check `/mascot on`, available terminal space, and whether another extension already owns the editor. The extension preserves another custom editor; use the header layout or review that extension combination. In regular mode, controls are keyboard hints by design.

If you see duplicate companions, remove one installation source or complete the old-name migration. Do not manually copy an archived extension back into Pi's auto-discovered extensions directory.

## Backups and removal

The Windows installer backs up the old extension, theme, settings and installation record before replacing files. Its uninstall workflow restores a managed Pi field only when the current value still equals the installed value, so later user changes are preserved. See the detailed [Chinese recovery guide](guide.zh-CN.md#备份卸载与恢复) for the exact script options and recovery rules.

Packages installed through Pi should be removed through Pi's package manager, rather than the Windows uninstall script. Do not mix removal routes.

## Development, previews and rights

Local animation, language processing, read-only panels and demos make no additional model requests. Normal Pi conversations and explicitly chosen summaries use your existing model configuration. Non-interactive JSON/RPC use does not display or install these interactive UI features.

The preview PNGs/GIFs are offline compositions exported from production state and animation code. They are not captures of a native terminal window. `preview.html` is a local demonstration; it does not change the real Pi session. Optional showcase source in `site/` is retained and has not been published as a separate website.

Run `npm test` from the project directory. Full tests need actual Pi 1.2.0 modules; see [Contributing](../CONTRIBUTING.md) for setup, isolated installer checks and preview builds. The tested scope does not cover every terminal, font, window size or extension combination.

Code and documentation are [Apache-2.0](../LICENSE). **Umi's character design, illustrations, pixel art, animation frames and character-containing previews are All Rights Reserved.** The code license does not grant reuse rights to those assets. See [ASSET_LICENSE.md](../ASSET_LICENSE.md).
