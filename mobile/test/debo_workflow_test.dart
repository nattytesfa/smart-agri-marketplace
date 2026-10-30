import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/data/remote/debo_api.dart';
import 'package:smart_agri_marketplace/features/digital_debo/presentation/screens/debo_batch_detail_screen.dart';
import 'package:smart_agri_marketplace/features/digital_debo/presentation/screens/debo_batch_list_screen.dart';
import 'package:smart_agri_marketplace/features/digital_debo/presentation/screens/debo_join_confirmation_screen.dart';
import 'package:smart_agri_marketplace/features/digital_debo/presentation/screens/debo_request_screen.dart';

Map<String, dynamic> contribution() => {
      'listing_id': 'listing-a',
      'farmer_id': 'farmer-a',
      'farmer_name': 'Farmer A',
      'crop_type': 'Teff',
      'variety': 'White',
      'unit': 'quintal',
      'unit_price': '2000',
      'proposed_quantity': '40',
      'confirmed_quantity': '0',
      'available_quantity': '40',
      'participation_status': 'proposed',
      'reservation_status': 'none',
      'distance_meters': 100
    };
Map<String, dynamic> batch({bool buyer = true}) => {
      'batch_id': 'batch-a',
      'crop_type': 'Teff',
      'buyer_name': 'Buyer',
      'status': 'pending',
      'unit': 'quintal',
      'target_quantity': 100,
      'proposed_quantity': 100,
      'confirmed_quantity': 0,
      'reserved_quantity': 0,
      'fulfilled_quantity': 0,
      'remaining_quantity': 100,
      'completion_percentage': 0,
      'estimated_total': 200000,
      'confirmed_total': 0,
      'can_manage': buyer,
      'legacy': false,
      'transaction_ready': false,
      'created_at': '2026-10-29',
      'expires_at': '2026-11-05',
      'listings': [contribution()]
    };

class FakeDeboApi extends DeboApi {
  bool fail = false;
  int previews = 0, creates = 0, responses = 0;
  List<Map<String, dynamic>> history = [];
  Map<String, dynamic> current = batch();
  Map<String, dynamic>? sent;
  @override
  Future<List<Map<String, dynamic>>> batches() async {
    if (fail) throw Exception('Network unavailable');
    return history;
  }

  @override
  Future<Map<String, dynamic>> detail(String id) async => current;
  @override
  Future<Map<String, dynamic>> preview(Map<String, dynamic> data) async {
    previews++;
    sent = data;
    return {
      'listings': [
        contribution()..addAll({'subtotal': 80000})
      ],
      'total_quantity': 40,
      'unit': 'quintal',
      'farmer_count': 1,
      'estimated_total': 80000,
      'meets_target': false
    };
  }

  @override
  Future<Map<String, dynamic>> create(Map<String, dynamic> data) async {
    creates++;
    sent = data;
    return current;
  }

  @override
  Future<void> respond(
      String id, String listing, String action, double quantity) async {
    responses++;
    sent = {'action': action, 'quantity': quantity};
    if (fail) throw Exception('Stock changed');
  }
}

