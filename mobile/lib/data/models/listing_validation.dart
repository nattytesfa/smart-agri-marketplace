const cropTypes = [
  'Teff',
  'Wheat',
  'Maize',
  'Barley',
  'Sorghum',
  'Beans',
  'Other'
];
const listingUnits = ['quintal', 'kg', 'ton'];
const qualityGrades = {
  'A': 'Grade A — High Quality',
  'B': 'Grade B — Standard Quality',
  'C': 'Grade C — Lower Quality',
  'not_graded': 'Not Graded'
};

String? requiredText(String? v) =>
    v == null || v.trim().isEmpty ? 'This field is required' : null;
String? positiveNumber(String? v) {
  final n = double.tryParse(v ?? '');
  return n == null || !n.isFinite || n <= 0
      ? 'Enter a number greater than zero'
      : null;
}

String? descriptionValidation(String? v) =>
    (v?.runes.length ?? 0) > 500 ? 'Use at most 500 characters' : null;
String? locationValidation(double? lat, double? lng, String? kebele) {
  if (lat != null || lng != null) {
    return lat == null ||
            lng == null ||
            !lat.isFinite ||
            !lng.isFinite ||
            lat.abs() > 90 ||
            lng.abs() > 180
        ? 'Invalid GPS coordinates'
        : null;
  }
  return (kebele?.trim().isEmpty ?? true)
      ? 'Enter a Kebele or capture GPS location'
      : null;
}
