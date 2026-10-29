import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:smart_agri_marketplace/screens/role_based_home_screen.dart';
import 'package:smart_agri_marketplace/services/sync_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'data/models/listing_model.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/role_selection_screen.dart';
import 'screens/startup_screen.dart';

final _navigatorKey = GlobalKey<NavigatorState>();

// Resolves once Supabase has finished restoring a persisted session.
//
// Supabase.initialize() starts recovery without awaiting it, so currentSession
// can still be null when it returns. It also emits initialSession
// *synchronously* when there is no persisted session, so a blanket wait would
// stall every logged-out launch until the timeout. Only wait when we have a
// token on file, which is the case that actually needs restoring.
Future<void> _waitForSessionRestore() async {
  final auth = Supabase.instance.client.auth;
  if (auth.currentSession != null) return;

  final storage = const FlutterSecureStorage();
  if (await storage.read(key: 'supabase_token') == null) return;

  final completer = Completer<void>();
  late final StreamSubscription<AuthState> subscription;

  subscription = auth.onAuthStateChange.listen((event) {
    if (!completer.isCompleted) completer.complete();
  });

  try {
    await completer.future.timeout(
      const Duration(seconds: 5),
      onTimeout: () {},
    );
  } finally {
    await subscription.cancel();
  }
}

/// Where the app should start, given the session restored from disk.
///
/// A session on disk only proves a phone number, so the first route has to be
/// decided by the backend, and it has to be decided before any other screen
/// can act on that session:
///
/// - no session: the welcome screen, exactly as for a new user.
/// - a session: the connecting screen, which waits for the backend to say
///   whether there is an account behind it and then leaves for home or the
///   welcome screen.
///
/// Nothing is decided from the token alone here, so a launch never signs a user
/// out because the network was slow, and never lets an unfinished registration
/// through.
///
/// Token comes in as a parameter so both cases are testable without a real
/// Supabase session.
String resolveInitialRouteForSession(String? token) =>
    token == null ? '/login' : '/startup';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: ".env");

  await Supabase.initialize(
    url: dotenv.env['SUPABASE_URL']!,
    publishableKey: dotenv.env['SUPABASE_ANON_KEY']!,
  );

  await _waitForSessionRestore();

  // Landing on the connecting screen (rather than deciding here) keeps the
  // app's first frame honest: a restored session may be all that is left of an
  // abandoned registration, and only the backend can tell the difference.
  final initialRoute = resolveInitialRouteForSession(
    Supabase.instance.client.auth.currentSession?.accessToken,
  );

  // Initialize Hive
  await Hive.initFlutter();
  Hive.registerAdapter(ListingModelAdapter());
  await Hive.openBox<ListingModel>('listings');
  // Supabase auto-refreshes its access token in memory, but the rest of the app
  // reads the token from secure storage. Mirror refreshes so screens don't send
  // an expired JWT to the backend. On sign-out, drop the mirrored token and
  // send the user back to login.
  Supabase.instance.client.auth.onAuthStateChange.listen((event) async {
    final storage = const FlutterSecureStorage();

    if (event.event == AuthChangeEvent.signedOut) {
      await storage.delete(key: 'supabase_token');
      await storage.delete(key: 'confirmed_farmer_id');
      _navigatorKey.currentState?.pushNamedAndRemoveUntil(
        '/login',
        (route) => false,
      );
      return;
    }

    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) return;
    await storage.write(key: 'supabase_token', value: session.accessToken);
  });

  runApp(MyApp(initialRoute: initialRoute));
  SyncService.start();

  Connectivity()
      .onConnectivityChanged
      .listen((List<ConnectivityResult> result) {
    if (!result.contains(ConnectivityResult.none)) {
      SyncService().syncListings();
    }
  });
}

class MyApp extends StatelessWidget {
  const MyApp({super.key, required this.initialRoute});

  /// Decided in main(), where the backend can be asked about the session.
  final String initialRoute;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
      debugShowCheckedModeBanner: false,
      title: 'Smart Agri Marketplace',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
        useMaterial3: true,
      ),
      initialRoute: initialRoute,
      routes: {
        '/login': (context) => const LoginScreen(),
        '/register': (context) => const RegisterScreen(),
        '/startup': (context) => const StartupScreen(),
        '/home': (context) => const RoleBasedHomeScreen(),
        '/role_selection': (context) {
          final session = Supabase.instance.client.auth.currentSession;
          final phone = session?.user.phone ?? '';
          final token = session?.accessToken ?? '';
          return RoleSelectionScreen(phone: phone, token: token);
        },
      },
    );
  }
}
