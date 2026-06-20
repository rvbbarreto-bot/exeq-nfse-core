# Encerra apenas workers BullMQ exeq (preserva API dev e script em execução).
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object {
    $_.CommandLine -and (
      ($_.CommandLine -like '*exeq-nfse-core*' -and $_.CommandLine -like '*worker*') -or
      ($_.CommandLine -like '*exeq-nfse-core*' -and $_.CommandLine -like '*nf-polling*')
    ) -and
    $_.CommandLine -notlike '*server.ts*' -and
    $_.CommandLine -notlike '*homolog-emission*'
  } |
  ForEach-Object {
    Write-Host "KILL worker $($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
