[CmdletBinding()]
param(
    [string]$WorkDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'work\installer-tests'),
    [string]$ReportPath
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $ReportPath) { $ReportPath = Join-Path $PSScriptRoot 'installer-validation.json' }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$source = Split-Path -Parent $PSScriptRoot
$install = Join-Path $source 'install.ps1'
$uninstall = Join-Path $source 'uninstall.ps1'
$name = ([char]0x545C).ToString() + ([char]0x54AA).ToString()
$root = Join-Path ([System.IO.Path]::GetFullPath($WorkDir)) ([Guid]::NewGuid().ToString('N'))
$checks = New-Object 'System.Collections.Generic.List[string]'
function Save([string]$Path, [string]$Text) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Text, $utf8)
}
function Read([string]$Path) { [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json }
function Assert($Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
    $checks.Add($Message)
}
$sourceVersion = (Read (Join-Path $source 'package.json')).version

# Bad release metadata must fail before touching the destination installation.
$invalidSource = Join-Path $root 'invalid-package-source'
New-Item -ItemType Directory -Force -Path $invalidSource | Out-Null
Copy-Item -LiteralPath $install -Destination (Join-Path $invalidSource 'install.ps1')
foreach ($invalidVersion in @('01.2.3', '1.02.3', '1.2.03', '1.2.3-01', '1.2.3-', 'not-a-version')) {
    Save (Join-Path $invalidSource 'package.json') (ConvertTo-Json -InputObject @{name='pi-furry-partner';version=$invalidVersion})
    $badAgent = Join-Path $root 'invalid-package-destination'
    $rejectedVersion = $false
    try { & (Join-Path $invalidSource 'install.ps1') -AgentDir $badAgent } catch { $rejectedVersion = $true }
    Assert ($rejectedVersion -and -not (Test-Path -LiteralPath $badAgent)) ('invalid SemVer is rejected before destination writes: ' + $invalidVersion)
}

$agent = Join-Path $root 'upgrade'
$settingsPath = Join-Path $agent 'settings.json'
$configPath = Join-Path $agent 'extensions\pi-furry-partner\config.json'
$manifestPath = Join-Path $agent '.pi-furry-partner-install.json'
Save $settingsPath '{"theme":"before-wumi","defaultProvider":"keep-provider","defaultModel":"keep-model","packages":["keep-package"],"custom":{"nested":7}}'
& $install -AgentDir $agent
$config = Read $configPath
$manifest = Read $manifestPath
$firstId = $manifest.installationId
$firstBackup = $manifest.initialBackup
Assert ($config.layout -eq 'editor' -and $config.style -eq 'umi' -and $config.name -ceq $name -and $config.info -eq 'compact') 'fresh installation selects editor/umi/Chinese name/compact info'
Assert ($config.language -ceq 'auto') 'fresh installation follows the system language by default'
Assert ($config.persona -eq $false) 'fresh installation leaves the optional persona disabled'
Assert ($config.chineseUI -eq $true -and $config.compactPrompt -eq $true) 'fresh installation enables independent native UI and compact Chinese prompt preferences'
foreach ($personaTemplate in @('umi-persona.md', 'umi-persona.en.md')) {
    $installedTemplate = Join-Path $agent ('extensions\pi-furry-partner\prompts\' + $personaTemplate)
    Assert (Test-Path -LiteralPath $installedTemplate -PathType Leaf) ($personaTemplate + ' is installed alongside the extension')
    Assert ((Get-FileHash -LiteralPath $installedTemplate -Algorithm SHA256).Hash -ceq (Get-FileHash -LiteralPath (Join-Path $source ('prompts\' + $personaTemplate)) -Algorithm SHA256).Hash) ($personaTemplate + ' matches the source template exactly')
}
Assert (Test-Path -LiteralPath (Join-Path $agent 'extensions\pi-furry-partner\prompts\pi-system-zh.md') -PathType Leaf) 'native Chinese prompt template is installed separately from the persona template'
foreach ($rightsFile in @('LICENSE', 'NOTICE', 'ASSET_LICENSE.md')) {
    if (Test-Path -LiteralPath (Join-Path $source $rightsFile)) {
        Assert (Test-Path -LiteralPath (Join-Path $agent ('extensions\pi-furry-partner\' + $rightsFile)) -PathType Leaf) ($rightsFile + ' accompanies the installed runtime')
    }
}
Assert ((Read (Join-Path $agent 'extensions\pi-furry-partner\package.json')).version -ceq $sourceVersion) ('installed package retains extension name and source release version ' + $sourceVersion)
$settings = Read $settingsPath
Assert ($settings.defaultProvider -eq 'keep-provider' -and $settings.defaultModel -eq 'keep-model' -and $settings.packages[0] -eq 'keep-package' -and $settings.custom.nested -eq 7) 'fresh install retains model/provider/packages/other settings'
Assert ($settings.theme -eq 'pi-furry-night' -and $settings.quietStartup -ceq 'header' -and $settings.collapseChangelog -eq $true -and $settings.tuiMode -ceq 'fullscreen') 'four managed Pi UI settings including fullscreen are applied'
Assert (-not $manifest.originalTuiModePropertyExisted -and $null -eq $manifest.originalTuiMode) 'originally missing tuiMode is recorded as missing'

# Model the 1.x installation record and preferences before upgrading in place.
$legacy = [ordered]@{name='WINK';subtitle=$name;animation=$false;renderer='blocks';style='illustration';size='small';optimizeEditor=$false;enabled=$false;userOption=@{value=23}}
$legacyRaw = ConvertTo-Json -InputObject $legacy -Depth 30
Save $configPath $legacyRaw
& $install -AgentDir $agent
$config = Read $configPath
$manifest = Read $manifestPath
Assert ($config.layout -eq 'editor' -and $config.style -eq 'umi' -and $config.headerStyle -eq 'illustration' -and $config.name -ceq $name -and $config.info -eq 'compact') '1.x upgrade enables the editor companion with the canonical umi ID and preserves its old style as headerStyle'
Assert ($config.persona -eq $false) '1.x upgrade leaves the new persona opt-in'
Assert ($config.animation -eq $false -and $config.renderer -eq 'blocks' -and $config.size -eq 'small' -and $config.optimizeEditor -eq $false -and $config.enabled -eq $false -and $config.userOption.value -eq 23) '1.x upgrade retains animation/renderer/size/enabled/editor/custom preferences'
Assert ($config.subtitle -ceq $name) 'UTF-8 Chinese preference survives migration in this PowerShell runtime'
Assert ($manifest.installationId -eq $firstId -and $manifest.initialBackup -eq $firstBackup -and $manifest.originalTheme -eq 'before-wumi') 'upgrade retains initial manifest identity/theme/backup'
$backupConfig = Join-Path $manifest.lastBackup 'previous-extension\config.json'
Assert ([System.IO.File]::ReadAllText($backupConfig, [System.Text.Encoding]::UTF8) -ceq $legacyRaw) 'the complete original 1.x config is backed up unchanged'

$v2Raw = @'
{
  "layout": "header",
  "style": "illustration",
  "headerStyle": "pixel",
  "name": "Custom Companion",
  "info": "native",
  "persona": true,
  "chineseUI": false,
  "compactPrompt": false,
  "language": "en",
  "animation": false,
  "renderer": "blocks",
  "size": "compact",
  "customFutureField": { "keep": true }
}
'@
$withoutPersona = $v2Raw -replace '(?m)^[ \t]*"persona": true,\r?\n', ''
Save $configPath $withoutPersona
$withoutPersonaBytes = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($configPath))
& $install -AgentDir $agent
Assert ([Convert]::ToBase64String([System.IO.File]::ReadAllBytes($configPath)) -ceq $withoutPersonaBytes -and $null -eq (Read $configPath).PSObject.Properties['persona']) 'existing 2.x config without persona is retained without adding a field'
Save $configPath $v2Raw
$v2Bytes = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($configPath))
& $install -AgentDir $agent
Assert ([Convert]::ToBase64String([System.IO.File]::ReadAllBytes($configPath)) -ceq $v2Bytes) '2.x explicit-layout configuration remains byte-for-byte unchanged'
Assert ((Read $configPath).persona -eq $true) '2.x user persona selection survives reinstall'
Assert ((Read $configPath).chineseUI -eq $false -and (Read $configPath).compactPrompt -eq $false) 'disabled Chinese UI and native prompt preferences survive reinstall independently of persona'
Assert ((Read $configPath).language -ceq 'en') 'an explicit English language choice survives upgrade'
$manifest = Read $manifestPath
Assert ($manifest.originalTheme -eq 'before-wumi' -and $manifest.initialBackup -eq $firstBackup) 'repeated 2.x installation retains the original recovery baseline'
Assert (-not $manifest.originalTuiModePropertyExisted) 'repeat installation retains the first missing tuiMode baseline'

# Rename only a root legacy style, even with minified/nested/escaped fields and
# UTF-8 BOM. Keep all other preference bytes and the original recoverable copy.
foreach ($styleCase in @(
    @{ Old = '{"layout":"editor","custom":{"style":"wumi","text":"wumi"},"style":"wumi","language":"zh-CN","persona":true}'; New = '{"layout":"editor","custom":{"style":"wumi","text":"wumi"},"style":"umi","language":"zh-CN","persona":true}' },
    @{ Old = '{"layout":"editor","nested":[{"style":"wumi-pixel"}],"\u0073tyle":"wumi-pixel","language":"en","persona":false}'; New = '{"layout":"editor","nested":[{"style":"wumi-pixel"}],"\u0073tyle":"umi-pixel","language":"en","persona":false}' }
)) {
    $rawLegacy = ([char]0xFEFF).ToString() + $styleCase.Old + "`r`n"
    $rawCanonical = ([char]0xFEFF).ToString() + $styleCase.New + "`r`n"
    Save $configPath $rawLegacy
    & $install -AgentDir $agent
    Assert ([Convert]::ToBase64String([System.IO.File]::ReadAllBytes($configPath)) -ceq [Convert]::ToBase64String($utf8.GetBytes($rawCanonical))) '2.x style migration changes only the root style value; nested values, BOM, formatting and other preferences survive'
    $backupConfig = Join-Path (Read $manifestPath).lastBackup 'previous-extension\config.json'
    Assert ([Convert]::ToBase64String([System.IO.File]::ReadAllBytes($backupConfig)) -ceq [Convert]::ToBase64String($utf8.GetBytes($rawLegacy))) '2.x style migration archives the complete original preference bytes'
}

$settings = Read $settingsPath
$settings | Add-Member -NotePropertyName addedLater -NotePropertyValue 'keep-later'
Save $settingsPath (ConvertTo-Json -InputObject $settings -Depth 30)
& $uninstall -AgentDir $agent
$settings = Read $settingsPath
Assert ($settings.theme -eq 'before-wumi' -and $settings.addedLater -eq 'keep-later' -and $settings.defaultModel -eq 'keep-model') 'uninstall restores the original theme and retains subsequent unrelated settings'
Assert ($null -eq $settings.PSObject.Properties['quietStartup'] -and $null -eq $settings.PSObject.Properties['collapseChangelog'] -and $null -eq $settings.PSObject.Properties['tuiMode']) 'uninstall removes all startup fields that originally did not exist'
Assert (-not (Test-Path -LiteralPath (Join-Path $agent 'extensions\pi-furry-partner'))) 'uninstall archives the extension instead of deleting user configuration'

# A pre-fullscreen schema 1 record captures the current mode at the upgrade,
# retains earlier recovery fields, and restores regular only when still managed.
$agent = Join-Path $root 'regular-mode-upgrade'
$settingsPath = Join-Path $agent 'settings.json'
$manifestPath = Join-Path $agent '.pi-furry-partner-install.json'
Save $settingsPath '{"theme":"regular-before","tuiMode":"regular","defaultModel":"keep-regular-model"}'
& $install -AgentDir $agent
$manifest = Read $manifestPath
Assert ($manifest.originalTuiModePropertyExisted -and $manifest.originalTuiMode -ceq 'regular') 'an existing regular mode is recorded and preserved during installation'
Assert ((Read $settingsPath).tuiMode -ceq 'regular') 'installer preserves an existing regular display mode'
$originalId = $manifest.installationId
$originalBackup = $manifest.initialBackup
$manifest.PSObject.Properties.Remove('originalTuiModePropertyExisted')
$manifest.PSObject.Properties.Remove('originalTuiMode')
Save $manifestPath (ConvertTo-Json -InputObject $manifest -Depth 30)
$settings = Read $settingsPath
$settings.tuiMode = 'regular'
Save $settingsPath (ConvertTo-Json -InputObject $settings -Depth 30)
& $install -AgentDir $agent
$manifest = Read $manifestPath
Assert ($manifest.originalTuiModePropertyExisted -and $manifest.originalTuiMode -ceq 'regular' -and $manifest.installationId -eq $originalId -and $manifest.initialBackup -eq $originalBackup -and $manifest.originalTheme -eq 'regular-before') 'legacy manifest upgrade adds the tuiMode baseline without resetting existing recovery fields'
& $install -AgentDir $agent
Assert ((Read $manifestPath).originalTuiMode -ceq 'regular') 'reinstall retains the original regular mode instead of treating fullscreen as original'
& $uninstall -AgentDir $agent
$settings = Read $settingsPath
Assert ($settings.tuiMode -ceq 'regular' -and $settings.theme -eq 'regular-before' -and $settings.defaultModel -eq 'keep-regular-model') 'uninstall restores original regular mode and retains model configuration'

$agent = Join-Path $root 'later-user-mode'
$settingsPath = Join-Path $agent 'settings.json'
Save $settingsPath '{"theme":"original-mode-theme"}'
& $install -AgentDir $agent
$settings = Read $settingsPath
$settings.tuiMode = 'regular'
$settings | Add-Member -NotePropertyName userModeNote -NotePropertyValue 'keep-later-mode'
Save $settingsPath (ConvertTo-Json -InputObject $settings -Depth 30)
& $uninstall -AgentDir $agent
$settings = Read $settingsPath
Assert ($settings.tuiMode -ceq 'regular' -and $settings.userModeNote -eq 'keep-later-mode') 'uninstall preserves a later user-selected regular mode even when the original mode field was absent'

# A malformed legacy config must fail before replacing its directory or settings.
$agent = Join-Path $root 'invalid-legacy'
$configPath = Join-Path $agent 'extensions\pi-furry-partner\config.json'
Save $configPath '{"broken":'
Save (Join-Path $agent 'extensions\pi-furry-partner\old.txt') 'old-payload'
Save (Join-Path $agent 'settings.json') '{"theme":"keep-invalid-case"}'
$rejected = $false
try { & $install -AgentDir $agent } catch { $rejected = $true }
Assert $rejected 'invalid legacy JSON stops the migration'
Assert ([System.IO.File]::ReadAllText($configPath) -ceq '{"broken":' -and (Test-Path -LiteralPath (Join-Path $agent 'extensions\pi-furry-partner\old.txt'))) 'rejected migration preserves the original config and extension'
Assert ((Read (Join-Path $agent 'settings.json')).theme -eq 'keep-invalid-case') 'rejected migration preserves current settings'

# Rename a managed legacy extension while retaining the FIRST recovery base.
$agent = Join-Path $root 'renamed-managed-install'
$settingsPath = Join-Path $agent 'settings.json'
$legacyPath = Join-Path $agent 'extensions\pi-wink-companion'
$legacyManifestPath = Join-Path $agent '.pi-wink-companion-install.json'
$legacyThemePath = Join-Path $agent 'themes\pi-wink-night.json'
$newPath = Join-Path $agent 'extensions\pi-furry-partner'
$newManifestPath = Join-Path $agent '.pi-furry-partner-install.json'
$baseline = Join-Path $agent 'backups\first-install'
$oldConfig = @'
{
  "layout": "editor",
  "style": "wumi-pixel",
  "persona": true,
  "chineseUI": false,
  "compactPrompt": true,
  "language": "zh-CN",
  "custom": { "remember": "unchanged bytes" }
}
'@
Save (Join-Path $legacyPath 'config.json') $oldConfig
Save (Join-Path $legacyPath 'index.ts') '// legacy entry point'
Save (Join-Path $baseline 'previous-extension\before.txt') 'pre-companion extension'
Save (Join-Path $baseline 'previous-theme.json') '{"name":"original theme file"}'
Save $legacyThemePath '{"name":"pi-wink-night"}'
Save $settingsPath '{"theme":"pi-wink-night","quietStartup":"header","collapseChangelog":true,"tuiMode":"regular","defaultModel":"untouched-model","addedLater":42}'
$legacyRecord = [ordered]@{
 schemaVersion=1;installationId='legacy-first-id';installedAt='2026-01-01T00:00:00Z';initialBackup=$baseline
 originalSettingsExisted=$true;originalThemePropertyExisted=$true;originalTheme='original-theme'
 originalExtensionExisted=$true;originalExtensionBackup=(Join-Path $baseline 'previous-extension')
 originalThemeFileExisted=$true;originalThemeFileBackup=(Join-Path $baseline 'previous-theme.json')
 originalQuietStartupPropertyExisted=$false;originalQuietStartup=$null
 originalCollapseChangelogPropertyExisted=$false;originalCollapseChangelog=$null
 originalTuiModePropertyExisted=$true;originalTuiMode='regular'
}
Save $legacyManifestPath (ConvertTo-Json -InputObject $legacyRecord -Depth 30)
$originalConfigBytes = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes((Join-Path $legacyPath 'config.json')))
& $install -AgentDir $agent
$migrated = Read $newManifestPath
Assert (-not (Test-Path -LiteralPath $legacyPath) -and (Test-Path -LiteralPath (Join-Path $newPath 'index.ts'))) 'rename removes the old automatic entry point before installing the new one'
Assert (-not (Test-Path -LiteralPath $legacyManifestPath) -and (Test-Path -LiteralPath (Join-Path $migrated.lastBackup 'legacy-installation.json'))) 'legacy manifest is archived so the old uninstaller cannot remove the migrated installation'
Assert ([System.IO.File]::ReadAllText((Join-Path $newPath 'config.json'), [System.Text.Encoding]::UTF8) -ceq $oldConfig.Replace('"style": "wumi-pixel"', '"style": "umi-pixel"')) 'rename changes only the legacy style ID and preserves all persona/localization/custom preference text'
Assert ((Read (Join-Path $newPath 'config.json')).language -ceq 'zh-CN') 'an explicit Chinese language choice survives the renamed installation'
Assert ($migrated.installationId -ceq 'legacy-first-id' -and $migrated.initialBackup -ceq $baseline -and $migrated.originalTheme -ceq 'original-theme') 'rename keeps the first-install recovery identity, backup and theme baseline'
Assert ($migrated.recoveryExtensionPath -ceq $legacyPath -and $migrated.recoveryThemePath -ceq $legacyThemePath) 'original pre-plugin files retain their legacy recovery destinations'
$current = Read $settingsPath
Assert ($current.theme -ceq 'pi-furry-night' -and $current.tuiMode -ceq 'regular' -and $current.defaultModel -ceq 'untouched-model' -and $current.addedLater -eq 42) 'renamed theme is selected while preserving mode, model and later settings'
Assert ((Read (Join-Path $newPath 'package.json')).name -ceq 'pi-furry-partner') 'installed package exposes the public identity'
& $install -AgentDir $agent
$migratedAgain = Read $newManifestPath
Assert ($migratedAgain.installationId -ceq $migrated.installationId -and $migratedAgain.recoveryExtensionPath -ceq $legacyPath) 'reinstall after rename does not reset original identity or recovery destinations'
Save (Join-Path $legacyPath 'later-user.txt') 'later install'
$blocked = $false
try { & $uninstall -AgentDir $agent } catch { $blocked = $true }
Assert ($blocked -and (Test-Path -LiteralPath $newPath) -and (Test-Path -LiteralPath $newManifestPath)) 'a later legacy recovery-destination conflict stops uninstall before moving current files'
Move-Item -LiteralPath $legacyPath -Destination (Join-Path $root 'later-legacy-archive')
& $uninstall -AgentDir $agent
Assert (-not (Test-Path -LiteralPath $newPath) -and (Test-Path -LiteralPath (Join-Path $legacyPath 'before.txt'))) 'uninstall archives the new package and restores only the original pre-plugin extension'
Assert ((Read $legacyThemePath).name -ceq 'original theme file' -and (Read $settingsPath).theme -ceq 'original-theme') 'uninstall restores original pre-plugin theme file and setting after rename'
Assert ((Read $settingsPath).tuiMode -ceq 'regular' -and (Read $settingsPath).addedLater -eq 42) 'renamed uninstall retains regular mode and unrelated settings'

$agent = Join-Path $root 'custom-upgrade-choices'
$settingsPath = Join-Path $agent 'settings.json'
& $install -AgentDir $agent
Save $settingsPath '{"theme":"my-custom-theme","tuiMode":"regular","quietStartup":false,"collapseChangelog":false}'
& $install -AgentDir $agent
$current = Read $settingsPath
Assert ($current.theme -ceq 'my-custom-theme' -and $current.tuiMode -ceq 'regular' -and $current.quietStartup -eq $false -and $current.collapseChangelog -eq $false) 'reinstall preserves later user theme, mode and startup choices'

$agent = Join-Path $root 'unmanaged-legacy'
$settingsPath = Join-Path $agent 'settings.json'
$oldPath = Join-Path $agent 'extensions\pi-wink-companion'
$newPath = Join-Path $agent 'extensions\pi-furry-partner'
Save (Join-Path $oldPath 'config.json') $oldConfig
Save (Join-Path $oldPath 'index.ts') '// unmanaged old plugin'
Save $settingsPath '{"theme":"pi-wink-night","tuiMode":"regular","keep":true}'
Save (Join-Path $agent 'themes\pi-wink-night.json') '{"name":"legacy theme"}'
& $install -AgentDir $agent
Assert (-not (Test-Path -LiteralPath $oldPath) -and (Test-Path -LiteralPath $newPath)) 'an unmanaged legacy copy is also archived instead of double-loaded'
Assert ([System.IO.File]::ReadAllText((Join-Path $newPath 'config.json'), [System.Text.Encoding]::UTF8) -ceq $oldConfig.Replace('"style": "wumi-pixel"', '"style": "umi-pixel"')) 'an unmanaged legacy config migrates its style ID while retaining all other text'
& $uninstall -AgentDir $agent
Assert ($null -eq (Read $settingsPath).PSObject.Properties['theme'] -and (Read $settingsPath).keep -eq $true) 'without a prior recovery manifest uninstall removes only the renamed theme selection and retains unrelated settings'
Assert (-not (Test-Path -LiteralPath $oldPath) -and -not (Test-Path -LiteralPath $newPath)) 'uninstall does not reactivate an unmanaged legacy plugin'

$agent = Join-Path $root 'malformed-legacy-name'
$oldPath = Join-Path $agent 'extensions\pi-wink-companion'
Save (Join-Path $oldPath 'config.json') '{"broken":'
Save (Join-Path $oldPath 'index.ts') '// preserve broken-config plugin'
Save (Join-Path $agent 'settings.json') '{"theme":"leave-this"}'
$blocked = $false
try { & $install -AgentDir $agent } catch { $blocked = $true }
Assert ($blocked -and (Test-Path -LiteralPath (Join-Path $oldPath 'index.ts')) -and -not (Test-Path -LiteralPath (Join-Path $agent 'extensions\pi-furry-partner'))) 'malformed config under the legacy name stops before moving any entry point'
Assert ((Read (Join-Path $agent 'settings.json')).theme -ceq 'leave-this') 'malformed legacy-name config preserves current settings'

$run = [ordered]@{
    runtime = $PSVersionTable.PSVersion.ToString()
    edition = $PSVersionTable.PSEdition
    passed = $true
    checkCount = $checks.Count
    checks = $checks.ToArray()
    temporaryAgentRoot = $root
    actualSource = $source
}
$runs = @()
if (Test-Path -LiteralPath $ReportPath) { $previous = Read $ReportPath; $runs = @($previous.runs | Where-Object { $_.runtime -ne $run.runtime }) }
$runs += [pscustomobject]$run
$report = [ordered]@{schemaVersion=1;scope='isolated installer migration and recovery; no model/API invocation';actualUserAgentModified=$false;runs=$runs}
Save $ReportPath (ConvertTo-Json -InputObject $report -Depth 50)
Write-Host "PASS: $($checks.Count) installer checks; report $ReportPath"
