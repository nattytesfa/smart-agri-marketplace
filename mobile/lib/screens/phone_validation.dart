/// Normalizes Ethiopian phone input to E.164 (`+2519XXXXXXXX`).
///
/// Accepts the formats a user is likely to type: `+251912345678`,
/// `251912345678`, `0912345678`, `912345678`. Spaces, dashes and parentheses
/// are ignored. Returns null when the number is not a valid Ethiopian mobile
/// number (9 digits starting with 9).
String? normalizeEthiopianPhone(String raw) {
  var digits = raw.replaceAll(RegExp(r'[\s\-()]'), '');

  if (digits.startsWith('00')) {
    digits = digits.substring(2);
  }

  if (digits.startsWith('+251')) {
    digits = digits.substring(4);
  } else if (digits.startsWith('251')) {
    digits = digits.substring(3);
  } else if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  if (digits.length != 9 || !RegExp(r'^9\d{8}$').hasMatch(digits)) {
    return null;
  }

  return '+251$digits';
}
