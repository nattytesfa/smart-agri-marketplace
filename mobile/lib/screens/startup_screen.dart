import 'dart:async';

import 'package:flutter/material.dart';

import '../services/auth_service.dart';

/// Shown at launch when a session was found on disk.
///
/// A stored session proves the phone number and nothing else, so the app cannot
/// know whether the account behind it was ever finished, or even whether the
/// backend is reachable. Rather than guess — either letting an unfinished
/// sign-up in or signing a real user out when the network is slow — this screen
/// waits, visibly, for the backend to answer.
///
/// It leaves on the backend's verdict, never on a timer: home when an account
/// is confirmed, the welcome screen when there is none. Waiting ends when the
/// backend answers, which is the whole point — an 8 second cap used to end it
/// with a sign-out instead.
class StartupScreen extends StatefulWidget {
  const StartupScreen({
    super.key,
    this.authService,
    this.retryDelay,
    this.token,
    this.wait,
  });

  /// Overridable so tests can drive the wait without a real session.
  final AuthService? authService;

  /// How long to wait between attempts. Shortened in tests.
  final Duration? retryDelay;

  /// The session to judge. Defaults to the session Supabase restored, which is
  /// what the app uses; tests pass one in because they have no real session.
  final String? token;

  /// How the delay between attempts is served. Tests park it so they can run
  /// the loop one attempt at a time instead of waiting on a real timer.
  final Future<void> Function(Duration)? wait;

  @override
  State<StartupScreen> createState() => _StartupScreenState();
}

class _StartupScreenState extends State<StartupScreen> {
  /// Bumped for every attempt, and read back after each await. Disposing the
  /// screen (a fast sign-out, say) leaves any attempt in flight unable to
  /// navigate.
  int _run = 0;

  @override
  void initState() {
    super.initState();
    // A post-frame callback is what lets the first frame paint the connecting
    // state before the first request goes out; the token is read inside it so
    // a sign-out during that frame is seen.
    WidgetsBinding.instance.addPostFrameCallback((_) => _waitForBackend());
  }

  @override
  void dispose() {
    _run++;
    super.dispose();
  }

  Future<void> _waitForBackend() async {
    final run = _run;
    if (!mounted) return;

    final token = widget.token ?? AuthService.currentSessionToken;
    if (token == null) {
      // Signed out between the launch decision and this frame. There is no
      // session left to judge, so nothing to wait for.
      _leave('/login');
      return;
    }

    final gate = await sessionGateFor(
      token,
      auth: widget.authService,
      retryDelay: widget.retryDelay ?? const Duration(seconds: 3),
      wait: widget.wait,
    );

    if (!mounted || run != _run || gate == SessionGate.noAnswer) return;
    _leave(gate == SessionGate.open ? '/home' : '/login');
  }

  void _leave(String route) {
    Navigator.pushNamedAndRemoveUntil(context, route, (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.agriculture, size: 64, color: Colors.green),
              const SizedBox(height: 24),
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 3),
              ),
              const SizedBox(height: 20),
              const Text(
                'Connecting…',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 32),
                child: Text(
                  'Still checking your account with the server. This will '
                  'finish as soon as the server answers.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
