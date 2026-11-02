import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/data/remote/telebirr_demo_api.dart';
import 'package:smart_agri_marketplace/data/remote/wallet_api.dart';
import 'package:smart_agri_marketplace/features/transactions_escrow/presentation/screens/telebirr_demo_screen.dart';
import 'package:smart_agri_marketplace/features/transactions_escrow/presentation/screens/wallet_screen.dart';

class DemoApi extends TelebirrDemoApi {
  @override
  Future<List<Map<String, dynamic>>> history() async => [];
  int creates = 0, approvals = 0, gets = 0;
  bool offline = false, lostResponse = false;
  Completer<void>? hold;
  String? lastKey;
  Map<String, dynamic> payment = {
    'payment_id': 'demo-id',
    'reference': 'DEMO-TB-test',
    'amount': '5000.00',
    'status': 'PENDING_AUTHORIZATION',
    'ledger_reference': null,
    'expires_at':
        DateTime.now().add(const Duration(minutes: 5)).toIso8601String(),
  };
  @override
  Future<Map<String, dynamic>> create(String amount, String key) async {
    creates++;
    lastKey = key;
    if (offline) throw Exception('offline');
    await hold?.future;
    return {...payment};
  }

  @override
  Future<Map<String, dynamic>> get(String id) async {
    gets++;
    if (offline) throw Exception('offline');
    return {...payment};
  }

  @override
  Future<Map<String, dynamic>> act(
      String id, String action, String amount) async {
    approvals++;
    if (offline) throw Exception('offline');
    await hold?.future;
    payment = {
      ...payment,
      'status': action == 'approve'
          ? 'CREDITED'
          : action == 'decline'
              ? 'DECLINED'
              : 'CANCELLED',
      'ledger_reference': action == 'approve' ? 'ledger-demo' : null
    };
    if (lostResponse) throw Exception('response lost');
    return {...payment};
  }
}

class DemoWallet extends WalletApi {
  DemoWallet(this.enabled);
  final bool enabled;
  int summaries = 0;
  @override
  Future<Map<String, dynamic>> summary() async {
    summaries++;
    return {
      'wallet_type': 'buyer',
      'available': '0.00',
      'held': '0.00',
      'pending': '0.00',
      'disputed': '0.00',
      'refunds': '0.00',
      'settlements': '0.00',
      'pending_checkout': '0.00',
      'top_up_enabled': true,
      'telebirr_simulation_enabled': enabled,
    };
  }

  @override
  Future<Map<String, dynamic>> history(int offset) async =>
      {'items': <Map<String, dynamic>>[], 'has_more': false};
}

