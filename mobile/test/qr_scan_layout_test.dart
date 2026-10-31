import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:smart_agri_marketplace/data/remote/transactions_api.dart';
import 'package:smart_agri_marketplace/features/traceability_qr/delivery_qr.dart';
import 'package:smart_agri_marketplace/features/traceability_qr/presentation/screens/qr_scan_screen.dart';

class FakeCamera extends MobileScannerPlatform {
  final captures = StreamController<BarcodeCapture?>.broadcast();
  int starts = 0, stops = 0;
  @override
  Stream<BarcodeCapture?> get barcodesStream => captures.stream;
  @override
  Stream<TorchState> get torchStateStream => const Stream.empty();
  @override
  Stream<double> get zoomScaleStateStream => const Stream.empty();
  @override
  Widget buildCameraView() => const ColoredBox(color: Colors.black);
  @override
  Future<MobileScannerViewAttributes> start(StartOptions options) async {
    starts++;
    return const MobileScannerViewAttributes(
        cameraDirection: CameraFacing.back,
        currentTorchMode: TorchState.off,
        size: Size(640, 480),
        numberOfCameras: 2);
  }

  @override
  Future<void> stop() async {
    stops++;
  }

  @override
  Future<void> dispose() async {}
  void scan(String text) =>
      captures.add(BarcodeCapture(barcodes: [Barcode(rawValue: text)]));
}

class VerificationApi extends TransactionsApi {
  VerificationApi({this.reject = true}) : super(dio: Dio());
  final bool reject;
  int calls = 0;
  static final message =
      'This delivery QR has expired or was already used. Ask the farmer to generate a new QR code and try again. ' *
          5;
  @override
  Future<void> action(String id, String action,
      [Map<String, dynamic>? data]) async {
    calls++;
    if (reject) {
      final request = RequestOptions(path: '/verify-delivery');
      throw DioException(
          requestOptions: request,
          response: Response(
              requestOptions: request,
              statusCode: 409,
              data: {'error': message, 'code': 'DELIVERY_QR_EXPIRED'}),
          type: DioExceptionType.badResponse);
    }
  }
}

void main() {
  const transaction = '11111111-1111-4111-8111-111111111111';
  const allocation = '22222222-2222-4222-8222-222222222222';
  final payload = DeliveryQr(transaction, allocation, 'a' * 43).encode();
  late FakeCamera camera;
  late MobileScannerPlatform previous;
  setUp(() {
    previous = MobileScannerPlatform.instance;
    camera = FakeCamera();
    MobileScannerPlatform.instance = camera;
  });
  tearDown(() async {
    await camera.captures.close();
    MobileScannerPlatform.instance = previous;
  });

  for (final size in [
    const Size(360, 480),
    const Size(424, 780),
    const Size(720, 360)
  ]) {
    testWidgets('long verification failure remains scrollable at $size',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = VerificationApi();
      await tester.pumpWidget(MaterialApp(
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: const TextScaler.linear(1.4)),
              child: child!),
          home: QrScanScreen(
              transactionId: transaction, allocationId: allocation, api: api)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      camera.scan(payload);
      camera.scan(payload);
      // The processing overlay keeps animating while confirmation is open.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(api.calls, 0);
      expect(find.text('Confirm physical delivery'), findsOneWidget);
      await tester.ensureVisible(find.text('Quantity and quality confirmed'));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.text('Quantity and quality confirmed'));
      await tester.pumpAndSettle();
      expect(api.calls, 1);
      expect(find.text(VerificationApi.message), findsOneWidget);
      expect(find.text('Delivery could not be verified'), findsOneWidget);
      expect(find.textContaining('DioException'), findsNothing);
      expect(find.text('Position the QR code within the frame'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(find.text('Restart Scanner'), 120,
          scrollable: find.descendant(
              of: find.byKey(const ValueKey('qr-scan-status-scroll')),
              matching: find.byType(Scrollable)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Restart Scanner'));
      await tester.pumpAndSettle();
      expect(camera.starts, 2);
      expect(find.text(VerificationApi.message), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    });
  }

  testWidgets(
      'invalid QR stays local and cancelled confirmation never verifies delivery',
      (tester) async {
    final api = VerificationApi();
    await tester.pumpWidget(MaterialApp(
        home: QrScanScreen(
            transactionId: transaction, allocationId: allocation, api: api)));
    await tester.pumpAndSettle();
    camera.scan('invalid QR');
    await tester.pumpAndSettle();
    expect(find.text('Invalid QR code format'), findsOneWidget);
    expect(api.calls, 0);
    await tester.ensureVisible(find.text('Restart Scanner'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Restart Scanner'));
    await tester.pumpAndSettle();
    camera.scan(payload);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Not confirmed'));
    await tester.pumpAndSettle();
    expect(api.calls, 0);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });
}
