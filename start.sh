#!/bin/bash
cd "$(dirname "$0")"
(sleep 3; (xdg-open https://localhost:8443 || open https://localhost:8443) >/dev/null 2>&1) &
python3 server.py
