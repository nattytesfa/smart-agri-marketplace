import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_agri_marketplace/screens/profile_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Widget tests for the Fayda verification section on the profile page.
void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://test.supabase.co',
      publishableKey: 'test-anon-key',
    );
  });

  tearDown(() => Supabase.instance.dispose());

  Future<void> pumpScreen(WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(home: ProfileScreen()));
    await tester.pumpAndSettle();
  }

  testWidgets('shows the verified state with the Fayda ID', (tester) async {
    FlutterSecureStorage.setMockInitialValues({
      'fayda_id': 'FIN-123456789',
      'fayda_verified': 'true',
    });

    await pumpScreen(tester);

    expect(find.text('Fayda Verified'), findsOneWidget);
    expect(find.text('Fayda ID: FIN-123456789'), findsOneWidget);
    expect(find.text('Verify with Fayda'), findsNothing);
  });

  testWidgets('shows the pending state with a verification action',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues({
      'fayda_verified': 'false',
    });

    await pumpScreen(tester);

    expect(find.text('Fayda Verification Pending'), findsOneWidget);
    expect(find.text('Verify with Fayda'), findsOneWidget);
    expect(find.text('Fayda ID:'), findsNothing);
  });

  testWidgets('shows an unknown state while the flag is unreadable',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues({});

    await pumpScreen(tester);

    expect(find.text('Fayda Verification Pending'), findsOneWidget);
    expect(find.text('Verify with Fayda'), findsOneWidget);
  });

  testWidgets('has no overflow on a short viewport', (tester) async {
    tester.view.physicalSize = const Size(375, 466);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(const MaterialApp(home: ProfileScreen()));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });
}
