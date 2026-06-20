$currentPid = $PID
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object {
    $_.ProcessId -ne $currentPid -and
    $_.CommandLine -and
    $_.CommandLine -notlike '*cursor*' -and
    $_.CommandLine -notlike '*tsserver*' -and
    $_.CommandLine -notlike '*typingsInstaller*'
  } |
  ForEach-Object {
    Write-Host "KILL $($_.ProcessId): $($_.CommandLine.Substring(0, [Math]::Min(100, $_.CommandLine.Length)))"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

# Also kill node processes with empty command line (orphan workers)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { -not $_.CommandLine -or $_.CommandLine -eq '' } |
  ForEach-Object {
    Write-Host "KILL empty-cmd $($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
