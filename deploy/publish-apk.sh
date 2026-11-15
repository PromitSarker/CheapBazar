#!/usr/bin/env bash
# Publish the built Android app so the website serves it at /app (download page) and /downloads/<file>.
#   mobile/: flutter build apk --release ...   then   deploy/publish-apk.sh
# Keeps the last 3 versions; latest.json tells the page which one is current. No restart needed.
set -euo pipefail
cd "$(dirname "$0")/.."
APK="mobile/build/app/outputs/flutter-apk/app-release.apk"
[ -f "$APK" ] || { echo "ABORT: $APK not found - build it first (see mobile/README.md)"; exit 1; }
VERSION="$(grep -E '^version:' mobile/pubspec.yaml | head -1 | sed -E 's/version:\s*//; s/\+.*//' | tr -d ' ')"
BUILD="$(grep -E '^version:' mobile/pubspec.yaml | head -1 | sed -E 's/.*\+//' | tr -d ' ')"
FILE="cheapbazar-${VERSION}-${BUILD}.apk"
mkdir -p downloads
cp "$APK" "downloads/$FILE"
SIZE=$(stat -c %s "downloads/$FILE")
SHA=$(sha256sum "downloads/$FILE" | cut -d' ' -f1)
printf '{"version":"%s","build":%s,"file":"%s","size":%s,"sha256":"%s","builtAt":"%s"}\n' "$VERSION" "$BUILD" "$FILE" "$SIZE" "$SHA" "$(date -u +%FT%TZ)" > downloads/latest.json.tmp
mv downloads/latest.json.tmp downloads/latest.json
ls -1t downloads/cheapbazar-*.apk | tail -n +4 | xargs -r rm -f
echo "published $FILE ($((SIZE/1024/1024)) MB, sha256 $SHA)"
