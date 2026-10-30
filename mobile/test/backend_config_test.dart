import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/core/config/env_config.dart';
import 'package:smart_agri_marketplace/data/remote/listings_api.dart';

void main() {
  test('saved target selects USB phone without a launch flag', () {
    expect(
        EnvConfig.resolveBackendBaseUrl(
            platform: TargetPlatform.android,
            environment: {'BACKEND_TARGET': 'android-device'}),
        'http://localhost:4000');
    expect(
        EnvConfig.resolveBackendBaseUrl(
            platform: TargetPlatform.android,
            target: 'android-emulator',
            environment: {'BACKEND_TARGET': 'android-device'}),
        'http://10.0.2.2:4000');
  });
  test('Linux and emulator select backend port 4000', () {
    expect(EnvConfig.resolveBackendBaseUrl(platform: TargetPlatform.linux),
        'http://localhost:4000');
    expect(EnvConfig.resolveBackendBaseUrl(platform: TargetPlatform.android),
        'http://10.0.2.2:4000');
  });
  test('physical Android USB profile and explicit deployed endpoint', () {
    expect(
        EnvConfig.resolveBackendBaseUrl(
            platform: TargetPlatform.android, target: 'android-device'),
        'http://localhost:4000');
    expect(
        EnvConfig.resolveBackendBaseUrl(
            platform: TargetPlatform.android,
            target: 'android-device',
            override: 'https://backend.example/api/'),
        'https://backend.example');
  });
  test('profile environment and compile-time override precedence', () {
    expect(
        EnvConfig.resolveBackendBaseUrl(
            platform: TargetPlatform.android,
            environment: {
              'BACKEND_ANDROID_EMULATOR_URL': 'https://profile.example'
            }),
        'https://profile.example');
    expect(
        EnvConfig.resolveBackendBaseUrl(
            platform: TargetPlatform.linux,
            environment: {'BACKEND_API_BASE_URL': 'https://global.example'},
            override: 'https://override.example/api'),
        'https://override.example');
  });
  test('Produce Listing and Debo shared client append api exactly once', () {
    dotenv.loadFromString(
        envString: 'BACKEND_API_BASE_URL=https://shared.example/api/');
    expect(listingApiBase, 'https://shared.example/api');
    expect(EnvConfig.backendBaseUrl, 'https://shared.example');
    expect(EnvConfig.browserBaseUrl, 'https://shared.example');
  });
  test('reject malformed or credential-bearing backend endpoints', () {
    for (final value in [
      'ftp://backend.example',
      'http://user:pass@backend.example',
      'not-a-url',
      'https://backend.example?token=secret'
    ]) {
      expect(
          () => EnvConfig.resolveBackendBaseUrl(
              platform: TargetPlatform.linux, override: value),
          throwsArgumentError);
    }
  });
}
