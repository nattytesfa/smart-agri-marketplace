import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/data/ethiopia_locations.dart';

void main() {
  test('exposes regions alphabetically', () {
    expect(kEthiopiaRegions, isNotEmpty);
    expect(kEthiopiaRegions, orderedEquals([...kEthiopiaRegions]..sort()));
    expect(kEthiopiaRegions, contains('Amhara'));
  });

  test('every region has zones', () {
    for (final region in kEthiopiaRegions) {
      expect(zonesFor(region), isNotEmpty, reason: '$region has no zones');
    }
  });

  test('zones follow the selected region', () {
    expect(zonesFor('Amhara'), contains('East Gojam'));
    expect(zonesFor('Amhara'), isNot(contains('Harar')));
  });

  test('unknown or null region yields no zones', () {
    expect(zonesFor(null), isEmpty);
    expect(zonesFor('Nowhere'), isEmpty);
    expect(woredasFor(null, 'East Gojam'), isEmpty);
    expect(woredasFor('Nowhere', 'East Gojam'), isEmpty);
    expect(woredasFor('Amhara', 'Nowhere'), isEmpty);
  });

  test('zones have woredas to offer as kebele options', () {
    final zone = zonesFor('Amhara').first;
    expect(woredasFor('Amhara', zone), isNotEmpty);
  });
}