void main() {
  Future<void> show(WidgetTester t, DemoApi api,
      {bool existing = false}) async {
    await t.pumpWidget(MaterialApp(
        home: TelebirrDemoScreen(
            api: api, payment: existing ? api.payment : null)));
    await t.pump();
  }

  Future<void> create(WidgetTester t) async {
    await t.tap(find.text('Continue'));
    await t.pumpAndSettle();
  }

  testWidgets('disclosure always visible; review has no PIN entry', (t) async {
    final api = DemoApi();
    await show(t, api);
    expect(find.text('Demo only — No real money will be transferred.'),
        findsOneWidget);
    await create(t);
    expect(find.text('Merchant: Smart Agricultural Marketplace Demo'),
        findsOneWidget);
    expect(find.text('Amount: 5000.00 ETB'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.text('Approve Demo Payment'), findsOneWidget);
  });
  testWidgets('amount validation rejects zero and excessive precision',
      (t) async {
    final api = DemoApi();
    await show(t, api);
    for (final value in ['0', '-1', '1.001']) {
      await t.enterText(find.byType(TextField), value);
      await t.tap(find.text('Continue'));
      await t.pump();
      expect(find.textContaining('Enter a positive'), findsOneWidget);
    }
    expect(api.creates, 0);
  });
  testWidgets('approval displays only backend confirmed successful credit',
      (t) async {
    final api = DemoApi();
    await show(t, api);
    await create(t);
    expect(find.text('Demo Payment Successful'), findsNothing);
    await t.tap(find.text('Approve Demo Payment'));
    await t.pumpAndSettle();
    expect(api.approvals, 1);
    expect(find.text('Demo Payment Successful'), findsOneWidget);
    expect(find.text('View Wallet'), findsOneWidget);
  });
  testWidgets('decline never displays success', (t) async {
    final api = DemoApi();
    await show(t, api);
    await create(t);
    await t.tap(find.text('Decline'));
    await t.pumpAndSettle();
    expect(find.text('Demo payment declined. No funds were added.'),
        findsOneWidget);
    expect(find.text('Demo Payment Successful'), findsNothing);
  });
  testWidgets('lost approval response recovers durable server status',
      (t) async {
    final api = DemoApi()..lostResponse = true;
    await show(t, api);
    await create(t);
    await t.tap(find.text('Approve Demo Payment'));
    await t.pumpAndSettle();
    expect(api.approvals, 1);
    expect(api.gets, 2);
    expect(find.text('Demo Payment Successful'), findsOneWidget);
  });
  testWidgets('offline approval cannot be submitted or credited', (t) async {
    final api = DemoApi();
    await show(t, api);
    await create(t);
    api.offline = true;
    await t.tap(find.text('Approve Demo Payment'));
    await t.pumpAndSettle();
    expect(api.approvals, 0);
    expect(find.textContaining('Network required'), findsOneWidget);
    expect(find.text('Demo Payment Successful'), findsNothing);
  });
  testWidgets('lost create response reuses idempotency key', (t) async {
    final api = DemoApi()..offline = true;
    await show(t, api);
    await create(t);
    final key = api.lastKey;
    api.offline = false;
    await t.tap(find.text('Recover payment request'));
    await t.pumpAndSettle();
    expect(api.lastKey, key);
    expect(api.creates, 2);
  });
  testWidgets('double taps disabled during pending authorization', (t) async {
    final api = DemoApi();
    await show(t, api);
    await create(t);
    api.hold = Completer<void>();
    await t.tap(find.text('Approve Demo Payment'));
    await t.pump();
    await t.tap(find.text('Approve Demo Payment'));
    await t.pump();
    expect(api.approvals, 1);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    api.hold!.complete();
    await t.pumpAndSettle();
  });
  testWidgets('expired local timer blocks approval; refresh uses server status',
      (t) async {
    final api = DemoApi();
    api.payment['expires_at'] =
        DateTime.now().subtract(const Duration(minutes: 1)).toIso8601String();
    await show(t, api, existing: true);
    final button = t.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Approve Demo Payment'));
    expect(button.onPressed, isNull);
    api.payment['status'] = 'EXPIRED';
    await t.tap(find.text('Refresh payment status'));
    await t.pumpAndSettle();
    expect(find.text('Demo authorization expired. No funds were added.'),
        findsOneWidget);
  });
  testWidgets(
      'wallet Add Funds preserves instant top up and hides disabled methods',
      (t) async {
    await t.pumpWidget(MaterialApp(home: WalletScreen(api: DemoWallet(false))));
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('Add Funds'));
    await t.tap(find.text('Add Funds'));
    await t.pumpAndSettle();
    expect(find.text('Instant Demo Top-up'), findsOneWidget);
    expect(find.text('Telebirr Demo Payment'), findsNothing);
    expect(
        t
            .widget<ListTile>(find.widgetWithText(ListTile, 'Telebirr UAT'))
            .enabled,
        false);
  });
  testWidgets(
      'wallet simulation selection returns to authoritative balance refresh',
      (t) async {
    final wallet = DemoWallet(true), api = DemoApi();
    await t
        .pumpWidget(MaterialApp(home: WalletScreen(api: wallet, demoApi: api)));
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('Add Funds'));
    await t.tap(find.text('Add Funds'));
    await t.pumpAndSettle();
    await t.tap(find.text('Telebirr Demo Payment'));
    await t.pumpAndSettle();
    await create(t);
    await t.tap(find.text('Approve Demo Payment'));
    await t.pumpAndSettle();
    final count = wallet.summaries;
    await t.tap(find.text('View Wallet'));
    await t.pumpAndSettle();
    expect(wallet.summaries, count + 1);
    expect(find.text('Wallet & Escrow'), findsOneWidget);
  });
}
