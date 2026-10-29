import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:smart_agri_marketplace/data/models/listing_model.dart';
import 'package:smart_agri_marketplace/features/listings/presentation/screens/listing_create_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  late Box<ListingModel> box;
  const owner = '00000000-0000-4000-8000-000000000001';
  setUp(() async {
    dir = await Directory('/tmp/opencode').createTemp('produce-form-test-');
    Hive.init(dir.path);
    if (!Hive.isAdapterRegistered(0)) {
      Hive.registerAdapter(ListingModelAdapter());
    }
    box = await Hive.openBox<ListingModel>('listings');
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({'user_role': 'farmer'});
    dotenv.loadFromString(
        envString: 'BACKEND_API_BASE_URL=http://127.0.0.1:1/api');
    await Supabase.initialize(
        url: 'https://test.supabase.co',
        publishableKey: 'test-key',
        authOptions: const FlutterAuthClientOptions(
            autoRefreshToken: false, detectSessionInUri: false));
    final header =
        base64Url.encode(utf8.encode('{"alg":"HS256"}')).replaceAll('=', '');
    final payload = base64Url
        .encode(utf8.encode(jsonEncode({
          'sub': owner,
          'exp': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600
        })))
        .replaceAll('=', '');
    await Supabase.instance.client.auth.setInitialSession(jsonEncode({
      'access_token': '$header.$payload.test-signature',
      'refresh_token': 'test-refresh',
      'token_type': 'bearer',
      'expires_in': 3600,
      'user': {
        'id': owner,
        'aud': 'authenticated',
        'app_metadata': {},
        'user_metadata': {},
        'created_at': '2026-01-01T00:00:00Z'
      }
    }));
  });
  tearDown(() async {
    await Supabase.instance.dispose();
    await Hive.close();
    await dir.delete(recursive: true);
  });

  Future<void> field(WidgetTester tester, String label, String value) async {
    final finder = find.widgetWithText(TextFormField, label);
    tester
        .state<ScrollableState>(find.byType(Scrollable).first)
        .position
        .jumpTo(0);
    await tester.pump();
    await tester.scrollUntilVisible(finder, 250,
        scrollable: find.byType(Scrollable).first);
    await tester.enterText(finder, value);
    await tester.pump();
  }

  Future<void> requiredFields(WidgetTester tester) async {
    await tester.tap(find.byType(DropdownButtonFormField<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Teff').last);
    await tester.pumpAndSettle();
    await field(tester, 'Crop Variety *', 'White');
    await field(tester, 'Quantity *', '5');
    await field(tester, 'Asking Price — ETB per quintal *', '3000');
    await field(tester, 'Kebele (required without GPS)', 'Bole');
  }

  Future<void> save(WidgetTester tester) async {
    final button = find.text('Save listing (online or offline)');
    await tester.scrollUntilVisible(button, 250,
        scrollable: find.byType(Scrollable).first);
    await tester.runAsync(() async {
      await tester.tap(button);
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle(const Duration(milliseconds: 100),
        EnginePhase.sendSemanticsUpdate, const Duration(seconds: 10));
  }

  testWidgets('farmer creates required-only offline listing without image',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ListingCreateScreen()));
    await tester.pumpAndSettle();
    await requiredFields(tester);
    await save(tester);
    expect(box.length, 1);
    final l = box.values.single;
    expect(l.cropType, 'Teff');
    expect(l.variety, 'White');
    expect(l.quantity, 5);
    expect(l.pricePerUnit, 3000);
    expect(l.kebele, 'Bole');
    expect(l.imagePath, isNull);
    expect(l.imageUrl, isNull);
    expect(l.harvestDate, isNull);
    expect(l.syncStatus, 'local');
    expect(l.clientId, isNotNull);
    expect(l.farmerId, owner);
  });
  testWidgets('negative quantity does not save', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ListingCreateScreen()));
    await tester.pumpAndSettle();
    await requiredFields(tester);
    await field(tester, 'Quantity *', '-1');
    await save(tester);
    expect(box.isEmpty, true);
    expect(tester.takeException(), isNull);
  });
  testWidgets('missing crop and location prevent saving', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ListingCreateScreen()));
    await tester.pumpAndSettle();
    await save(tester);
    expect(box.isEmpty, true);
    expect(tester.takeException(), isNull);
  });
  testWidgets('negative asking price cannot enter offline queue',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ListingCreateScreen()));
    await tester.pumpAndSettle();
    await requiredFields(tester);
    await field(tester, 'Asking Price — ETB per quintal *', '-20');
    await save(tester);
    expect(box.isEmpty, true);
  });
  testWidgets('valid produce still requires GPS or Kebele', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ListingCreateScreen()));
    await tester.pumpAndSettle();
    await requiredFields(tester);
    await field(tester, 'Kebele (required without GPS)', '');
    await save(tester);
    expect(box.isEmpty, true);
  });
  testWidgets('buyer cannot access listing creation form', (tester) async {
    FlutterSecureStorage.setMockInitialValues({'user_role': 'buyer'});
    await tester.pumpWidget(const MaterialApp(home: ListingCreateScreen()));
    await tester.pumpAndSettle();
    expect(
        find.text('An authorized farmer account is required.'), findsOneWidget);
    expect(find.text('Save listing (online or offline)'), findsNothing);
  });
  testWidgets('farmer cannot edit another account listing', (tester) async {
    final l = ListingModel(
        farmerId: 'other-user', cropType: 'Teff', quantity: 1, pricePerUnit: 1);
    await tester.pumpWidget(MaterialApp(home: ListingCreateScreen(listing: l)));
    await tester.pumpAndSettle();
    expect(
        find.text('An authorized farmer account is required.'), findsOneWidget);
    expect(find.text('Save listing (online or offline)'), findsNothing);
  });
  testWidgets('editing retains optional harvest grade and Amharic description',
      (tester) async {
    final l = ListingModel(
        farmerId: owner,
        cropType: 'Teff',
        variety: 'White',
        quantity: 2,
        pricePerUnit: 2000,
        kebele: 'Bole',
        harvestDate: '2026-01-01',
        qualityGrade: 'A',
        description: 'ጤፍ\nFresh');
    await tester.runAsync(() => box.add(l));
    await tester.pumpWidget(MaterialApp(home: ListingCreateScreen(listing: l)));
    await tester.pumpAndSettle();
    await field(tester, 'Quantity *', '4');
    await save(tester);
    expect(box.length, 1);
    expect(l.quantity, 4);
    expect(l.harvestDate, '2026-01-01');
    expect(l.qualityGrade, 'A');
    expect(l.description, 'ጤፍ\nFresh');
  });
}
