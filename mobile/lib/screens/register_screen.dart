import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/ethiopia_locations.dart';
import '../data/models/registration_draft.dart';
import '../services/auth_service.dart';
import '../widgets/auth_page.dart';
import '../widgets/error_banner.dart';
import 'otp_screen.dart';
import 'phone_validation.dart';
import 'role_selection_screen.dart';

/// Registration entry point: name, location and phone number, then an OTP.
///
/// Registration still verifies the phone before anything is written, because
/// the backend only accepts POST /api/auth/register behind a valid session.
/// So this screen collects the details and sends the code; the verified OTP
/// continues to role selection.
///
/// [verifiedSession] is set when the number has just been proven by an OTP
/// sent from sign-in and no account exists behind it. There is nothing left to
/// verify, so the form collects the details and continues straight to role
/// selection.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({
    super.key,
    this.authService,
    this.phone,
    this.verifiedSession,
  });

  /// Overridable so tests can drive the duplicate-number check.
  final AuthService? authService;

  /// Phone already verified in this session, if there is one. The field is
  /// read-only then, because the backend stores whatever number is attached
  /// to the bearer token.
  final String? phone;

  /// Access token for the session proved by the OTP.
  final String? verifiedSession;

  @override
  RegisterScreenState createState() => RegisterScreenState();
}

class RegisterScreenState extends State<RegisterScreen> {
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _kebeleController = TextEditingController();
  late final AuthService _auth = widget.authService ?? AuthService();

