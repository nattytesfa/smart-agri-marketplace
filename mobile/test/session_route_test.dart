import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_agri_marketplace/main.dart';
import 'package:smart_agri_marketplace/screens/login_screen.dart';
import 'package:smart_agri_marketplace/screens/register_screen.dart';
import 'package:smart_agri_marketplace/screens/startup_screen.dart';
import 'package:smart_agri_marketplace/services/auth_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Answers the launch-time lookup and records whether the session was thrown
/// away, without touching the network.
class _Auth extends AuthService {
  _Auth(this.answers);

  /// What the backend says, one entry per attempt. null models an unreachable
  /// backend, so `[null, true]` is a backend that is slow on the first try.
  final List<bool?> answers;

  int attempts = 0;
  bool discarded = false;

  /// Completes on every wait-between-retries, so a test can let the loop run
  /// exactly as many attempts as it wants.
  final List<Completer<void>> retries = [];

  @override
  Future<bool?> isRegistered(String token, {Duration? timeout}) async {
    final index = attempts < answers.length ? attempts : answers.length - 1;
    attempts++;
    return answers[index];
  }

  @override
  Future<void> discardSession() async {
    discarded = true;
  }
}

/// Records the waiting instead of actually sleeping through it.
Future<void> _record(Duration _) async {}

void main() {
  group('session gate', () {
    test('a confirmed account opens the app', () async {
      final auth = _Auth([true]);

      expect(
        await sessionGateFor('token', auth: auth, wait: _record),
        SessionGate.open,
      );
      expect(auth.discarded, isFalse);
    });

    test('a session the backend does not know is thrown away', () async {
      final auth = _Auth([false]);

      expect(
        await sessionGateFor('token', auth: auth, wait: _record),
        SessionGate.startOver,
      );
      expect(auth.discarded, isTrue);
    });

    test('an unreachable backend is waited out, then honoured', () async {
      final auth = _Auth([null, null, true]);

      expect(
        await sessionGateFor('token', auth: auth, wait: _record),
        SessionGate.open,
      );
      // Three tries, and at no point was the session discarded: not answering
      // is not a reason to sign a real user out.
      expect(auth.attempts, 3);
      expect(auth.discarded, isFalse);
    });

    test('a backend that never answers is never read as "no account"',
        () async {
      final auth = _Auth([null]);

      expect(
        await sessionGateFor(
          'token',
          auth: auth,
          attempts: 2,
          wait: _record,
        ),
        SessionGate.noAnswer,
      );
      expect(auth.attempts, 2);
      expect(auth.discarded, isFalse);
    });

    test('bounded callers do not wait when the backend is silent', () async {
      final auth = _Auth([null]);

      expect(
        await sessionGateFor('token', auth: auth, attempts: 1, wait: _record),
        SessionGate.noAnswer,
      );
      expect(auth.attempts, 1);
      expect(auth.discarded, isFalse);
    });
  });

  group('launch route', () {
    test('a new user starts at the welcome screen', () {
      expect(resolveInitialRouteForSession(null), '/login');
    });

    test('a stored session waits for the backend to judge it', () {
      expect(resolveInitialRouteForSession('token'), '/startup');
    });
  });

  group('launch routes', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      await Supabase.initialize(
        url: 'https://test.supabase.co',
        publishableKey: 'test-anon-key',
      );
    });

    tearDown(() => Supabase.instance.dispose());

    testWidgets('the welcome screen is what a new user gets', (tester) async {
      await tester.pumpWidget(const MyApp(initialRoute: '/login'));

      expect(find.byType(LoginScreen), findsOneWidget);
      expect(find.byType(RegisterScreen), findsNothing);
    });

    testWidgets('the register route opens a blank form', (tester) async {
      await tester.pumpWidget(const MyApp(initialRoute: '/register'));
      await tester.pumpAndSettle();

      // Only the full route name may be pushed, so sign-in cannot stack up in
      // front of this screen.
      expect(find.byType(RegisterScreen), findsOneWidget);
      expect(find.byType(LoginScreen), findsNothing);
    });
  });

  group('startup screen', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      await Supabase.initialize(
        url: 'https://test.supabase.co',
        publishableKey: 'test-anon-key',
      );
    });

    tearDown(() => Supabase.instance.dispose());

    Future<void> pumpStartup(
      WidgetTester tester,
      AuthService auth, {
      bool settle = true,
      Map<String, WidgetBuilder>? routes,
      Future<void> Function(Duration)? wait,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          // StartupScreen is always the root at launch, so give the navigator a
          // root route rather than leaving "/" undefined.
          initialRoute: '/startup',
          routes: {
            '/login': (context) => const LoginScreen(),
            '/startup': (context) => StartupScreen(
                  authService: auth,
                  retryDelay: Duration.zero,
                  // Widget tests have no restored session, so the launch screen is
                  // given the token the app would have read from Supabase.
                  token: 'test-token',
                  wait: wait,
                ),
            '/home': (context) => const Scaffold(body: Text('home')),
            ...?routes,
          },
        ),
      );
      if (settle) await tester.pumpAndSettle();
    }

    testWidgets('it shows a connecting state while it waits', (tester) async {
      final auth = _Auth([null]);
      await pumpStartup(
        tester,
        auth,
        settle: false,
        wait: (d) async {
          final gate = Completer<void>();
          auth.retries.add(gate);
          await gate.future;
        },
      );
      await tester.pump();
      await tester.pump();

      // The backend has not answered, so the screen is still up — and it says
      // so, rather than leaving the user on a frozen splash.
      expect(find.text('Connecting…'), findsOneWidget);

      // The retry is parked, not cancelled: waiting really does continue. Let
      // it through so the test ends cleanly, then hand the tree back.
      auth.retries.first.complete();
      await tester.pump();
      await tester.pump();
      expect(find.text('Connecting…'), findsOneWidget);
    });

    testWidgets('a confirmed account ends up in the app', (tester) async {
      // The first answer is the slow one, so this also proves the screen waits
      // instead of giving up on the first miss.
      await pumpStartup(tester, _Auth([null, true]));

      expect(find.text('home'), findsOneWidget);
    });

    testWidgets('an unfinished registration ends up at the welcome screen',
        (tester) async {
      final auth = _Auth([false]);
      await pumpStartup(
        tester,
        auth,
        // Sign-in is a heavyweight screen; this only needs to prove which
        // screen the startup logic left for.
        routes: {
          '/login': (context) => const Scaffold(body: Text('login')),
          '/home': (context) => const Scaffold(body: Text('home')),
        },
      );

      // Discarded on the way, so the next launch starts the whole thing over.
      expect(auth.discarded, isTrue);
      expect(find.text('login'), findsOneWidget);
      expect(find.text('home'), findsNothing);
    });
  });
}
