import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:smart_agri_marketplace/data/models/listing_model.dart';
import 'package:smart_agri_marketplace/features/listings/presentation/screens/listing_list_screen.dart';
import 'package:smart_agri_marketplace/features/listings/presentation/widgets/listing_card.dart';
import 'package:smart_agri_marketplace/features/listings/presentation/widgets/marketplace_ui.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    dotenv.loadFromString(
        envString: 'BACKEND_API_BASE_URL=https://marketplace.test/api');
    await Supabase.initialize(
      url: 'https://test.supabase.co',
      publishableKey: 'test-key',
      authOptions: const FlutterAuthClientOptions(
          autoRefreshToken: false, detectSessionInUri: false),
    );
  });
  tearDownAll(() => Supabase.instance.dispose());

  for (final width in [320.0, 390.0, 900.0]) {
    testWidgets('browse scrolls without overflow at $width pixels',
        (tester) async {
      tester.view.physicalSize = Size(width, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const MaterialApp(home: ListingListScreen()));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(
          find.descendant(
              of: find.byType(AppBar), matching: find.byTooltip('Filters')),
          findsNothing);
      expect(find.byTooltip('Filter produce'), findsOneWidget);
      await tester.tap(find.byTooltip('Filter produce'));
      await tester.pumpAndSettle();
      expect(find.text('Filter produce'), findsOneWidget);
      expect(find.text('Apply filters'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.drag(
          find.byType(SingleChildScrollView).last, const Offset(0, -1600));
      await tester.pumpAndSettle();
      expect(find.text('Apply filters').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Close filters'));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -350));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Let’s reconnect'), findsOneWidget);
    });

    testWidgets('marketplace components fit a $width pixel viewport',
        (tester) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var tapped = false;
      await tester.pumpWidget(MaterialApp(
          home: MarketplaceTheme(
              child: Scaffold(
        body: SingleChildScrollView(
            child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(children: [
            const MarketIntro(
                eyebrow: 'Fresh from the farm',
                title: 'Good produce. Fair prices.',
                subtitle:
                    'Discover harvests and connect directly with growers.'),
            const SizedBox(height: 16),
            const MarketNotice(
                message: 'Saved changes sync when the server is reachable.'),
            const SizedBox(height: 16),
            ListingCard(
                listing: ListingModel(
                    cropType: 'Teff',
                    variety: 'White',
                    quantity: 5,
                    pricePerUnit: 3000.75,
                    kebele: 'Bole'),
                showSync: true,
                onTap: () => tapped = true),
          ]),
        )),
      ))));
      expect(tester.takeException(), isNull);
      expect(find.text('ETB 3000.75 / quintal'), findsOneWidget);
      await tester.tap(find.text('ETB 3000.75 / quintal'));
      expect(tapped, isTrue);
    });
  }
}
