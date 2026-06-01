param(
    [string]$Repo = "jonsonpanson114/naramania",
    [string]$RunnerName = "naramania-nara-pref",
    [string]$RunnerDir = "C:\actions-runner\naramania-nara-pref",
    [string]$Labels = "nara-pref"
)

$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

Require-Command "gh"

New-Item -ItemType Directory -Force -Path $RunnerDir | Out-Null
Set-Location $RunnerDir

$latestRelease = gh api repos/actions/runner/releases/latest | ConvertFrom-Json
$asset = $latestRelease.assets | Where-Object { $_.name -match "win-x64.*zip$" } | Select-Object -First 1
if (-not $asset) {
    throw "Could not find a Windows x64 runner asset."
}

$zipPath = Join-Path $RunnerDir $asset.name
if (-not (Test-Path $zipPath)) {
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath
}

if (-not (Test-Path (Join-Path $RunnerDir "config.cmd"))) {
    Expand-Archive -Path $zipPath -DestinationPath $RunnerDir -Force
}

$registration = gh api --method POST repos/$Repo/actions/runners/registration-token | ConvertFrom-Json
$token = $registration.token
if (-not $token) {
    throw "Failed to obtain registration token."
}

$labelList = @("nara-pref", "windows", "x64")
if ($Labels) {
    $labelList += $Labels.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
$labelCsv = ($labelList | Select-Object -Unique) -join ","

& .\config.cmd --unattended --url "https://github.com/$Repo" --token $token --name $RunnerName --labels $labelCsv --replace
& .\run.cmd
