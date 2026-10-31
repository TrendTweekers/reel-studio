# Stops Klipownia (the background server on port 8787). -Quiet: no pause at the end (used by install.ps1).
param([switch]$Quiet)
$Port = 8787
if ($env:PORT) { $Port = [int]$env:PORT }  # same rule as start.ps1 and the server
$stopped = $false
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($id in ($conns | Select-Object -ExpandProperty OwningProcess -Unique)) {
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  # Only our server (node). Another program on this port is not ours to end.
  if ($p -and $p.ProcessName -eq 'node') {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    $stopped = $true
  }
}
if ($stopped) {
  Write-Host 'Klipownia jest zatrzymana. / Klipownia is stopped.'
  Start-Sleep -Seconds 1  # let Windows release the files
} else {
  Write-Host 'Klipownia nie była uruchomiona. / Klipownia was not running.'
}
if (-not $Quiet) { Start-Sleep -Seconds 2 }
