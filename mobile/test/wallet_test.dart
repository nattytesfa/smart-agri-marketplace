import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/data/remote/wallet_api.dart';
import 'package:smart_agri_marketplace/data/remote/transactions_api.dart';
import 'package:smart_agri_marketplace/features/transactions_escrow/presentation/screens/escrow_status_screen.dart';
import 'package:smart_agri_marketplace/features/transactions_escrow/presentation/screens/wallet_screen.dart';
import 'package:smart_agri_marketplace/features/transactions_escrow/presentation/widgets/finance_ui.dart';

class FakeWallet extends WalletApi {
  FakeWallet(this.role) : super(dio: Dio());
  final String role;
  final calls = <String>[];
  @override
  Future<Map<String, dynamic>> quote(String id) async => {
        'available': '12500.00',
        'total': '501000.00',
        'remaining': '-488500.00',
        'additional_required': '488500.00'
      };
  @override
  Future<Map<String, dynamic>> summary() async => {
        'wallet_type': role,
        'available': '12500.00',
        'held': '10000.00',
        'pending': '8000.00',
        'disputed': '2000.00',
        'refunds': '0.00',
        'settlements': '12500.00',
        'pending_checkout': '0.00',
        'top_up_enabled': true,
      };
  @override
  Future<Map<String, dynamic>> history(int offset) async =>
      {'items': <Map<String, dynamic>>[], 'has_more': false};
  @override
  Future<Map<String, dynamic>> topUp(String amount, String key) async {
    calls.add('$amount:$key');
    return {'available': '22500.00'};
  }
}

class WalletCheckout extends TransactionsApi {
  WalletCheckout() : super(dio: Dio());
  int mutations = 0;
  @override
  Future<Map<String, dynamic>> get(String id) async => {
        'is_buyer': true,
        'payment_method': 'demo_wallet',
        'amount': '501000.00',
        'payment_status': 'pending',
        'checkout_status': 'pending',
        'balances': {'paid': '0.00'},
        'allocations': [],
        'history': [],
      };
  @override
  Future<void> action(String id, String action,
      [Map<String, dynamic>? data]) async {
    mutations++;
  }
}

class ActivityWallet extends FakeWallet {
  ActivityWallet(super.role);
  @override
  Future<Map<String, dynamic>> history(int offset) async => {
        'items': [
          {
            'event_type': 'checkout_debit',
            'amount': '-501000.00',
            'created_at': '2026-10-30T12:00:00Z',
            'event_id': '12345678-1234-1234-1234-123456789012',
            'transaction_id': null,
            'status': 'completed'
          }
        ],
        'has_more': false,
      };
}

void main() {
  test('display grouping preserves exact signed server decimals', () {
    expect(walletMoney('501000.00'), '501,000.00');
    expect(walletMoney('-0.01'), '-0.01');
    expect(walletMoney('999999999999.99'), '999,999,999,999.99');
  });
  for (final width in [320.0, 390.0, 900.0]) {
    for (final role in ['buyer', 'farmer']) {
      testWidgets(
          '$role wallet fits $width pixels with larger text and activity',
          (tester) async {
        tester.view.physicalSize = Size(width, 700);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(MaterialApp(
            builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: const TextScaler.linear(1.3)),
                child: child!),
            home: WalletScreen(api: ActivityWallet(role))));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.scrollUntilVisible(find.text('Marketplace purchase'), 200,
            scrollable: find.byType(Scrollable).first);
        await tester.pumpAndSettle();
        expect(find.text('ETB -501,000.00'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }
  testWidgets(
      'insufficient wallet quote prevents payment without funding on review',
      (tester) async {
    final api = WalletCheckout();
    await tester.pumpWidget(MaterialApp(
        home: EscrowStatusScreen(
            transactionId: 'order', api: api, walletApi: FakeWallet('buyer'))));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.textContaining('Available ETB 12500.00'), 120,
        scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('Additional funds required ETB 488500.00'),
        findsOneWidget);
    await tester.scrollUntilVisible(find.text('Confirm demo payment'), 120,
        scrollable: find.byType(Scrollable).first);
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Confirm demo payment'))
            .onPressed,
        isNull);
    expect(api.mutations, 0);
  });
  testWidgets(
      'farmer separates earnings, pending and disputes and cannot top up',
      (tester) async {
    await tester
        .pumpWidget(MaterialApp(home: WalletScreen(api: FakeWallet('farmer'))));
    await tester.pumpAndSettle();
    expect(find.text('Available simulated earnings'), findsOneWidget);
    expect(find.text('ETB 8,000.00'), findsOneWidget);
    expect(find.text('ETB 2,000.00'), findsOneWidget);
    expect(find.text('Add Demo Funds'), findsNothing);
    expect(find.textContaining('No Real Money'), findsOneWidget);
  });
  testWidgets('buyer top-up requires explicit confirmation and server result',
      (tester) async {
    final api = FakeWallet('buyer');
    await tester.pumpWidget(MaterialApp(home: WalletScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Add Demo Funds'));
    await tester.tap(find.text('Add Demo Funds'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review'));
    await tester.pumpAndSettle();
    expect(api.calls, isEmpty);
    expect(find.textContaining('Add 10000 ETB in demo funds?'), findsOneWidget);
    await tester.tap(find.text('Add demo funds'));
    await tester.pumpAndSettle();
    expect(api.calls.length, 1);
    expect(find.text('Demo available balance: ETB 22500.00'), findsOneWidget);
  });
}
