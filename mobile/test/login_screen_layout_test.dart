import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_agri_marketplace/screens/login_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Viewport from the overflow report: what remains after the keyboard opens
/// on the OTP step.
const _shortPhone = Size(375, 466);
const _tallPhone = Size(375, 812);

Future<void> _pumpLogin(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(const MaterialApp(home: LoginScreen()));
}

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://test.supabase.co',
      publishableKey: 'test-anon-key',
    );
  });

  tearDown(() => Supabase.instance.dispose());

  testWidgets('phone step has no overflow on a short viewport', (tester) async {
    await _pumpLogin(tester, _shortPhone);
    expect(tester.takeException(), isNull);
  });

  testWidgets('OTP step has no overflow on a short viewport', (tester) async {
    await _pumpLogin(tester, _shortPhone);

    final state = tester.state<State<LoginScreen>>(find.byType(LoginScreen))
        as dynamic;
    state.showOtpStepForTest('+251912345678');
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });

  testWidgets('OTP step shows the boxes and no phone field', (tester) async {
    await _pumpLogin(tester, _tallPhone);

    final state = tester.state<State<LoginScreen>>(find.byType(LoginScreen))
        as dynamic;
    state.showOtpStepForTest('+251912345678');
    await tester.pumpAndSettle();

    expect(find.textContaining('+251912345678'), findsOneWidget);
    expect(find.text('Enter the 6-digit code'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('welcome copy is dropped once the OTP step is shown',
      (tester) async {
    await _pumpLogin(tester, _tallPhone);
    expect(find.text('Welcome!'), findsOneWidget);

    final state = tester.state<State<LoginScreen>>(find.byType(LoginScreen))
        as dynamic;
    state.showOtpStepForTest('+251912345678');
    await tester.pumpAndSettle();

    // The header is what pushed the OTP step past the viewport.
    expect(find.text('Welcome!'), findsNothing);
  });
}