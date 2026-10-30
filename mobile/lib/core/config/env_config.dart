import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

/// All HTTP clients use a backend origin here; /api is appended exactly once.
class EnvConfig {
  static String resolveBackendBaseUrl({
    required TargetPlatform platform,
    Map<String, String> environment = const {},
    String target = '',
    String override = '',
  }) {
    final configuredTarget = target.trim().isNotEmpty
        ? target.trim()
        : (environment['BACKEND_TARGET'] ?? 'auto').trim();
    final selected = configuredTarget.isEmpty || configuredTarget == 'auto'
        ? (platform == TargetPlatform.android ? 'android-emulator' : 'linux')
        : configuredTarget;
    final defaults = {
      'linux': 'http://localhost:4000',
      'android-emulator': 'http://10.0.2.2:4000',
      // USB devices use `adb reverse tcp:4000 tcp:4000`; LAN/HTTPS deployments
      // supply an explicit URL instead. Never embed a developer's private IP.
      'android-device': 'http://localhost:4000',
    };
    if (!defaults.containsKey(selected)) {
      throw ArgumentError('Unknown BACKEND_TARGET: $selected');
    }
    final profileKey =
        'BACKEND_${selected.toUpperCase().replaceAll('-', '_')}_URL';
    final candidates = [
      override,
      environment['BACKEND_API_BASE_URL'] ?? '',
      environment[profileKey] ?? '',
      defaults[selected]!
    ];
    final raw = candidates
        .firstWhere((v) => v.trim().isNotEmpty)
        .trim()
        .replaceFirst(RegExp(r'/+$'), '')
        .replaceFirst(RegExp(r'/api$'), '');
    final uri = Uri.tryParse(raw);
    if (uri == null ||
        !['http', 'https'].contains(uri.scheme) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment) {
      throw ArgumentError(
          'BACKEND_API_BASE_URL must be an HTTP(S) backend URL');
    }
    return raw;
  }

  static String get backendBaseUrl => resolveBackendBaseUrl(
        platform: defaultTargetPlatform,
        environment: dotenv.isInitialized ? dotenv.env : const {},
        target: const String.fromEnvironment('BACKEND_TARGET'),
        override: const String.fromEnvironment('BACKEND_API_BASE_URL'),
      );
  static String get apiBaseUrl => '$backendBaseUrl/api';
  static String get browserBaseUrl {
    final browser = dotenv.isInitialized
        ? (dotenv.env['FAYDA_BROWSER_BASE_URL'] ?? '')
        : '';
    return browser.trim().isEmpty
        ? backendBaseUrl
        : resolveBackendBaseUrl(
            platform: defaultTargetPlatform, override: browser);
  }
}
