import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/data/remote/transactions_api.dart';
import 'package:smart_agri_marketplace/features/transactions_escrow/presentation/screens/escrow_status_screen.dart';
import 'package:smart_agri_marketplace/features/transactions_escrow/presentation/screens/payment_method_screen.dart';

class DemoApi extends TransactionsApi {
  DemoApi() : super(dio: Dio());
  final calls = <Map<String, dynamic>>[];
  @override
  String? get currentUserId => 'supabase-subject';
  @override
  Future<Map<String, dynamic>> get(String id) async => {
        'transaction_id': id,
        'buyer_id': 'application-buyer',
        'is_buyer': true,
        'amount': '10.08',
        'payment_status': calls.isEmpty ? 'pending' : 'simulated_paid',
        'checkout_status': calls.isEmpty ? 'pending' : 'fulfilling',
        'checkout_expires_at': '2026-10-30T12:30:00Z',
        'balances': {
          'held': calls.isEmpty ? '0.00' : '10.08',
          'refunded': '0.00'
        },
        'allocations': [],
        'history': [],
      };
  @override
  Future<void> action(String id, String action,
      [Map<String, dynamic>? data]) async {
    calls.add({'path': action, 'data': data});
  }
}

void main() {
  testWidgets(
      'buyer reviews exact server amount and explicitly confirms simulation',
      (tester) async {
    final api = DemoApi();
    await tester.pumpWidget(MaterialApp(
        home: EscrowStatusScreen(transactionId: 'order', api: api)));
    await tester.pumpAndSettle();
    expect(find.textContaining('ETB 10.08'), findsOneWidget);
    expect(find.textContaining('No provider is contacted'), findsOneWidget);
    expect(find.text('Awaiting Simulated Payment'), findsOneWidget);
    expect(find.textContaining('held: ETB 0.00'), findsNothing);
    await tester.scrollUntilVisible(
        find.text('Confirm demo payment'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm demo payment'));
    await tester.pumpAndSettle();
    expect(api.calls, isEmpty);
    expect(
        find.textContaining('No real money will be collected'), findsOneWidget);
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();
    expect(api.calls.single['path'], 'simulate-payment');
    expect(api.calls.single['data'], {'method': 'telebirr'});
    expect(find.text('Confirm demo payment'), findsNothing);
    expect(find.text('Held in escrow'), findsOneWidget);
    expect(find.textContaining('ETB 10.08'), findsWidgets);
    expect(find.text('DEMO FUNDS'), findsOneWidget);
  });
  testWidgets(
      'checkout stays scrollable on short phones and labels methods simulated',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const MaterialApp(
        home: PaymentScreen(
            listingId: 'listing',
            farmerId: 'farmer',
            amount: 10.08,
            cropType: 'Teff',
            quantity: '1')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Simulated Telebirr'), 180,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Simulated Telebirr'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Simulated CBE Birr'), 180,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Simulated CBE Birr'), findsOneWidget);
    await tester.scrollUntilVisible(
        find.text('Review authoritative checkout'), 180,
        scrollable: find.byType(Scrollable).first);
    expect(tester.takeException(), isNull);
  });
  test(
      'API verifies current account before initiating checkout, never pays on review',
      () async {
    final paths = <String>[];
    final dio = Dio(BaseOptions(baseUrl: 'http://test.invalid'));
    dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      paths.add(o.path);
      h.resolve(Response(
          requestOptions: o,
          statusCode: 200,
          data: o.path == '/auth/me'
              ? {'user_id': 'application-buyer', 'role': 'buyer'}
              : {
                  'transaction': {
                    'transaction_id': 'order',
                    'amount': '10.08',
                    'payment_status': 'pending'
                  }
                }));
    }));
    final result = await TransactionsApi(dio: dio)
        .initiate({'listing_id': 'listing', 'payment_method': 'telebirr'});
    expect(result['amount'], '10.08');
    expect(paths, ['/auth/me', '/transactions/initiate']);
    expect(result['payment_status'], 'pending');
  });
  testWidgets(
      'farmer mismatch explains buyer access and offers account switching without initiating checkout',
      (tester) async {
    final paths = <String>[];
    final dio = Dio(BaseOptions(baseUrl: 'http://test.invalid'));
    dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      paths.add(o.path);
      h.resolve(Response(
          requestOptions: o,
          statusCode: 200,
          data: {'user_id': 'farmer', 'role': 'farmer'}));
    }));
    await tester.pumpWidget(MaterialApp(
        home: PaymentScreen(
            listingId: 'listing',
            farmerId: 'owner',
            amount: 10.08,
            cropType: 'Teff',
            api: TransactionsApi(dio: dio))));
    await tester.scrollUntilVisible(find.text('Simulated Telebirr'), 150,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Simulated Telebirr'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
        find.text('Review authoritative checkout'), 150,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Review authoritative checkout'));
    await tester.pumpAndSettle();
    expect(paths, ['/auth/me']);
    expect(find.textContaining('registered as farmer'), findsOneWidget);
    await tester.scrollUntilVisible(
        find.text('Sign in with another account / register'), 150,
        scrollable: find.byType(Scrollable).first);
    expect(
        find.text('Sign in with another account / register'), findsOneWidget);
  });
}
