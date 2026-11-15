#!/usr/bin/env bash
# One command: build the APK on this server, then publish it so Account > "Check for updates" offers it.
# Run from the repo that the live site serves (~/E-Bazar-Unified): publish-apk.sh writes ./downloads there.
set -euo pipefail
cd "$(dirname "$0")/.."
deploy/build-apk.sh
deploy/publish-apk.sh
