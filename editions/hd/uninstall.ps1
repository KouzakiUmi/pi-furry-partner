[CmdletBinding()]
param(
    [string]$AgentDir = (Join-Path $HOME '.pi\agent')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$themeName = 'pi-furry-night'
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

function Read-JsonObject([string]$Path) {
    $result = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($null -eq $result -or $result -isnot [System.Management.Automation.PSCustomObject]) {
        throw "Expected a JSON object: $Path"
    }
    return $result
}

function Write-Json([string]$Path, $Value) {
    $null = Assert-ManagedPath $Path
    $json = ConvertTo-Json -InputObject $Value -Depth 100
    [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, $utf8)
}

function Test-ExactValue($Current, $Expected) {
    # PowerShell otherwise considers boolean true equal to a nonempty string.
    return $null -ne $Current -and $Current.GetType() -eq $Expected.GetType() -and $Current -ceq $Expected
}

$manifestPath = Assert-ManagedPath (Join-Path $agentRoot '.pi-furry-partner-install.json')
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    Write-Host "No managed Pi Furry Partner installation was found in: $agentRoot"
    Write-Host 'No files or settings were changed.'
    exit 0
}
$manifest = Read-JsonObject $manifestPath
if ($manifest.schemaVersion -ne 1 -or -not $manifest.installationId) {
    throw "Unknown installation manifest. Inspect before uninstalling: $manifestPath"
}
$extensionPath = Assert-ManagedPath (Join-Path $agentRoot 'extensions\pi-furry-partner')
$themePath = Assert-ManagedPath (Join-Path $agentRoot 'themes\pi-furry-night.json')
$settingsPath = Assert-ManagedPath (Join-Path $agentRoot 'settings.json')
$recoveryExtensionPath = if ($null -ne $manifest.PSObject.Properties['recoveryExtensionPath']) { Assert-ManagedPath ([string]$manifest.recoveryExtensionPath) } else { $extensionPath }
$recoveryThemePath = if ($null -ne $manifest.PSObject.Properties['recoveryThemePath']) { Assert-ManagedPath ([string]$manifest.recoveryThemePath) } else { $themePath }
# Only the two known installation identities can be recovery destinations.
if (@($extensionPath, (Join-Path $agentRoot 'extensions\pi-wink-companion')) -notcontains $recoveryExtensionPath -or
    @($themePath, (Join-Path $agentRoot 'themes\pi-wink-night.json')) -notcontains $recoveryThemePath) {
    throw 'Unsupported recovery destination. Inspect the installation manifest before uninstalling.'
}
$backupsRoot = Assert-ManagedPath (Join-Path $agentRoot 'backups')
# Recorded backup paths are checked again before any move, even if a manifest was edited.
$originalExtension = if ($manifest.originalExtensionExisted) { Assert-ManagedPath ([string]$manifest.originalExtensionBackup) } else { $null }
$originalThemeFile = if ($manifest.originalThemeFileExisted) { Assert-ManagedPath ([string]$manifest.originalThemeFileBackup) } else { $null }
foreach ($savedPath in @($originalExtension, $originalThemeFile)) {
    if ($savedPath -and -not $savedPath.StartsWith($backupsRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "An original backup path is not inside AgentDir/backups: $savedPath"
    }
    if ($savedPath -and -not (Test-Path -LiteralPath $savedPath)) {
        throw "An original backup is missing; uninstall stopped before changing files: $savedPath"
    }
}
if ($originalExtension -and $recoveryExtensionPath -ne $extensionPath -and (Test-Path -LiteralPath $recoveryExtensionPath)) {
    throw 'A legacy extension was installed after migration. Archive it manually before uninstalling to preserve both versions.'
}
if ($originalThemeFile -and $recoveryThemePath -ne $themePath -and (Test-Path -LiteralPath $recoveryThemePath)) {
    throw 'A legacy theme was added after migration. Archive it manually before uninstalling to preserve both versions.'
}
$settings = if (Test-Path -LiteralPath $settingsPath -PathType Leaf) { Read-JsonObject $settingsPath } else { $null }
$changeTheme = $null -ne $settings -and $null -ne $settings.PSObject.Properties['theme'] -and (Test-ExactValue $settings.theme $themeName)
$restoreStartupOptions = @()
if ($null -ne $settings) {
    foreach ($option in $startupOptions) {
        $property = $settings.PSObject.Properties[$option.Name]
        # Old manifests may be uninstalled directly, without first being upgraded.
        if ($null -ne $manifest.PSObject.Properties[$option.Existed] -and $null -ne $property -and (Test-ExactValue $property.Value $option.Value)) {
            $restoreStartupOptions += $option
        }
    }
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$backupPath = Assert-ManagedPath (Join-Path $backupsRoot "pi-furry-partner-uninstall-$stamp-$suffix")
New-Item -ItemType Directory -Force -Path $backupPath | Out-Null
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $backupPath 'manifest.json')
if ($null -ne $settings) { Copy-Item -LiteralPath $settingsPath -Destination (Join-Path $backupPath 'settings.json') }

# Move the current payload into a recoverable archive, including any local edits.
if (Test-Path -LiteralPath $extensionPath) {
    $null = Assert-ManagedPath $extensionPath
    Move-Item -LiteralPath $extensionPath -Destination (Join-Path $backupPath 'removed-extension')
}
if (Test-Path -LiteralPath $themePath) {
    $null = Assert-ManagedPath $themePath
    Move-Item -LiteralPath $themePath -Destination (Join-Path $backupPath 'removed-theme.json')
}
if ($originalExtension) {
    $null = Assert-ManagedPath $originalExtension
    Move-Item -LiteralPath $originalExtension -Destination $recoveryExtensionPath
}
if ($originalThemeFile) {
    $null = Assert-ManagedPath $originalThemeFile
    Move-Item -LiteralPath $originalThemeFile -Destination $recoveryThemePath
}
if ($changeTheme) {
    if ($manifest.originalThemePropertyExisted) {
        $settings | Add-Member -MemberType NoteProperty -Name 'theme' -Value $manifest.originalTheme -Force
    } else {
        $settings.PSObject.Properties.Remove('theme')
    }
}
foreach ($option in $restoreStartupOptions) {
    if ($manifest.PSObject.Properties[$option.Existed].Value) {
        $settings | Add-Member -MemberType NoteProperty -Name $option.Name -Value $manifest.PSObject.Properties[$option.Original].Value -Force
    } else {
        $settings.PSObject.Properties.Remove($option.Name)
    }
}
if ($changeTheme -or $restoreStartupOptions.Count -gt 0) { Write-Json $settingsPath $settings }
$null = Assert-ManagedPath $manifestPath
Move-Item -LiteralPath $manifestPath -Destination (Join-Path $backupPath 'completed-installation.json')
Write-Host 'Pi Furry Partner was uninstalled. Files remain recoverable in:'
Write-Host $backupPath
if ($changeTheme) { Write-Host 'The original theme setting was restored; other current settings were preserved.' }
else { Write-Host 'Your current theme setting was preserved.' }
if ($restoreStartupOptions.Count -gt 0) { Write-Host 'Unchanged startup UI options were restored to their recorded original values.' }
Write-Host 'Restart Pi for TUI mode changes. /reload reloads extensions but does not replace the active renderer.'
