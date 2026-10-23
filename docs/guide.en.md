# pi-furry-partner · User guide

See [authored expressions](authored-expressions.md) for the nine new reactions shared with DSH. Use `/mascot action all` for the 17-item tour or an expression ID such as `/mascot action shy` for a single reaction.

[**简体中文**](guide.zh-CN.md) | **English**

[Project home](../README.en.md) · [GitHub](https://github.com/KouzakiUmi/pi-furry-partner#readme) · [Release v2.5.0](https://github.com/KouzakiUmi/pi-furry-partner/releases/tag/v2.5.0) · [Changelog](../CHANGELOG.md)

Umi is an animated companion for the interactive Pi Coding Agent terminal. This guide covers full-animation 2.5.0 on `main`: installation, language, controls and independent settings. [Legacy 2.4.1](https://github.com/KouzakiUmi/pi-furry-partner/tree/legacy) is maintained separately with code improvements and the original v2.4.0 artwork. Code and documentation use Apache-2.0; character artwork and animation are All Rights Reserved.

## Installation and updates

The fully tested environment is **Windows, Pi 1.2.0 and 1.3.0, Windows PowerShell 5.1 and PowerShell 7**. The full suite passes on both releases, and native Chinese UI and concise Pi documentation hints are enabled for both. Upstream also records a historical native check on NixOS 26.05 (Yarara), Pi 1.3.0 and Kitty 0.49.1. It does not establish a fresh acceptance of the current full-animation release on NixOS. Configure Pi and your model provider before installing the extension.

Download a platform package from [full-animation v2.5.0](https://github.com/KouzakiUmi/pi-furry-partner/releases/tag/v2.5.0). Pi uses `-pi-core.tgz`; DSH uses the full `.tgz` without that suffix. Install one edition per host. For the original artwork, see [legacy v2.4.1](https://github.com/KouzakiUmi/pi-furry-partner/tree/legacy). Build **Source code** downloads with `npm run build:animated` before installing a generated platform package.

For Pi, use `pi-furry-partner-full-animation-2.5.0-pi-core.tgz`. Extract the archive, enter its inner **`package` directory**, fully exit Pi, and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
pi
```

The installer deploys to `~/.pi/agent/extensions/pi-furry-partner/` and installs `pi-furry-night`. It manages four Pi UI settings: `theme`, `quietStartup`, `collapseChangelog` and `tuiMode`. It uses fullscreen only if the mode is unset; existing mode choices, model/provider settings and unrelated packages are preserved. The execution-policy option applies only to this process.

Updates preserve existing 2.x companion preferences. The installer migrates only legacy style values to their canonical IDs; other configuration content is preserved. The installer can back up and migrate the former `pi-wink-companion` installation, then archive the old extension directory to prevent duplicate loading. Fully exit and restart Pi after an installation or migration.

### DSH desktop installation

Use the full package in the terminal provided by DSH, for example:

```sh
dsh plugin --profile desktop add "./pi-furry-partner-full-animation-2.5.0.tgz"
```

Replace `desktop` if using another profile. The official command installs and registers the declared bundle; restart DSH after updating to load the new code. DSH does not use Pi's `install.ps1`. See the [official CLI reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md).

Build the platform package before installing from source. Existing Pi script installations should keep that update route, avoiding duplicate loading from an earlier package-manager source. To upgrade preview.6, run the installer from the 2.5.0 package and restart Pi; publishing a release does not update an installed copy.


## Terminal requirements and high-resolution display

High-resolution portraits support **Kitty Graphics Protocol and Sixel**, each requiring terminal support. Character-block mode still supports the plugin and animation. On Windows, use **Windows Terminal 1.22 or newer**; check Settings → About and update through Microsoft Store. Microsoft's [1.22 announcement](https://devblogs.microsoft.com/commandline/windows-terminal-preview-1-22-release/) describes built-in Sixel support, which normally requires no extra setting. PowerShell is the shell; updating PowerShell alone does not add graphics support to an old terminal.

1. Launch Pi in your terminal. The default `renderer: "auto"` prefers the Kitty image capability detected by Pi, then selects Sixel when `WT_SESSION` is set and `TMUX` is absent, otherwise character blocks. The Sixel fallback is an environment heuristic, not a terminal-version probe. Upgrades preserve renderer preferences.
2. Run `/mascot` to inspect the selected renderer, then `/mascot demo` to check actual display. Stop with `/mascot demo off`.
3. Use `/mascot render auto` to restore automatic selection after manually choosing blocks. Use `/mascot render kitty` or `/mascot render sixel` when the terminal supports that protocol. This selects plugin output; it cannot add protocol support to a terminal.
4. For missing, garbled or misplaced portraits, update the terminal and retry directly in local Windows Terminal without tmux, SSH or an embedded terminal. Use `/mascot render blocks` for a usable fallback while investigating the terminal and forwarding path.

The plugin encodes Kitty PNG and Sixel itself; libsixel, chafa and ffmpeg are not required. The installer does not edit Windows Terminal settings, install/update the terminal or set persistent environment variables. No separate graphics-enabling script is needed. Upstream records a historical native check on NixOS 26.05 (Yarara), Pi 1.3.0 and Kitty 0.49.1 (`TERM=xterm-kitty`): display, animation, renderer switching and ordinary interaction worked. Thanks to [@srcres258](https://github.com/srcres258) for the implementation and validation in [PR #1](https://github.com/KouzakiUmi/pi-furry-partner/pull/1).

## Language

```text
/mascot language auto
/mascot language en
/mascot language zh-CN
/mascot language status
```

The choice is saved in the extension's `config.json` under `language`. The default, `auto`, detects the system language: Chinese environments use `zh-CN`; other languages use `en`. Existing configurations without this field also use automatic detection, while an explicit language preference is preserved. `zh` remains an alias for Simplified Chinese. Use `auto` to resume following the system, and `status` to inspect the preference and resolved language. Detection checks locale environment variables first, then the Windows UI culture when available, with the runtime locale as a fallback. It resolves at startup; selecting `auto` again refreshes detection.

Companion status phrases, speech bubbles, editor controls, quick actions and information panels update immediately. The current task, input draft and animation timing continue. The default character name/subtitle becomes **Umi / Your coding companion** in English and “呜咪 / 你的工作搭档” in Chinese. Custom names and subtitles remain unchanged.

| Independent setting | Simplified Chinese mode | English mode |
| --- | --- | --- |
| `locale` | Applies the native Chinese UI patch when enabled | Pauses that patch and retains your preference |
| `prompt` | Condenses recognized native Pi documentation hints into Chinese | Condenses recognized native Pi documentation hints into English |
| `persona` | Adds the Chinese Umi template when enabled | Adds the English Umi template when enabled |

Prompt and persona changes apply to the next request. Language changes do not translate conversation history, code, tool output, model names, paths, custom `SYSTEM.md` files or project `AGENTS.md` instructions.

## States and animation

The companion reacts to actual Pi events: model thinking, text output, tool execution, user questions, context compaction and the turn's outcome. Editing uses a typing motion, while running commands uses a magnifying glass that scans from side to side. Searching and compaction share a MiniMax-H3 paper-pile animation: 72 complete cels and 72 playback steps over 6.58 seconds, with coordinated head, tail, body, cloak and page movement. Runtime does not independently warp these parts. The tail remains dark gray at its tip, light gray in the middle and white at the root, joining the white rump. Speech uses `w / — / o / O` shapes and stops when text output stops.

The magnifier scan uses a continuous MiniMax-H3 animation made from the approved character artwork. Its background is removed and complete cels are prepared offline. The head and gripping paw follow the lens, which enlarges the eye when it passes in front of it. The cloak moves with the body and keeps a clean outline. Runtime only plays the cels in order, without local lens deformation or dissolving neighboring scan cels together. Illustrated and pixel styles share the timing. Older six-frame packs still play their own sequence, while two-frame packs retain a static pose and blink fallback.

The released magnifier has 64 video cels and one eye-only blink, arranged into 66 playback steps over 6.58 seconds. Its opening 420ms inspection hold becomes 200ms open, 80ms closed and 140ms open; other motion cels last at least 80ms. Offline processing extracts a separate grayscale matte from the green signal, inverts it for alpha, and recovers foreground color. The 640px masters and film retain soft alpha; the 240px terminal edge approximates antialiasing over the matching black background, while the 80px style keeps crisp pixel coverage. See the [asset workflow](../CONTRIBUTING.md#角色视频与透明边缘).

The startup wake-up lasts about five seconds. Waiting for your answer produces a curious head tilt and question mark; after ten seconds, Umi dozes off. Resuming work triggers a short startled wake-up. These are visual reactions and do not delay tools or model output.

Short editing/running reactions remain visible for about 1.2 seconds, with a buffer before returning to thinking. The real status text updates immediately. Narrow or short terminals collapse the large portrait to preserve editing space. The `Motion: On` / `Motion: Off` control shows the current state. Turning it off pauses looping motion while static poses still update with agent activity; an intentional poke still plays its short reaction. Pi keeps working.

The canonical style IDs are `umi` and `umi-pixel`, matching the English character name **Umi**. The former style IDs are no longer accepted: an old saved configuration falls back to the default style at runtime, and the installer rewrites it to the canonical ID. Asset directory names match the canonical IDs.

`umi-pixel` keeps the illustrated character's proportions, features and poses at 80 × 80. Local protection preserves fine mouth strokes that a sampling point could otherwise miss, with a gentle color adjustment around the lines. The magnifier, listening pose and other reactions retain the same character design.

After you send, the editor status shows request preparation, waiting for the first output, or thinking received while waiting for answer text, together with elapsed seconds. If no first output arrives after 10 seconds of waiting, it says so explicitly; after 15 seconds, the indicator uses a warning color. The wait indicator still updates once a second with looping motion off. The indicator follows local lifecycle events and returns to the appropriate activity when tool work or a visible response starts.

With motion enabled, actual draft changes while Umi is idle or awaiting your answer make him lift a gray paw to his ear, lean in and nod. After about 1.8 seconds without typing, he returns to the previous state. Cursor movement alone does not trigger this reaction, active tool work keeps its pose, and poking takes precedence. Sending the draft moves into request preparation and response waiting.

Caption and portrait widths are independent: the normal portrait stays 16 × 8 cells. At 80–119 terminal columns, the caption expands to 20 cells, the portrait is centered with a two-cell inset, and the editor starts four cells farther right. At 120 columns or more, captions can use 24 cells. The 60–79-column layout stays compact; smaller or shorter terminals still collapse the portrait. English reserves two cells between the text and each paw, and longer text is clipped to the actual terminal width.

## Mouse and keyboard

In **fullscreen**, the lower edge of the editor contains clickable controls, with model, thinking and more actions on the right. Clicking the character gives Umi a gentle poke: a brief `>w<` face, a little scrunch and wiggle, and a random line in the current language. The wiggle is gentler and the reply stays focused on the task while he's busy, and becomes more playful when he's idle, followed by a return to the current activity. Use `/mascot pause` or `/mascot play` to control animation playback. Dragging to select text is not treated as a button click.

2.3.0 addressed misplaced stripes caused by selection slices duplicating image OSC markers. 2.3.1 separately fixes duplicated private caret APC-BEL markers leaving the output parser waiting for a terminator, which caused black portrait stripes and stalled subsequent text. Native drag events remain available, and Pi retains the draft, caret and submission behavior. Regression checks use real Pi selection and output protocols, including split writes; they are not native-screen acceptance for every terminal environment.

In **regular**, the same space displays keyboard hints instead of mouse buttons. Pi's current native key mappings are used where available. The menu is always accessible through **Ctrl+Alt+W** or `/mascot menu`. Changing TUI mode in `/settings` updates the controls immediately while preserving your editor and draft. `/mascot poke` works in either mode and does not interrupt agent work.

The quick menu offers model selection, thinking level, usage, tool details, session history, conversation tree, branching, copying the latest answer, tool-output expansion, thinking-text visibility and an external editor. Actions unavailable during work are omitted or disabled. These use Pi's native handlers.

Usage panels show session data Pi has already recorded. Missing values stay unavailable; they do not query account balance or provider limits. Tool panels are read-only and do not execute tools or reveal call arguments. Use arrows and PgUp/PgDn to browse, Home/End to jump, and Enter/Esc to return.

## Commands

Use `/mascot` for current settings. The command values remain the same in both languages.

| Commands | Purpose |
| --- | --- |
| `/mascot language auto` / `en` / `zh-CN` / `status` | Follow the system, choose a language, or inspect the result |
| `/mascot menu` | Open quick actions |
| `/mascot poke` | Give Umi a gentle poke without interrupting the agent |
| `/mascot style umi` / `umi-pixel` | Illustrated or pixel Umi |
| `/mascot style pixel` / `illustration` | Earlier header styles retained for comparison |
| `/mascot layout editor` / `header` | Input-area companion or startup header |
| `/mascot pause` / `play` | Disable or enable looping motion; static activity poses keep updating |
| `/mascot on` / `off` | Show or hide the companion |
| `/mascot size auto` / `small` / `compact` / `normal` / `large` | Choose a size within terminal limits |
| `/mascot render auto` / `kitty` / `sixel` / `blocks` | Select graphics transport |
| `/mascot info compact` / `native` | Compact or native footer |
| `/mascot locale on` / `off` / `status` | Native Chinese UI preference |
| `/mascot prompt on` / `off` / `status` | Concise bilingual Pi documentation-hint preference |
| `/mascot persona on` / `off` / `status` | Umi's character voice |
| `/mascot demo` / `/mascot demo all` | Cycle through all animations without model calls |
| `/mascot demo thinking` / `speaking` / `waking` | Preview one state without model calls |
| `/mascot demo off` | Return to the real session |

The full demo uses an independent 70.9-second looping timeline, including listening and a poke reaction. Its 7.4-second running stage shows an entire 6.58-second magnifier cycle; searching and compaction each have 7.2 seconds. The 12.5-second waiting stage allows dozing after ten seconds, followed by a startled wake-up. It does not execute tools, request or switch models, change the draft, save settings, or mutate real tool state. `/mascot demo off` or a new real agent task exits. If animation is paused, run `/mascot play` first. Full reaction demos use the `editor` layout.

Single-state demos still respond to actual typing and intentional pokes; the full tour uses its own timing for these reactions so short external events cannot scramble the sequence.

Single-state demos also include `idle`, `reading`, `editing`, `running`, `searching`, `waiting`, `success`, `error`, `cancelled` and `compacting`.

## Independent text features

`locale` and `prompt` default to enabled; `persona` defaults to disabled. `/mascot off` hides the companion and restores native visual elements, while the three text preferences keep their own settings.

The native Chinese compatibility layer strictly targets known **Pi 1.2.0 and 1.3.0** structures and fixed labels, including 24 built-in command descriptions. Dynamic text, tool output, identifiers and stored values remain intact. Unknown versions or structures retain the original behavior. Pi's installed files are not rewritten.

The prompt option condenses only the precisely recognized native Pi documentation-hint section, using Chinese or English according to the resolved language. Documentation paths, complete-file reading and cross-reference requirements remain. Pi's identity preamble, tool list and rules stay native, so later extensions can still add tools, snippets and guidelines dynamically. Custom `SYSTEM.md`, forced prompts, custom documentation sections, project `AGENTS.md`, skills and other dynamic context remain unchanged. Disabling the option removes the documentation-section replacement from the next request. It never forces a whole rendered system prompt. Concise wording does not guarantee a fixed token reduction.

The persona is gentle, cute, lively and playful, but serious about important work. Technical accuracy, code and structured output take priority. Chinese uses `prompts/umi-persona.md`; English uses `prompts/umi-persona.en.md`. They share the same independent persona switch. The template is added as its own `umi_persona` section, preserving subsequent extension contributions. Ordinary progress, explanations, debugging and delivery also use natural Umi phrasing and expressive sounds such as Hm, Mmm, Eep, Hehe and a small awoo, without a fixed quota or repetitive catchphrase while accurate technical work remains the priority. Template edits affect the next request; historical messages are not rewritten.

## Rendering and troubleshooting

Kitty and Sixel require terminal support. `auto` prefers Pi's detected Kitty image capability, then Sixel in Windows Terminal, then true-color half-blocks. Force `/mascot render blocks` if images are missing or the terminal shows protocol text. Font, DPI and terminal dimensions affect the result.

For missing portraits, first check `/mascot on`, available terminal space, and whether another extension already owns the editor. The extension preserves another custom editor; use the header layout or review that extension combination. In regular mode, controls are keyboard hints by design.

If you see duplicate companions, remove one installation source or complete the old-name migration. Do not manually copy an archived extension back into Pi's auto-discovered extensions directory.

## Backups and removal

The Windows installer backs up the old extension, theme, settings and installation record before replacing files. Its uninstall workflow restores a managed Pi field only when the current value still equals the installed value, so later user changes are preserved. See the detailed [Chinese recovery guide](guide.zh-CN.md#备份卸载与恢复) for the exact script options and recovery rules.

Packages installed through Pi should be removed through Pi's package manager, rather than the Windows uninstall script. Do not mix removal routes.

## Development, previews and rights

Local animation, language processing, read-only panels and demos make no additional model requests. Normal Pi conversations and explicitly chosen summaries use your existing model configuration. Non-interactive JSON/RPC use does not display or install these interactive UI features.

The preview PNGs/GIFs are offline compositions exported from production state and animation code. They are not captures of a native terminal window. `preview.html` is a local demonstration; it does not change the real Pi session. Optional showcase source in `site/` is retained and has not been published as a separate website.

Run `npm test` from the project directory. The full suite passes with actual Pi 1.2.0 and 1.3.0 modules, including activity, listening, response waiting, real extension integration, Kitty, Sixel and mouse routing, multi-row SGR selection and input after release. Native Chinese UI and concise documentation hints are enabled for both guarded releases, and CI runs both. See [Contributing](../CONTRIBUTING.md) for setup, isolated installer checks and preview builds. The tested scope does not cover every terminal, font, window size or extension combination.

Code and documentation are [Apache-2.0](../LICENSE). **Umi's character design, photographs, illustrations, pixel art, animation frames and character-containing previews are All Rights Reserved.** The code license does not grant reuse rights to those assets. See [ASSET_LICENSE.md](../ASSET_LICENSE.md).
