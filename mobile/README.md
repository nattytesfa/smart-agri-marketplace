# Backend connection

For repeatable USB development, start the backend on port 4000, then run from
`mobile/`:

```bash
bash scripts/run_usb.sh
```

This restores USB forwarding, checks backend health, and selects the connected
phone and its backend profile. Re-run after reconnecting USB. With multiple
devices, select one using `ANDROID_SERIAL=<serial> bash scripts/run_usb.sh`.
Requires `adb`, `curl`, and `flutter` on PATH.

You can also save `BACKEND_TARGET=android-device` in `mobile/.env` to use that
profile with ordinary `flutter run` or IDE launches. Forwarding is still required;
Android can clear it on reconnect/reboot. Use `BACKEND_TARGET=auto` for the normal
Linux/emulator defaults. A `--dart-define=BACKEND_TARGET=...` overrides this setting.

All HTTP clients share `EnvConfig`; Produce Listing and Digital Debo use the same
`/api` base. Backend origins may optionally end in `/api` (normalized once).

- Linux: `flutter run -d linux` → `http://localhost:4000`.
- Android emulator: `flutter run --dart-define=BACKEND_TARGET=android-emulator`
  → `http://10.0.2.2:4000` (also the automatic Android default).
- Physical Android over USB: run `adb reverse tcp:4000 tcp:4000`, then
  `flutter run --dart-define=BACKEND_TARGET=android-device`.
- Physical Android over LAN or a deployed server: supply a reachable origin with
  `--dart-define=BACKEND_API_BASE_URL=https://your-backend.example` (or configure
  `BACKEND_ANDROID_DEVICE_URL` in the ignored `.env`). Never commit private IPs.

Compile-time URL overrides take precedence over `.env`. `BACKEND_API_BASE_URL`
in `.env` is an optional global override; leave it empty to use profile defaults.
Supabase project/auth settings are unchanged. Restart/rebuild after configuration
changes. USB forwarding is a development-only alternative to LAN configuration.
Local HTTP endpoints are supported by the existing debug Android manifest;
release builds must use an HTTPS backend.
Fayda's provider-registered callback is separate from the API origin: preserve
its existing callback configuration/forwarding (including `adb reverse tcp:3000
tcp:4000` if the registered callback specifically requires port 3000).
