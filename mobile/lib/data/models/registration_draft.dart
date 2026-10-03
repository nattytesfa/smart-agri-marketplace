/// The details collected on the registration screen before the OTP is sent.
///
/// Registration verifies the phone first, so these values are captured up
/// front and handed to the register endpoint once the session exists.
class RegistrationDraft {
  const RegistrationDraft({
    required this.fullName,
    required this.region,
    required this.zone,
    required this.kebele,
  });

  final String fullName;
  final String region;
  final String zone;
  final String kebele;

  /// Body for `POST /api/auth/register`.
  Map<String, dynamic> toRegisterBody(String phone) => {
        'phone_number': phone,
        'full_name': fullName,
        'region': region,
        'zone': zone,
        'kebele': kebele,
      };
}
