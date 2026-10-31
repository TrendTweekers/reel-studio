# Keeps the PC from going to sleep while the Klipownia server runs (the Mac uses caffeinate).
# start.ps1 runs this hidden with the node process id. The request ends when node ends.
param([Parameter(Mandatory = $true)][int]$NodePid)
Add-Type -Namespace Klipownia -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$ES_CONTINUOUS = [uint32]'0x80000000'
$ES_SYSTEM_REQUIRED = [uint32]'0x00000001'
# The request belongs to this thread, so this process must stay alive while node lives.
[void][Klipownia.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED)
try {
  Wait-Process -Id $NodePid -ErrorAction SilentlyContinue
} finally {
  [void][Klipownia.Power]::SetThreadExecutionState($ES_CONTINUOUS)
}
