# Install n9router tray — download latest release installer and run it (Windows)
# Usage: irm https://raw.githubusercontent.com/nightwalker89/n9router-tray/main/scripts/install.ps1 | iex

$ErrorActionPreference = "Stop"
$Repo = "nightwalker89/n9router-tray"

function Info($m) { Write-Host "[n9tray] $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[n9tray] $m" -ForegroundColor Green }
function Die($m)  { Write-Host "[n9tray] $m" -ForegroundColor Red; exit 1 }

Info "Fetching latest release from GitHub..."
try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" `
        -Headers @{ "User-Agent" = "n9tray-cli" }
} catch {
    Die "Failed to fetch release info: $_"
}

# Prefer NSIS setup .exe; fall back to any .exe, then .msi.
$asset = $release.assets | Where-Object { $_.name -match "setup\.exe$" } | Select-Object -First 1
if (-not $asset) { $asset = $release.assets | Where-Object { $_.name -match "\.exe$" } | Select-Object -First 1 }
if (-not $asset) { $asset = $release.assets | Where-Object { $_.name -match "\.msi$" } | Select-Object -First 1 }
if (-not $asset) { Die "No Windows installer (.exe/.msi) found in latest release" }

$tmp = Join-Path $env:TEMP $asset.name
Info "Downloading $($asset.name) ($($release.tag_name))..."
try {
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp -Headers @{ "User-Agent" = "n9tray-cli" }
} catch {
    Die "Download failed: $_"
}

Info "Installing..."
if ($tmp -match "\.msi$") {
    Start-Process -FilePath "msiexec" -ArgumentList "/i", "`"$tmp`"", "/passive" -Wait
} else {
    # NSIS silent install (/S). currentUser install mode => no elevation needed.
    Start-Process -FilePath $tmp -ArgumentList "/S" -Wait
}

Remove-Item $tmp -ErrorAction SilentlyContinue

Ok "Installed n9router tray."
Ok ""
Ok "Launch from the Start Menu, or install the CLI for easier access:"
Ok "  npm i -g n9tray"
Ok "  n9tray"
