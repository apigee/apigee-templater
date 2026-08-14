$ErrorActionPreference = "Stop"

$Repo = "apigee/apigee-templater"
$BinaryName = "aft-windows-x64.exe"
$DownloadUrl = "https://github.com/$Repo/releases/latest/download/$BinaryName"

$InstallDir = "$env:LocalAppData\Programs\aft"
$ExePath = "$InstallDir\aft.exe"

Write-Host "Downloading Apigee Feature Templater (aft) for Windows (x64)..." -ForegroundColor Cyan

if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Invoke-WebRequest -Uri $DownloadUrl -OutFile $ExePath

# Add to user PATH if not already present
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -split ";" -notcontains $InstallDir) {
    Write-Host "Adding $InstallDir to user PATH..." -ForegroundColor Yellow
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    $env:Path = "$env:Path;$InstallDir"
}

Write-Host "`nSuccessfully installed 'aft' to $ExePath" -ForegroundColor Green
Write-Host "Run 'aft -h' to get started! (You may need to restart your terminal)" -ForegroundColor Green
