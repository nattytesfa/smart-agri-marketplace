import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_agri_marketplace/data/models/registration_draft.dart';
import 'package:smart_agri_marketplace/screens/login_screen.dart';
import 'package:smart_agri_marketplace/screens/otp_screen.dart';
import 'package:smart_agri_marketplace/screens/register_screen.dart';
import 'package:smart_agri_marketplace/screens/role_selection_screen.dart';
import 'package:smart_agri_marketplace/services/auth_service.dart';
import 'package:smart_agri_marketplace/widgets/auth_page.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Viewport from the overflow report: what remains after the keyboard opens
/// on the OTP step.
const _shortPhone = Size(375, 466);
const _tallPhone = Size(375, 812);

/// Records what the screen asked for without touching the network.
class FakeAuthService extends AuthService {
  FakeAuthService({this.registered, this.accountExists});

  /// Result of the duplicate-number lookup. null models an inconclusive check.
  final bool? registered;

  /// What GET /api/auth/me says after the code verifies. null models an
  /// inconclusive check (usually the backend being unreachable).
  final bool? accountExists;

  int sendOtpCalls = 0;
  final List<String> checkedPhones = [];

  @override
  Future<bool?> isPhoneRegistered(String phone) async {
    checkedPhones.add(phone);
    return registered;
  }

  @override
  Future<bool?> isRegistered(String token, {Duration? timeout}) async =>
      accountExists;

  @override
  Future<String> verifyOtp(String phone, String otp) async => 'test-token';

  @override
  Future<void> sendOtp(String phone) async {
    sendOtpCalls++;
  }
}

Future<void> _pump(WidgetTester tester, Widget screen, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(MaterialApp(
    home: screen,
    routes: {
      '/login': (_) => const LoginScreen(),
      '/register': (_) => const RegisterScreen(),
      '/home': (_) => const Scaffold(body: Text('home')),
    },
  ));
}

