import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/core/platform/telebirr_sdk.dart';
import 'package:smart_agri_marketplace/data/remote/telebirr_api.dart';
import 'package:smart_agri_marketplace/features/transactions_escrow/presentation/screens/telebirr_funding_screen.dart';

class FakeApi extends TelebirrApi {
  int creates = 0;
  int verifications = 0;
  bool sdkLaunch = false, interactionReported = false;
  final record = <String, dynamic>{
    'funding_id': '11111111-1111-4111-8111-111111111111',
    'amount': '12.34',
    'status': 'verification_pending',
    'created_at': '2026-10-31',
    'reconciliation_reason': 'VERIFICATION_DOCUMENTATION_REQUIRED',
    'sdk_launch': null,
  };
  @override
  Future<Map<String, dynamic>> capabilities() async => {
        'preorder_enabled': true,
        'sdk_launch_enabled': sdkLaunch,
        'blocker': 'Verification documentation required',
      };
  @override
  Future<Map<String, dynamic>> history(int offset) async => {
        'items': creates > 0 ? [record] : [],
        'has_more': false
      };
  @override
  Future<Map<String, dynamic>> create(String amount, String key) async {
    creates++;
    return record;
  }

  @override
  Future<Map<String, dynamic>> verify(String id,
      {bool interactionEnded = false}) async {
    verifications++;
    interactionReported = interactionEnded;
    return {...record, 'sdk_launch': null, 'status': 'verification_pending'};
  }
}

class FakeSdk extends TelebirrSdk {
  FakeSdk({this.hostAvailable = false, this.outcome = 'sdk_completed'});
  final bool hostAvailable;
  final String outcome;
  int launches = 0;
  @override
  bool get supported => true;
  @override
  Future<bool> available() async => hostAvailable;
  @override
  Future<Map<String, dynamic>> start(
      String fundingId, Map<String, dynamic> initialization) async {
    launches++;
    return {'outcome': outcome};
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  const init = {
    'appId': 'test-app',
    'shortCode': '123456',
    'receiveCode': 'test-only'
  };
  const id = '11111111-1111-4111-8111-111111111111';
  setUp(() => debugDefaultTargetPlatformOverride = TargetPlatform.android);
  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    messenger.setMockMethodCallHandler(TelebirrSdk.channel, null);
  });
  test('unsupported platform handled without channel invocation', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.linux;
    expect(await TelebirrSdk().available(), false);
    await expectLater(
        TelebirrSdk().start(id, init),
        throwsA(isA<PlatformException>()
            .having((e) => e.code, 'code', 'UNSUPPORTED_PLATFORM')));
  });
  test('required SDK parameters validated', () async {
    await expectLater(
        TelebirrSdk().start(id, {}),
        throwsA(isA<PlatformException>()
            .having((e) => e.code, 'code', 'INVALID_ARGUMENTS')));
  });
  test('missing host and unavailable plugin handled', () async {
    messenger.setMockMethodCallHandler(
        TelebirrSdk.channel, (_) async => {'available': false});
    expect(await TelebirrSdk().available(), false);
    messenger.setMockMethodCallHandler(
        TelebirrSdk.channel, (_) async => throw MissingPluginException());
    expect(await TelebirrSdk().available(), false);
  });
  test(
      'platform channel transmits only SDK initialization and local attempt ID',
      () async {
    messenger.setMockMethodCallHandler(TelebirrSdk.channel, (call) async {
      expect(call.method, 'startTelebirrPayment');
      expect(call.arguments, {...init, 'fundingId': id});
      return {'outcome': 'sdk_completed', 'code': 0};
    });
    final result = await TelebirrSdk()
        .start(id, {...init, 'appSecret': 'must-not-cross-channel'});
    expect(result['outcome'], 'sdk_completed');
    expect(result.containsKey('verified'), false);
  });
  for (final outcome in [
    'cancelled',
    'sdk_error',
    'interrupted',
    'host_missing',
    'host_unsupported'
  ]) {
    test('SDK $outcome preserved as interaction only', () async {
      messenger.setMockMethodCallHandler(
          TelebirrSdk.channel, (_) async => {'outcome': outcome});
      expect((await TelebirrSdk().start(id, init))['outcome'], outcome);
    });
  }
  testWidgets(
      'invalid amount rejected; backend pending status never shown as credit/success',
      (tester) async {
    final api = FakeApi();
    debugDefaultTargetPlatformOverride = null;
    await tester.pumpWidget(
        MaterialApp(home: TelebirrFundingScreen(api: api, sdk: FakeSdk())));
    await tester.pumpAndSettle();
    expect(find.textContaining('testbed not installed'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField), '0');
    await tester.tap(find.text('Review UAT funding request'));
    await tester.pumpAndSettle();
    expect(api.creates, 0);
    expect(find.textContaining('between ETB'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField), '12.34');
    await tester.tap(find.text('Review UAT funding request'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create UAT order'));
    await tester.pumpAndSettle();
    expect(api.creates, 1);
    expect(find.textContaining('Verification Pending'), findsWidgets);
    expect(find.textContaining('No Demo Wallet credit'), findsWidgets);
    expect(find.textContaining('Verified Success'), findsNothing);
  });
  for (final outcome in [
    'sdk_completed',
    'cancelled',
    'sdk_error',
    'interrupted'
  ]) {
    testWidgets(
        'SDK $outcome always requests backend verification without claiming success',
        (tester) async {
      debugDefaultTargetPlatformOverride = null;
      final api = FakeApi()..sdkLaunch = true;
      api.record['sdk_launch'] = {
        'appId': 'testmerchant',
        'shortCode': '123456',
        'receiveCode': 'TELEBIRR\$BUYGOODS\$123456\$12.34\$prepaytest\$120m',
      };
      final sdk = FakeSdk(hostAvailable: true, outcome: outcome);
      await tester.pumpWidget(
          MaterialApp(home: TelebirrFundingScreen(api: api, sdk: sdk)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '12.34');
      await tester.tap(find.text('Review UAT funding request'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Create UAT order'));
      await tester.pumpAndSettle();
      expect(sdk.launches, 1);
      expect(api.verifications, 1);
      expect(api.interactionReported, true);
      expect(find.textContaining('Verification Pending'), findsWidgets);
      expect(find.textContaining('Verified Success'), findsNothing);
      expect(find.textContaining('not payment proof'), findsOneWidget);
    });
  }
}