void main() {
  Future<void> large(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1000, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  test('server quantity formatting keeps zero and fractions', () {
    expect(deboQuantity(0), '0');
    expect(deboQuantity(40), '40');
    expect(deboQuantity('2.125'), '2.125');
  });
  testWidgets('buyer empty state offers request, farmer empty state does not',
      (tester) async {
    final api = FakeDeboApi();
    await tester.pumpWidget(MaterialApp(home: DeboBatchListScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('No aggregation requests yet.'), findsOneWidget);
    expect(find.text('Request produce'), findsOneWidget);
    await tester.pumpWidget(MaterialApp(
        home: DeboBatchListScreen(
            key: const ValueKey('farmer'), isFarmer: true, api: api)));
    await tester.pumpAndSettle();
    expect(find.text('No participation invitations yet.'), findsOneWidget);
    expect(find.text('Request produce'), findsNothing);
  });
  testWidgets('history network error offers a working retry', (tester) async {
    final api = FakeDeboApi()..fail = true;
    await tester.pumpWidget(MaterialApp(home: DeboBatchListScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Network unavailable'), findsOneWidget);
    api.fail = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('No aggregation requests yet.'), findsOneWidget);
  });
  testWidgets('full proposal is not displayed as committed progress',
      (tester) async {
    await large(tester);
    await tester.pumpWidget(MaterialApp(
        home: DeboBatchDetailScreen(batchId: 'batch-a', api: FakeDeboApi())));
    await tester.pumpAndSettle();
    expect(find.text('0.0% committed'), findsOneWidget);
    expect(find.text('reserved quantity: 0 quintal'), findsOneWidget);
    expect(find.text('Review prototype payment'), findsNothing);
    expect(find.text('Review invitation'), findsNothing);
    expect(find.text('Find replacement / additional supply'), findsOneWidget);
  });
  testWidgets('farmer sees confirmation action but no buyer management actions',
      (tester) async {
    await large(tester);
    final api = FakeDeboApi()..current = batch(buyer: false);
    await tester.pumpWidget(
        MaterialApp(home: DeboBatchDetailScreen(batchId: 'batch-a', api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Review invitation'), findsOneWidget);
    expect(find.text('Cancel batch & release stock'), findsNothing);
    await tester.tap(find.text('Review invitation'));
    await tester.pumpAndSettle();
    expect(find.text('Accept & reserve'), findsOneWidget);
  });
  testWidgets('request rejects missing values without a network request',
      (tester) async {
    await large(tester);
    final api = FakeDeboApi();
    await tester.pumpWidget(MaterialApp(home: DeboRequestScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Find matching produce'));
    await tester.pumpAndSettle();
    expect(api.previews, 0);
    expect(find.text('Enter a number greater than zero'), findsOneWidget);
  });
  testWidgets(
      'request shows incomplete results and creates invitation rather than purchase',
      (tester) async {
    await large(tester);
    final api = FakeDeboApi();
    await tester.pumpWidget(MaterialApp(home: DeboRequestScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Target quantity'), '100');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Preferred latitude'), '9.03');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Preferred longitude'), '38.74');
    await tester.tap(find.text('Find matching produce'));
    await tester.pumpAndSettle();
    expect(api.previews, 1);
    expect(find.textContaining('Supply is insufficient'), findsOneWidget);
    expect(find.text('Create request & invite farmers'), findsOneWidget);
    await tester.tap(find.text('Create request & invite farmers'));
    await tester.pumpAndSettle();
    expect(api.creates, 1);
    expect(api.sent!['target_quantity'], 100);
    expect(api.sent!['request_id'], isNotEmpty);
    expect(find.text('Debo batch details'), findsOneWidget);
  });
  testWidgets(
      'farmer cannot confirm more than proposed; server error does not claim reservation',
      (tester) async {
    final api = FakeDeboApi()..fail = true;
    await tester.pumpWidget(MaterialApp(
        home: DeboJoinConfirmationScreen(
            batchId: 'batch-a', contribution: contribution(), api: api)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), '41');
    await tester.tap(find.text('Accept & reserve'));
    await tester.pumpAndSettle();
    expect(api.responses, 0);
    expect(find.text('Cannot exceed the invitation quantity'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField), '25');
    await tester.tap(find.text('Accept & reserve'));
    await tester.pumpAndSettle();
    expect(api.sent, {'action': 'accepted', 'quantity': 25.0});
    expect(find.text('Stock changed'), findsOneWidget);
    expect(
        find.textContaining('quantity reserved by the server'), findsNothing);
  });
  testWidgets('decline is allowed without a valid confirmation quantity',
      (tester) async {
    final api = FakeDeboApi();
    await tester.pumpWidget(MaterialApp(
        home: DeboJoinConfirmationScreen(
            batchId: 'batch-a', contribution: contribution(), api: api)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), '');
    await tester.tap(find.text('Decline'));
    await tester.pumpAndSettle();
    expect(api.sent!['action'], 'declined');
  });
  testWidgets(
      'unresolved checkout keeps stock visible and does not offer another payment',
      (tester) async {
    await large(tester);
    final api = FakeDeboApi()
      ..current = {
        ...batch(),
        'status': 'filled',
        'reserved_quantity': 100,
        'confirmed_quantity': 100,
        'completion_percentage': 100,
        'transaction_ready': false,
        'estimated_total': '10.08',
        'confirmed_total': '10.08',
        'checkout': {
          'status': 'reconciliation_required',
          'payment_status': 'pending',
          'mode': 'external',
          'expires_at': '2026-11-05',
          'reason': 'Verification unavailable'
        }
      };
    await tester.pumpWidget(
        MaterialApp(home: DeboBatchDetailScreen(batchId: 'batch-a', api: api)));
    await tester.pumpAndSettle();
    expect(
        find.textContaining('Payment outcome is unresolved'), findsOneWidget);
    expect(find.textContaining('Confirmed total ETB 10.08'), findsOneWidget);
    expect(find.text('reserved quantity: 100 quintal'), findsOneWidget);
    expect(find.text('Review prototype payment'), findsNothing);
  });
}