/// Fills the fields the register screen requires before it will send a code.
/// [fillPhone] is false when the number is already fixed to the session and
/// the field is read-only.
Future<void> _fillRegistration(WidgetTester tester,
    {bool fillPhone = true}) async {
  await tester.enterText(
      find.widgetWithText(TextField, 'Full name'), 'Abebe B');
  if (fillPhone) {
    await tester.enterText(
        find.widgetWithText(TextField, 'Phone Number'), '0912345678');
  }

  await tester
      .ensureVisible(find.byType(DropdownButtonFormField<String>).first);
  await tester.tap(find.byType(DropdownButtonFormField<String>).first);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Amhara').last);
  await tester.pumpAndSettle();

  await tester.tap(find.byType(DropdownButtonFormField<String>).last);
  await tester.pumpAndSettle();
  await tester.tap(find.text('East Gojam').last);
  await tester.pumpAndSettle();

  await tester.enterText(find.byType(DropdownMenu<String>), 'Kebele 01');

  await tester.ensureVisible(find.byType(AuthPrimaryButton));
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

  group('login screen', () {
    testWidgets('has no overflow on a short viewport', (tester) async {
      await _pump(tester, const LoginScreen(), _shortPhone);
      expect(tester.takeException(), isNull);
    });

    testWidgets('offers sign-in copy and a registration link', (tester) async {
      await _pump(tester, const LoginScreen(), _tallPhone);

      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.text('Send OTP'), findsOneWidget);
      expect(find.text('New here? Create an account'), findsOneWidget);
    });

    Future<void> enterPhone(WidgetTester tester) async {
      await tester.enterText(
          find.widgetWithText(TextField, 'Phone Number'), '0912345678');
      await tester.ensureVisible(find.byType(AuthPrimaryButton));
      await tester.tap(find.byType(AuthPrimaryButton));
      await tester.pumpAndSettle();
    }

    testWidgets('checks the number before sending a code', (tester) async {
      final auth = FakeAuthService(registered: true);
      await _pump(tester, LoginScreen(authService: auth), _tallPhone);

      await enterPhone(tester);

      expect(auth.checkedPhones, ['+251912345678']);
      expect(auth.sendOtpCalls, 1);
      expect(find.byType(OtpScreen), findsOneWidget);
    });

    testWidgets('refuses to text a number that is not registered',
        (tester) async {
      final auth = FakeAuthService(registered: false);
      await _pump(tester, LoginScreen(authService: auth), _tallPhone);

      await enterPhone(tester);

      expect(
        find.text(
            'This number is not registered yet. Create an account first.'),
        findsOneWidget,
      );
      expect(auth.checkedPhones, ['+251912345678']);
      expect(auth.sendOtpCalls, 0);
      expect(find.byType(OtpScreen), findsNothing);
    });

    testWidgets('stops when the lookup cannot be completed', (tester) async {
      final auth = FakeAuthService();
      await _pump(tester, LoginScreen(authService: auth), _tallPhone);

      await enterPhone(tester);

      expect(
        find.text(
            'Could not check this number. Check your connection and try again.'),
        findsOneWidget,
      );
      expect(auth.sendOtpCalls, 0);
      expect(find.byType(OtpScreen), findsNothing);
    });
  });

  group('register screen', () {
    testWidgets('has no overflow on a short viewport', (tester) async {
      await _pump(tester, const RegisterScreen(), _shortPhone);
      expect(tester.takeException(), isNull);
    });

    testWidgets('offers registration copy and a link back to sign in',
        (tester) async {
      await _pump(tester, const RegisterScreen(), _tallPhone);

      expect(find.text('Create your account'), findsOneWidget);
      expect(find.text('Send OTP'), findsOneWidget);
      expect(find.text('Already have an account? Sign in'), findsOneWidget);
      expect(find.text('New here? Create an account'), findsNothing);
    });

    testWidgets('asks for name, location and phone before sending the code',
        (tester) async {
      await _pump(tester, const RegisterScreen(), _tallPhone);

      expect(find.text('Full name'), findsOneWidget);
      expect(find.text('Region'), findsOneWidget);
      expect(find.text('Zone'), findsOneWidget);
      expect(find.text('Kebele'), findsWidgets);
      expect(find.text('Phone Number'), findsOneWidget);
    });

    testWidgets('blocks sending until name and location are filled in',
        (tester) async {
      await _pump(tester, const RegisterScreen(), _tallPhone);

      await tester.ensureVisible(find.text('Send OTP'));
      await tester.tap(find.text('Send OTP'));
      await tester.pumpAndSettle();

      expect(find.text('Enter your full name.'), findsOneWidget);
    });

    testWidgets('zone stays closed until a region is picked', (tester) async {
      await _pump(tester, const RegisterScreen(), _tallPhone);

      expect(find.text('Select a region first'), findsOneWidget);
      expect(find.text('Type your kebele'), findsOneWidget);

      await tester
          .ensureVisible(find.byType(DropdownButtonFormField<String>).first);
      await tester.tap(find.byType(DropdownButtonFormField<String>).first);
      await tester.pumpAndSettle();

      expect(find.text('Amhara'), findsWidgets);
    });

    testWidgets('refuses to send a code to an already registered number',
        (tester) async {
      final auth = FakeAuthService(registered: true);
      await _pump(tester, RegisterScreen(authService: auth), _tallPhone);

      await _fillRegistration(tester);
      await tester.tap(find.text('Send OTP'));
      await tester.pumpAndSettle();

      expect(
        find.text(
            'This number is already registered. Sign in with it instead.'),
        findsOneWidget,
      );
      expect(auth.checkedPhones, ['+251912345678']);
      expect(auth.sendOtpCalls, 0);
      expect(find.byType(OtpScreen), findsNothing);
    });

    testWidgets('sends the code when the number is free', (tester) async {
      final auth = FakeAuthService(registered: false);
      await _pump(tester, RegisterScreen(authService: auth), _tallPhone);

      await _fillRegistration(tester);
      await tester.tap(find.text('Send OTP'));
      await tester.pumpAndSettle();

      expect(auth.checkedPhones, ['+251912345678']);
      expect(auth.sendOtpCalls, 1);
      expect(find.byType(OtpScreen), findsOneWidget);
    });

    testWidgets('blocks signup when the duplicate check cannot run',
        (tester) async {
      final auth = FakeAuthService();
      await _pump(tester, RegisterScreen(authService: auth), _tallPhone);

      await _fillRegistration(tester);
      await tester.tap(find.text('Send OTP'));
      await tester.pumpAndSettle();

      // A failed lookup must not read as "not registered", otherwise the
      // duplicate check silently does nothing when the backend is unreachable.
      expect(
        find.text(
            'Could not check this number. Check your connection and try again.'),
        findsOneWidget,
      );
      expect(auth.checkedPhones, ['+251912345678']);
      expect(auth.sendOtpCalls, 0);
    });
  });

  group('otp screen', () {
    testWidgets('has no overflow on a short viewport', (tester) async {
      await _pump(
        tester,
        const OtpScreen(phone: '+251912345678'),
        _shortPhone,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('shows the number the code was sent to', (tester) async {
      await _pump(
        tester,
        const OtpScreen(phone: '+251912345678'),
        _tallPhone,
      );

      expect(find.textContaining('+251912345678'), findsOneWidget);
      expect(find.text('Enter the 6-digit code'), findsOneWidget);
    });

    testWidgets('starts a resend cooldown', (tester) async {
      await _pump(
        tester,
        const OtpScreen(phone: '+251912345678'),
        _tallPhone,
      );

      // The code was just sent by the preceding screen, so resend must not be
      // immediately tappable.
      expect(find.textContaining('Resend available in'), findsOneWidget);
    });

    testWidgets('registration mode sends back to /register', (tester) async {
      await _pump(
        tester,
        const OtpScreen(phone: '+251912345678', isRegistration: true),
        _tallPhone,
      );

      await tester.ensureVisible(find.text('Change phone number'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Change phone number'));
      await tester.pumpAndSettle();

      expect(find.byType(RegisterScreen), findsOneWidget);
    });
  });

  group('after the code verifies', () {
    // Six digits, which is what the field waits for before it submits.
    Future<void> enterCode(WidgetTester tester) async {
      await tester.enterText(find.byType(TextField).first, '123456');
      await tester.pumpAndSettle();
    }

    testWidgets('an unregistered number is sent to registration, not home',
        (tester) async {
      await _pump(
        tester,
        OtpScreen(
          phone: '+251912345678',
          authService: FakeAuthService(accountExists: false),
        ),
        _tallPhone,
      );

      await enterCode(tester);

      // The number proved no account behind it, so letting it into home would
      // mean using the app without ever registering.
      expect(find.byType(RegisterScreen), findsOneWidget);
      expect(find.byType(OtpScreen), findsNothing);
      expect(find.text('home'), findsNothing);
    });

    testWidgets('registration started this way carries on to role selection',
        (tester) async {
      await _pump(
        tester,
        OtpScreen(
          phone: '+251912345678',
          authService: FakeAuthService(accountExists: false),
        ),
        _tallPhone,
      );
      await enterCode(tester);

      await _fillRegistration(tester, fillPhone: false);
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(find.byType(RoleSelectionScreen), findsOneWidget);
      expect(find.text('Send OTP'), findsNothing);
    });

    testWidgets('a registered number goes to home', (tester) async {
      await _pump(
        tester,
        OtpScreen(
          phone: '+251912345678',
          authService: FakeAuthService(accountExists: true),
        ),
        _tallPhone,
      );

      await enterCode(tester);

      expect(find.text('home'), findsOneWidget);
      expect(find.byType(RegisterScreen), findsNothing);
    });

    testWidgets('an inconclusive check cannot open home', (tester) async {
      await _pump(
        tester,
        OtpScreen(
          phone: '+251912345678',
          authService: FakeAuthService(accountExists: null),
        ),
        _tallPhone,
      );

      await enterCode(tester);

      // An unconfirmed session may have no account behind it, so it finishes
      // registration instead — and the register endpoint answers 409 if the
      // number turns out to be taken after all.
      expect(find.byType(RegisterScreen), findsOneWidget);
      expect(find.text('home'), findsNothing);
    });
  });

  group('role selection screen', () {
    testWidgets('fits a 375px wide phone', (tester) async {
      await _pump(
        tester,
        const RoleSelectionScreen(
          phone: '+251912345678',
          token: 'test-token',
          draft: RegistrationDraft(
            fullName: 'Abebe Bekele',
            region: 'Amhara',
            zone: 'East Gojam',
            kebele: 'Kewet',
          ),
        ),
        _tallPhone,
      );

      // Farmer is the default, so the storage dropdown is on screen and was
      // the widest control on this page.
      expect(tester.takeException(), isNull);
      expect(find.text('How will you use the platform?'), findsOneWidget);
    });
  });
}
