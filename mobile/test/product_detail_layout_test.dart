import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/data/models/listing_model.dart';
import 'package:smart_agri_marketplace/features/listings/presentation/screens/listing_detail_screen.dart';

void main() {
  ListingModel produce({String status = 'available'}) => ListingModel(
        id: 'listing-1',
        farmerId: 'farmer-1',
        farmerName: 'Abebe Farm',
        cropType: 'Teff',
        variety: 'White',
        quantity: 5,
        pricePerUnit: 3000.75,
        kebele: 'Bole',
        status: status,
        harvestDate: '2026-10-20',
        qualityGrade: 'B',
        description: 'ጤፍ\nFreshly harvested and ready for pickup.',
      );

  for (final width in [320.0, 390.0, 900.0]) {
    testWidgets('buyer detail and fixed purchase action fit $width pixels',
        (tester) async {
      tester.view.physicalSize = Size(width, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      FlutterSecureStorage.setMockInitialValues({'user_role': 'buyer'});
      await tester.pumpWidget(
          MaterialApp(home: ListingDetailScreen(listing: produce())));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('ETB 15003.75'), findsOneWidget);
      expect(find.text('Buy full listing').hitTestable(), findsOneWidget);
      await tester.drag(find.byType(ListView), const Offset(0, -1600));
      await tester.pumpAndSettle();
      expect(find.text('Abebe Farm'), findsOneWidget);
      expect(find.text('Buy full listing').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('sold produce cannot be purchased', (tester) async {
    FlutterSecureStorage.setMockInitialValues({'user_role': 'buyer'});
    await tester.pumpWidget(MaterialApp(
        home: ListingDetailScreen(listing: produce(status: 'sold'))));
    await tester.pumpAndSettle();
    expect(find.text('Buy full listing'), findsNothing);
    expect(find.text('SOLD'), findsOneWidget);
  });

  testWidgets('owner keeps management controls without buyer action',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues({'user_role': 'farmer'});
    await tester.pumpWidget(MaterialApp(
        home: ListingDetailScreen(listing: produce(), owner: true)));
    await tester.pumpAndSettle();
    expect(find.text('YOUR LISTING'), findsOneWidget);
    expect(find.text('Buy full listing'), findsNothing);
    await tester.scrollUntilVisible(find.text('Edit listing'), 400);
    expect(find.text('Edit listing'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);
    expect(find.text('Retry Sync'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
