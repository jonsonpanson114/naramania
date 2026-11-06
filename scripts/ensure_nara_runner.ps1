# 奈良県 runner が止まっていたら起動し直す。タスク NaramaniaNaraRunnerWatchdog が定期的に呼ぶ。
# スタートアップの起動はログオン時だけなので、PCをつけたまま落ちると再起動まで止まり続ける
# (2026-11-03 に認証エラーで落ち、3日間止まっていた)。
#
# 初回の登録はこのスクリプトに -Register を付けて実行する。
param([switch]$Register)

$runnerDir = 'C:\actions-runner\naramania-nara-pref'
$taskName = 'NaramaniaNaraRunnerWatchdog'
$logPath = Join-Path $env:LOCALAPPDATA 'naramania-runner-watchdog.log'

if ($Register) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes 15)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
        -Description 'naramania の奈良県 runner が止まっていたら起動し直す' -Force | Out-Null
    Write-Output "登録しました: $taskName (15分ごと)"
    return
}

if (Get-Process -Name 'Runner.Listener' -ErrorAction SilentlyContinue) { return }

Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/c', "$runnerDir\run.cmd" `
    -WorkingDirectory $runnerDir -WindowStyle Hidden
Add-Content -Path $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') runner を起動しました" -Encoding utf8
