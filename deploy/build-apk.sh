#!/usr/bin/env bash
# Build the release APK on THIS server (JDK/Flutter/Android SDK from deploy/setup-android-toolchain.sh).
# Runs inside a memory-capped systemd scope because the live site shares this small machine.
# Needs mobile/android/key.properties (+ the .jks it points to) so the APK is signed with the real release key.
#   deploy/build-apk.sh            build, leaves mobile/build/app/outputs/flutter-apk/app-release.apk
set -euo pipefail
export JAVA_HOME=$HOME/dev/jdk17 ANDROID_HOME=$HOME/dev/android-sdk ANDROID_SDK_ROOT=$HOME/dev/android-sdk
export PATH=$JAVA_HOME/bin:$HOME/dev/flutter/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
export FLUTTER_SUPPRESS_ANALYTICS=true CI=true
cd "$(dirname "$0")/../mobile"
[ -f android/key.properties ] || { echo "ABORT: mobile/android/key.properties missing: the APK would not be signed with the release key and could not update the installed app."; exit 1; }
flutter pub get
exec systemd-run --user --scope --quiet -p MemoryMax=2700M -p MemorySwapMax=1500M -p CPUQuota=180% -p IOWeight=20 \
  nice -n 12 flutter build apk --release --target-platform android-arm,android-arm64 --dart-define=API_BASE_URL=https://cheapbazar.org
