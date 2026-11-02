import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Only consumes backend-issued initialization data. No keys/tokens/signing here.
class TelebirrSdk {
  static const channel = MethodChannel('smart_agri/telebirr_uat');
  bool get supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<bool> available() async {
    if (!supported) return false;
    try {
      return (await channel.invokeMapMethod<String, dynamic>(
              'availability'))?['available'] ==
          true;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  Future<Map<String, dynamic>> start(
      String fundingId, Map<String, dynamic> initialization) async {
    if (!supported) {
      throw PlatformException(
          code: 'UNSUPPORTED_PLATFORM',
          message: 'Telebirr UAT requires Android');
    }
    final data = <String, String>{'fundingId': fundingId};
    for (final key in ['appId', 'receiveCode', 'shortCode']) {
      final value = initialization[key];
      if (value is! String || value.trim().isEmpty) {
        throw PlatformException(
            code: 'INVALID_ARGUMENTS',
            message: 'Missing SDK initialization data');
      }
      data[key] = value;
    }
    return Map<String, dynamic>.from(await channel
            .invokeMapMethod<String, dynamic>('startTelebirrPayment', data) ??
        {'outcome': 'interrupted'});
  }
}
