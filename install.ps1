[CmdletBinding()]
param(
    [string]$AgentDir = (Join-Path $HOME '.pi\agent')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$themeName = 'pi-furry-night'
$extensionName = 'pi-furry-partner'
$companionName = ([char]0x545C).ToString() + ([char]0x54AA).ToString()
$startupOptions = @(
    @{ Name = 'quietStartup'; Existed = 'originalQuietStartupPropertyExisted'; Original = 'originalQuietStartup'; Value = 'header' },
    @{ Name = 'collapseChangelog'; Existed = 'originalCollapseChangelogPropertyExisted'; Original = 'originalCollapseChangelog'; Value = $true },
    @{ Name = 'tuiMode'; Existed = 'originalTuiModePropertyExisted'; Original = 'originalTuiMode'; Value = 'fullscreen' }
)
$utf8 = New-Object System.Text.UTF8Encoding($false)
$agentRoot = [System.IO.Path]::GetFullPath($AgentDir).TrimEnd('\', '/')

function Assert-ManagedPath([string]$Path) {
    $full = [System.IO.Path]::GetFullPath($Path)
    $prefix = $agentRoot + [System.IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing a path outside AgentDir: $full"
    }
    # Do not move/copy through a child junction or symbolic link.
    $cursor = $full
    while ($cursor -and -not $cursor.Equals($agentRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -Force -LiteralPath $cursor
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Refusing a managed path containing a junction/symbolic link: $cursor"
            }
        }
        $cursor = [System.IO.Path]::GetDirectoryName($cursor)
    }
    return $full
}

function Write-Json([string]$Path, $Value) {
    $null = Assert-ManagedPath $Path
    $json = ConvertTo-Json -InputObject $Value -Depth 100
    [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, $utf8)
}

function Read-JsonObject([string]$Path) {
    $result = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($null -eq $result -or $result -isnot [System.Management.Automation.PSCustomObject]) {
        throw "Expected a JSON object: $Path"
    }
    return $result
}

function Set-Property($Object, [string]$Name, $Value) {
    $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value -Force
}

$sourceRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$sourcePackagePath = Join-Path $sourceRoot 'package.json'
if (-not (Test-Path -LiteralPath $sourcePackagePath -PathType Leaf)) { throw "Missing package metadata: $sourcePackagePath" }
$sourcePackage = Read-JsonObject $sourcePackagePath
$sourceVersion = [string]$sourcePackage.version
# Validate published SemVer instead of duplicating a release number here.
if ($sourcePackage.name -cne $extensionName -or $sourceVersion -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$') {
    throw 'Expected pi-furry-partner package metadata with a valid SemVer version.'
}
$sourceEntry = Join-Path $sourceRoot 'index.ts'
$sourceTheme = Join-Path $sourceRoot 'themes\pi-furry-night.json'
if (-not (Test-Path -LiteralPath $sourceEntry -PathType Leaf)) { throw "Missing extension source: $sourceEntry" }
if (-not (Test-Path -LiteralPath $sourceTheme -PathType Leaf)) { throw "Missing theme source: $sourceTheme" }
$null = Read-JsonObject $sourceTheme

New-Item -ItemType Directory -Force -Path $agentRoot | Out-Null
$extensionRoot = Assert-ManagedPath (Join-Path $agentRoot 'extensions')
$themeRoot = Assert-ManagedPath (Join-Path $agentRoot 'themes')
$backupsRoot = Assert-ManagedPath (Join-Path $agentRoot 'backups')
$extensionPath = Assert-ManagedPath (Join-Path $extensionRoot $extensionName)
$themePath = Assert-ManagedPath (Join-Path $themeRoot 'pi-furry-night.json')
$settingsPath = Assert-ManagedPath (Join-Path $agentRoot 'settings.json')
$manifestPath = Assert-ManagedPath (Join-Path $agentRoot '.pi-furry-partner-install.json')
$legacyExtension = Assert-ManagedPath (Join-Path $extensionRoot 'pi-wink-companion')
$legacyTheme = Assert-ManagedPath (Join-Path $themeRoot 'pi-wink-night.json')
$legacyManifestPath = Assert-ManagedPath (Join-Path $agentRoot '.pi-wink-companion-install.json')
$legacyManifestExisted = Test-Path -LiteralPath $legacyManifestPath -PathType Leaf
$legacyExtensionExisted = Test-Path -LiteralPath $legacyExtension
$legacyThemeExisted = Test-Path -LiteralPath $legacyTheme
$legacyManifest = if ($legacyManifestExisted) { Read-JsonObject $legacyManifestPath } else { $null }
if ($legacyManifestExisted -and ($legacyManifest.schemaVersion -ne 1 -or -not $legacyManifest.installationId)) {
    throw "Unknown legacy installation manifest. Preserve it and inspect before installing: $legacyManifestPath"
}
$settingsExisted = Test-Path -LiteralPath $settingsPath -PathType Leaf
$settings = if ($settingsExisted) { Read-JsonObject $settingsPath } else { [pscustomobject]@{} }
$hasTheme = $null -ne $settings.PSObject.Properties['theme']
$oldTheme = if ($hasTheme) { $settings.theme } else { $null }
$manifestExisted = Test-Path -LiteralPath $manifestPath -PathType Leaf
$manifest = if ($manifestExisted) { Read-JsonObject $manifestPath } elseif ($legacyManifestExisted) { $legacyManifest } else { $null }
$isUpgrade = $manifestExisted -or $legacyExtensionExisted -or $legacyManifestExisted -or (Test-Path -LiteralPath $extensionPath)
if ($manifestExisted -and ($manifest.schemaVersion -ne 1 -or -not $manifest.installationId)) {
    throw "Unknown installation manifest. Preserve it and inspect before installing: $manifestPath"
}
if ($sourceRoot.StartsWith($extensionPath + '\', [System.StringComparison]::OrdinalIgnoreCase) -or $sourceRoot.Equals($extensionPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Run this installer from the delivered source folder, outside the installed extension directory.'
}
if ($sourceRoot.StartsWith($legacyExtension + '\', [System.StringComparison]::OrdinalIgnoreCase) -or $sourceRoot.Equals($legacyExtension, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Run this installer outside the legacy installed extension directory so its source remains available during migration.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$backupPath = Assert-ManagedPath (Join-Path $backupsRoot "pi-furry-partner-$stamp-$suffix")
$stagePath = Assert-ManagedPath (Join-Path $backupPath 'staged-extension')
New-Item -ItemType Directory -Force -Path $extensionRoot, $themeRoot, $backupPath, $stagePath | Out-Null

if ($settingsExisted) { Copy-Item -LiteralPath $settingsPath -Destination (Join-Path $backupPath 'settings.json') }
if ($manifestExisted) { Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $backupPath 'manifest.json') }
if ($legacyManifestExisted) { Copy-Item -LiteralPath $legacyManifestPath -Destination (Join-Path $backupPath 'legacy-manifest.json') }

# Only one automatic extension entry point is installed. The deliverable's package
# metadata remains suitable for explicit Pi package usage, but is not registered a
# second time in settings.packages or settings.extensions.
foreach ($name in @('index.ts', 'lib', 'assets', 'prompts', 'config.json', 'LICENSE', 'NOTICE', 'ASSET_LICENSE.md')) {
    $source = Join-Path $sourceRoot $name
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $stagePath $name) -Recurse
    }
}
$existingConfig = Assert-ManagedPath (Join-Path $extensionPath 'config.json')
if (-not (Test-Path -LiteralPath $existingConfig -PathType Leaf) -and $legacyExtensionExisted) {
    $existingConfig = Assert-ManagedPath (Join-Path $legacyExtension 'config.json')
}
$stagedConfig = Assert-ManagedPath (Join-Path $stagePath 'config.json')
if (Test-Path -LiteralPath $existingConfig -PathType Leaf) {
    $preferences = Read-JsonObject $existingConfig
    if ($null -ne $preferences.PSObject.Properties['layout']) {
        # An explicit layout identifies a 2.x configuration. Keep the user's
        # complete file, including unknown fields and original formatting.
        Copy-Item -LiteralPath $existingConfig -Destination (Join-Path $stagePath 'config.json') -Force
    } else {
        # Migrate 1.x preferences, retaining animation/rendering/size/enablement
        # and other custom fields. Keep the former style for header mode.
        $previousStyle = $preferences.PSObject.Properties['style']
        $headerStyle = if ($null -ne $previousStyle -and @('pixel', 'illustration') -contains $previousStyle.Value) { $previousStyle.Value } else { 'pixel' }
        Set-Property $preferences 'headerStyle' $headerStyle
        Set-Property $preferences 'layout' 'editor'
        Set-Property $preferences 'style' 'wumi'
        Set-Property $preferences 'name' $companionName
        Set-Property $preferences 'info' 'compact'
        Set-Property $preferences 'persona' $false
        Write-Json $stagedConfig $preferences
    }
} else {
    $preferences = if (Test-Path -LiteralPath $stagedConfig -PathType Leaf) { Read-JsonObject $stagedConfig } else { [pscustomobject]@{} }
    Set-Property $preferences 'layout' 'editor'
    Set-Property $preferences 'style' 'wumi'
    Set-Property $preferences 'name' $companionName
    Set-Property $preferences 'info' 'compact'
    Write-Json $stagedConfig $preferences
}
Write-Json (Join-Path $stagePath 'package.json') ([ordered]@{ name = $extensionName; version = $sourceVersion; private = $true; type = 'module' })

$extensionExisted = Test-Path -LiteralPath $extensionPath
$themeFileExisted = Test-Path -LiteralPath $themePath
$savedExtension = Assert-ManagedPath (Join-Path $backupPath 'previous-extension')
$savedTheme = Assert-ManagedPath (Join-Path $backupPath 'previous-theme.json')
if ($null -eq $manifest) {
    $manifest = [pscustomobject][ordered]@{
        schemaVersion = 1
        installationId = [Guid]::NewGuid().ToString('D')
        installedAt = [DateTimeOffset]::Now.ToString('o')
        originalSettingsExisted = [bool]$settingsExisted
        originalThemePropertyExisted = [bool]($hasTheme -and -not ($legacyExtensionExisted -and $oldTheme -ceq 'pi-wink-night'))
        originalTheme = $(if ($legacyExtensionExisted -and $oldTheme -ceq 'pi-wink-night') { $null } else { $oldTheme })
        originalExtensionExisted = [bool]$extensionExisted
        originalExtensionBackup = $(if ($extensionExisted) { $savedExtension } else { $null })
        originalThemeFileExisted = [bool]$themeFileExisted
        originalThemeFileBackup = $(if ($themeFileExisted) { $savedTheme } else { $null })
        initialBackup = $backupPath
    }
}
# A renamed managed install carries the FIRST install's recovery baseline.
# Its pre-existing files belong at the legacy paths when finally uninstalled.
if ($null -eq $manifest.PSObject.Properties['recoveryExtensionPath']) {
    Set-Property $manifest 'recoveryExtensionPath' $(if (-not $manifestExisted -and $legacyManifestExisted) { $legacyExtension } else { $extensionPath })
    Set-Property $manifest 'recoveryThemePath' $(if (-not $manifestExisted -and $legacyManifestExisted) { $legacyTheme } else { $themePath })
}
# Schema 1 installations from the first release do not have these two baselines.
# Capture each newly managed field before changing settings, while retaining the
# original theme and first backup from the existing installation record.
foreach ($option in $startupOptions) {
    if ($null -eq $manifest.PSObject.Properties[$option.Existed]) {
        $property = $settings.PSObject.Properties[$option.Name]
        Set-Property $manifest $option.Existed ([bool]($null -ne $property))
        Set-Property $manifest $option.Original $(if ($null -ne $property) { $property.Value } else { $null })
    }
}
Write-Json (Join-Path $stagePath '.pi-furry-partner-managed.json') ([ordered]@{ installationId = $manifest.installationId; installedAt = [DateTimeOffset]::Now.ToString('o') })
$movedExtension = $false
$movedTheme = $false
$placedExtension = $false
$placedTheme = $false
$settingsWritten = $false
$movedLegacyExtension = $false
$movedLegacyTheme = $false
$movedLegacyManifest = $false
try {
    # Archive the previous automatic entry point before exposing the new one.
    # No recursive deletion: all versions/configs remain recoverable.
    if ($legacyExtensionExisted) {
        Move-Item -LiteralPath $legacyExtension -Destination (Join-Path $backupPath 'legacy-extension')
        $movedLegacyExtension = $true
    }
    if ($legacyThemeExisted) {
        Move-Item -LiteralPath $legacyTheme -Destination (Join-Path $backupPath 'legacy-theme.json')
        $movedLegacyTheme = $true
    }
    if ($legacyManifestExisted) {
        Move-Item -LiteralPath $legacyManifestPath -Destination (Join-Path $backupPath 'legacy-installation.json')
        $movedLegacyManifest = $true
    }
    if ($extensionExisted) {
        $null = Assert-ManagedPath $extensionPath
        Move-Item -LiteralPath $extensionPath -Destination $savedExtension
        $movedExtension = $true
    }
    if ($themeFileExisted) {
        $null = Assert-ManagedPath $themePath
        Move-Item -LiteralPath $themePath -Destination $savedTheme
        $movedTheme = $true
    }
    Move-Item -LiteralPath $stagePath -Destination $extensionPath
    $placedExtension = $true
    Copy-Item -LiteralPath $sourceTheme -Destination $themePath
    $placedTheme = $true
    if (-not $isUpgrade -or $oldTheme -ceq 'pi-wink-night' -or $oldTheme -ceq $themeName) {
        Set-Property $settings 'theme' $themeName
    }
    foreach ($option in $startupOptions) {
        # Respect an existing display mode, including regular; both are supported.
        # Reinstalls also retain the user's later startup preferences.
        $property = $settings.PSObject.Properties[$option.Name]
        if ($null -eq $property -or (-not $isUpgrade -and $option.Name -ne 'tuiMode')) {
            Set-Property $settings $option.Name $option.Value
        }
    }
    $settingsWritten = $true
    Write-Json $settingsPath $settings
    Set-Property $manifest 'lastBackup' $backupPath
    Set-Property $manifest 'updatedAt' ([DateTimeOffset]::Now.ToString('o'))
    Set-Property $manifest 'installedExtensionPath' $extensionPath
    Set-Property $manifest 'installedThemePath' $themePath
    Set-Property $manifest 'installedThemeSha256' ((Get-FileHash -LiteralPath $themePath -Algorithm SHA256).Hash)
    Write-Json $manifestPath $manifest
} catch {
    $failure = $_
    # Preserve unsuccessful payloads too; rollback never recursively deletes files.
    if ($placedExtension -and (Test-Path -LiteralPath $extensionPath)) {
        $null = Assert-ManagedPath $extensionPath
        Move-Item -LiteralPath $extensionPath -Destination (Join-Path $backupPath 'failed-extension')
    }
    if ($placedTheme -and (Test-Path -LiteralPath $themePath)) {
        $null = Assert-ManagedPath $themePath
        Move-Item -LiteralPath $themePath -Destination (Join-Path $backupPath 'failed-theme.json')
    }
    if ($movedExtension) { Move-Item -LiteralPath $savedExtension -Destination $extensionPath }
    if ($movedTheme) { Move-Item -LiteralPath $savedTheme -Destination $themePath }
    if ($settingsWritten) {
        if ($settingsExisted) {
            Copy-Item -LiteralPath (Join-Path $backupPath 'settings.json') -Destination $settingsPath -Force
        } else {
            Move-Item -LiteralPath $settingsPath -Destination (Join-Path $backupPath 'failed-settings.json')
        }
    }
    if ($movedLegacyExtension) { Move-Item -LiteralPath (Join-Path $backupPath 'legacy-extension') -Destination $legacyExtension }
    if ($movedLegacyTheme) { Move-Item -LiteralPath (Join-Path $backupPath 'legacy-theme.json') -Destination $legacyTheme }
    if ($movedLegacyManifest) { Move-Item -LiteralPath (Join-Path $backupPath 'legacy-installation.json') -Destination $legacyManifestPath }
    if ($manifestExisted) {
        Copy-Item -LiteralPath (Join-Path $backupPath 'manifest.json') -Destination $manifestPath -Force
    } elseif (Test-Path -LiteralPath $manifestPath) {
        Move-Item -LiteralPath $manifestPath -Destination (Join-Path $backupPath 'failed-manifest.json')
    }
    throw $failure
}

Write-Host "Installed Pi Furry Partner: $extensionPath"
Write-Host "Theme: $themeName"
Write-Host 'Layout: editor companion; existing regular/fullscreen mode is preserved.'
Write-Host 'Fresh startup: header retained, resource list hidden, changelog collapsed; upgrades preserve current choices.'
Write-Host "Backup: $backupPath"
Write-Host 'Restart Pi for TUI mode changes. /reload reloads extensions but does not replace the active renderer.'
