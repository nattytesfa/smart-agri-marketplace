#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Require one connected device, or select one using ANDROID_SERIAL.
serial="$(adb get-serialno)"
adb -s "$serial" reverse tcp:4000 tcp:4000

if ! curl --fail --silent --show-error --max-time 5 \
  http://127.0.0.1:4000/health > /dev/null; then
  echo 'Backend is not responding on port 4000. Start it before launching Flutter.' >&2
  exit 1
fi

exec flutter run -d "$serial" --dart-define=BACKEND_TARGET=android-device "$@"