  String? _region;
  String? _zone;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _prefillAndRedirectIfSignedIn();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _kebeleController.dispose();
    super.dispose();
  }

  void _prefillAndRedirectIfSignedIn() {
    if (widget.phone != null) _phoneController.text = widget.phone!;

    // Arriving from sign-in with a proven session is the point of this form,
    // so there is nothing to redirect away from.
    if (widget.verifiedSession != null) return;

    if (Supabase.instance.client.auth.currentSession == null) return;
    final session = Supabase.instance.client.auth.currentSession!;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      // Same rule as sign-in: a finished account belongs in the app, while an
      // abandoned registration is discarded so this form really is blank. One
      // attempt only — if the backend does not answer, the form stays put
      // instead of signing a real user out.
      final gate = await sessionGateFor(
        session.accessToken,
        auth: _auth,
        attempts: 1,
      );
      if (!mounted || gate != SessionGate.open) return;
      Navigator.pushReplacementNamed(context, '/home');
    });
  }

  // Changing the region invalidates the zone, and the zone invalidates the
  // kebele, so clear whatever is no longer reachable.
  void _onRegionChanged(String? region) {
    setState(() {
      _region = region;
      _zone = null;
      _kebeleController.clear();
    });
  }

  void _onZoneChanged(String? zone) {
    setState(() {
      _zone = zone;
      _kebeleController.clear();
    });
  }

  String? _validate({
    required String fullName,
    required String kebele,
    required String? phone,
  }) {
    if (fullName.trim().length < 2) return 'Enter your full name.';
    if (_region == null) return 'Select your region.';
    if (_zone == null) return 'Select your zone.';
    if (kebele.trim().isEmpty) return 'Select or enter your kebele.';
    if (phone == null) {
      return 'Enter a valid Ethiopian phone number, e.g. 0912345678';
    }
    return null;
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    final kebele = _kebeleController.text.trim();
    final phone = normalizeEthiopianPhone(_phoneController.text.trim());

    final validationError =
        _validate(fullName: name, kebele: kebele, phone: phone);
    if (validationError != null) {
      setState(() => _errorMessage = validationError);
      return;
    }

    final verifiedPhone = phone!;
    final draft = RegistrationDraft(
      fullName: name,
      region: _region!,
      zone: _zone!,
      kebele: kebele,
    );
    // Set when the number was verified on the way here and the backend had no
    // account behind it. Nothing left to send or check: the session is proven,
    // so registration only has to finish.
    final token = widget.verifiedSession;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      if (token != null) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => RoleSelectionScreen(
              phone: verifiedPhone,
              token: token,
              draft: draft,
            ),
          ),
        );
        return;
      }

      // Check first so an already-registered number does not get an OTP sent
      // to it. A failed lookup must not read as "not registered": stop and say
      // so, otherwise the duplicate check silently does nothing.
      final registered = await _auth.isPhoneRegistered(verifiedPhone);
      if (!mounted) return;
      if (registered == true) {
        setState(() {
          _isLoading = false;
          _errorMessage =
              'This number is already registered. Sign in with it instead.';
        });
        return;
      }
      if (registered == null) {
        setState(() {
          _isLoading = false;
          _errorMessage =
              'Could not check this number. Check your connection and try again.';
        });
        return;
      }

      await _auth.sendOtp(verifiedPhone);
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (context) => OtpScreen(
            phone: verifiedPhone,
            isRegistration: true,
            draft: draft,
          ),
        ),
      );
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = readableAuthError(e));
    } catch (e) {
      if (!mounted) return;
      debugPrint('register submit error: $e');
      setState(() => _errorMessage = 'Could not continue. Please try again.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final zones = zonesFor(_region);
    final kebeleOptions = woredasFor(_region, _zone);

    return AuthPage(
      title: 'Create Account',
      children: [
        const Icon(Icons.person_add_alt, size: 64, color: Colors.green),
        const SizedBox(height: 12),
        const Text(
          'Create your account',
          style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          widget.verifiedSession != null
              ? 'Your number is verified. Finish setting up your account.'
              : 'Tell us who you are and where you are, then verify your number',
          style: const TextStyle(fontSize: 15, color: Colors.grey),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _nameController,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: 'Full name',
            hintText: 'Abebe Bekele',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.badge_outlined),
          ),
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          initialValue: _region,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Region',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.map_outlined),
          ),
          items: [
            for (final region in kEthiopiaRegions)
              DropdownMenuItem(value: region, child: Text(region)),
          ],
          onChanged: _isLoading ? null : _onRegionChanged,
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          key: ValueKey('zone-$_region'),
          initialValue: _zone,
          isExpanded: true,
          decoration: InputDecoration(
            labelText: 'Zone',
            border: const OutlineInputBorder(),
            prefixIcon: const Icon(Icons.layers_outlined),
            helperText: _region == null ? 'Select a region first' : null,
          ),
          items: [
            for (final zone in zones)
              DropdownMenuItem(value: zone, child: Text(zone)),
          ],
          onChanged: _isLoading || _region == null ? null : _onZoneChanged,
        ),
        const SizedBox(height: 16),
        // Woredas are the closest published level to a kebele, so the field
        // offers them and still accepts a typed kebele.
        DropdownMenu<String>(
          controller: _kebeleController,
          enableFilter: true,
          enableSearch: true,
          expandedInsets: EdgeInsets.zero,
          requestFocusOnTap: true,
          menuHeight: 320,
          label: const Text('Kebele'),
          hintText: kebeleOptions.isEmpty
              ? 'Type your kebele'
              : 'Select or type your kebele',
          leadingIcon: const Icon(Icons.home_work_outlined),
          inputDecorationTheme: const InputDecorationThemeData(
            border: OutlineInputBorder(),
          ),
          dropdownMenuEntries: [
            for (final woreda in kebeleOptions)
              DropdownMenuEntry(value: woreda, label: woreda),
          ],
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.done,
          // The session belongs to this number, so letting it be edited would
          // register a different number against the token.
          enabled: widget.verifiedSession == null,
          decoration: InputDecoration(
            labelText: 'Phone Number',
            hintText: '0912 345 678',
            border: const OutlineInputBorder(),
            prefixIcon: const Icon(Icons.phone),
            helperText: widget.verifiedSession == null
                ? null
                : 'Verified in this session',
          ),
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: 20),
        AuthPrimaryButton(
          label: widget.verifiedSession != null ? 'Continue' : 'Send OTP',
          isLoading: _isLoading,
          onPressed: _submit,
        ),
        if (widget.verifiedSession == null) ...[
          const SizedBox(height: 8),
          TextButton(
            onPressed: _isLoading
                ? null
                : () => Navigator.pushReplacementNamed(context, '/login'),
            child: const Text(
              'Already have an account? Sign in',
              style: TextStyle(color: Colors.green),
            ),
          ),
        ],
        if (_errorMessage != null) ...[
          const SizedBox(height: 16),
          ErrorBanner(message: _errorMessage!),
        ],
      ],
    );
  }
}
