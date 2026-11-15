#!/usr/bin/env bash
# User-space Android build toolchain (no sudo): JDK 17, Flutter 3.47.9, Android SDK. Idempotent.
set -euo pipefail
mkdir -p ~/dev && cd ~/dev
echo "[1/5] JDK 17"
if [ ! -x jdk17/bin/java ]; then
  curl -fsSL -o jdk17.tgz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p jdk17 && tar xzf jdk17.tgz -C jdk17 --strip-components=1 && rm jdk17.tgz
fi
export JAVA_HOME=$HOME/dev/jdk17
export ANDROID_HOME=$HOME/dev/android-sdk ANDROID_SDK_ROOT=$HOME/dev/android-sdk
export PATH=$JAVA_HOME/bin:$HOME/dev/flutter/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
java -version 2>&1 | head -1
echo "[2/5] Flutter 3.47.9"
if [ ! -x flutter/bin/flutter ]; then
  curl -fsSL -o flutter.tar.xz "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.47.9-stable.tar.xz"
  tar xJf flutter.tar.xz && rm flutter.tar.xz
fi
echo "[3/5] Android command-line tools"
if [ ! -x android-sdk/cmdline-tools/latest/bin/sdkmanager ]; then
  mkdir -p android-sdk/cmdline-tools
  curl -fsSL -o cl.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  python3 -c "import zipfile; zipfile.ZipFile('cl.zip').extractall('android-sdk/cmdline-tools')"
  rm -rf android-sdk/cmdline-tools/latest && mv android-sdk/cmdline-tools/cmdline-tools android-sdk/cmdline-tools/latest
  chmod +x android-sdk/cmdline-tools/latest/bin/* && rm cl.zip
fi
echo "[4/5] Android SDK packages (same versions as the old build box)"
yes | sdkmanager --licenses >/dev/null 2>&1 || true
sdkmanager "platform-tools" "platforms;android-35" "platforms;android-36" "build-tools;35.0.0" "build-tools;36.0.0" "ndk;28.2.13676358" 2>&1 | tail -3
echo "[5/5] Flutter first run (downloads Dart SDK + Android engine artifacts)"
flutter config --no-analytics >/dev/null 2>&1 || true
flutter config --android-sdk "$ANDROID_HOME" 2>&1 | tail -1
flutter precache --android 2>&1 | tail -2
flutter --version 2>&1 | head -2
df -h / | tail -1
echo TOOLCHAIN_DONE
