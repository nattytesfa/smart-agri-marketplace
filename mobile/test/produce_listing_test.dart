import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:smart_agri_marketplace/data/models/listing_model.dart';
import 'package:smart_agri_marketplace/data/models/listing_validation.dart';
import 'package:smart_agri_marketplace/services/sync_service.dart';
import 'package:smart_agri_marketplace/features/listings/presentation/widgets/listing_card.dart';

class FakeApi implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  final records = <String, Map<String, dynamic>>{};
  bool offline = false, failCreate = false, failImage = false, conflict = false;
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? stream,
      Future<void>? cancelFuture) async {
    requests.add(options);
    if (offline) {
      throw DioException(
          requestOptions: options, type: DioExceptionType.connectionError);
    }
    if (stream != null) await stream.drain<void>();
    dynamic data;
    var status = 200;
    if (options.method == 'GET') {
      data = [];
    } else if (options.path.contains('/images/')) {
      status = failImage ? 503 : 200;
      data = failImage
          ? {'error': 'storage unavailable'}
          : {'image_url': 'https://storage.example/crop.jpg'};
    } else if (options.method == 'POST') {
      if (failCreate) {
        status = 503;
        data = {'error': 'unavailable'};
      } else {
        final j = Map<String, dynamic>.from(options.data);
        final key = j['client_id'] as String;
        records.putIfAbsent(
            key, () => {...j, 'listing_id': 'server-$key', 'version': 1});
        data = {'listing': records[key]};
        status = 201;
      }
    } else if (options.method == 'PUT') {
      if (conflict) {
        status = 409;
        data = {'error': 'version conflict'};
      } else {
        final j = Map<String, dynamic>.from(options.data);
        final key = j['client_id'] as String;
        records[key] = {
          ...j,
          'listing_id': 'server-$key',
          'version': (j['version'] as int) + 1
        };
        data = {'listing': records[key]};
      }
    } else if (options.method == 'DELETE') {
      records.removeWhere(
          (_, r) => r['listing_id'] == options.path.split('/').last);
      data = {'deleted': true};
    }
    return ResponseBody.fromString(jsonEncode(data), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType]
    });
  }

  @override
  void close({bool force = false}) {}
}

// Writes the original 13 fields, proving new nullable/default fields do not break old boxes.
class LegacyAdapter extends TypeAdapter<ListingModel> {
  @override
  int get typeId => 0;
  @override
  ListingModel read(BinaryReader reader) => throw UnimplementedError();
  @override
  void write(BinaryWriter w, ListingModel l) {
    final values = [
      l.id,
      l.cropType,
      l.variety,
      l.quantity,
      l.unit,
      l.pricePerUnit,
      l.latitude,
      l.longitude,
      l.harvestDate,
      l.status,
      l.syncStatus,
      l.imagePath,
      l.createdAt
    ];
    w.writeByte(13);
    for (var i = 0; i < values.length; i++) {
      w.writeByte(i);
      w.write(values[i]);
    }
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  late Box<ListingModel> box;
  late FakeApi fake;
  late SyncService sync;
  ListingModel listing() => ListingModel(
      clientId: 'local-1',
      farmerId: 'farmer',
      operationId: 'operation-1',
      cropType: 'Teff',
      variety: 'White',
      quantity: 2,
      pricePerUnit: 3000,
      kebele: 'Bole');
  setUp(() async {
    dir = await Directory('/tmp/opencode').createTemp('produce-test-');
    Hive.init(dir.path);
    if (!Hive.isAdapterRegistered(0)) {
      Hive.registerAdapter(ListingModelAdapter());
    }
    box = await Hive.openBox<ListingModel>('listings');
    fake = FakeApi();
    final api = Dio(BaseOptions(baseUrl: 'https://api.example/api'))
      ..httpClientAdapter = fake;
    sync = SyncService(api: api, box: box, owner: () => 'farmer');
  });
  tearDown(() async {
    await Hive.close();
    await dir.delete(recursive: true);
  });

  test('required fields only, optional image null', () {
    final l = listing();
    final j = l.toJson();
    expect(j['image_url'], isNull);
    expect(j['harvest_date'], isNull);
    expect(j['description'], isNull);
    expect(j['quality_grade'], isNull);
    expect(locationValidation(l.latitude, l.longitude, l.kebele), isNull);
    expect(l.unit, 'quintal');
    expect(l.syncLabel, 'Pending Sync');
  });
  test('rejects negative and nonfinite quantity/price', () {
    for (final value in ['-1', '0', 'NaN', 'Infinity', 'abc', '']) {
      expect(positiveNumber(value), isNotNull);
    }
    expect(positiveNumber('0.001'), isNull);
  });
  test('crop and variety are required', () {
    expect(requiredText('  '), isNotNull);
    expect(requiredText('Teff'), isNull);
  });
  test('location validates GPS pair and Kebele fallback', () {
    expect(locationValidation(null, null, ''), isNotNull);
    expect(locationValidation(9, null, 'Bole'), isNotNull);
    expect(locationValidation(91, 38, null), isNotNull);
    expect(locationValidation(0, 0, null), isNull);
    expect(locationValidation(null, null, 'Bole'), isNull);
  });
  test('description max length and Amharic line breaks', () {
    expect(descriptionValidation('a' * 501), isNotNull);
    expect(descriptionValidation('a' * 500), isNull);
    final l = listing()..description = 'Fresh\nጤፍ';
    expect(l.toJson()['description'], 'Fresh\nጤፍ');
  });
  test('optional harvest and grade survive persistent restart', () async {
    final l = listing()
      ..harvestDate = '2026-01-01'
      ..qualityGrade = 'A'
      ..description = 'ጤፍ\nFresh';
    await box.add(l);
    await box.close();
    box = await Hive.openBox<ListingModel>('listings');
    final restored = box.values.single;
    expect(restored.harvestDate, '2026-01-01');
    expect(restored.qualityGrade, 'A');
    expect(restored.description, 'ጤፍ\nFresh');
    expect(restored.clientId, 'local-1');
  });
  test('legacy Hive records retain original fields and safe defaults',
      () async {
    await box.close();
    Hive.registerAdapter(LegacyAdapter(), override: true);
    box = await Hive.openBox<ListingModel>('listings');
    await box.add(listing());
    await box.close();
    Hive.registerAdapter(ListingModelAdapter(), override: true);
    box = await Hive.openBox<ListingModel>('listings');
    final restored = box.values.single;
    expect(restored.cropType, 'Teff');
    expect(restored.attempts, 0);
    expect(restored.deleted, false);
    expect(restored.corePending, true);
    expect(restored.imagePending, false);
    expect(restored.farmerId,
        isNull); // Never silently assign old drafts to a different account.
  });
  testWidgets('crop-specific placeholder is displayed without an image',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(body: ProduceImage(cropType: 'Teff'))));
    expect(find.text('Teff'), findsOneWidget);
    expect(find.byIcon(Icons.agriculture), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });
  testWidgets('card shows unit price, sync state and grade', (tester) async {
    final l = listing()..qualityGrade = 'B';
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ListingCard(listing: l, onTap: () {}, showSync: true))));
    expect(find.text('ETB 3000 / quintal'), findsOneWidget);
    expect(find.textContaining('Pending Sync'), findsOneWidget);
    expect(find.textContaining('Farmer-reported:'), findsOneWidget);
  });
  test('offline save persists and unreachable server does not lose listing',
      () async {
    await box.add(listing());
    fake.offline = true;
    await sync.syncListings();
    await box.close();
    box = await Hive.openBox<ListingModel>('listings');
    expect(box.values.single.syncStatus, 'local');
    expect(box.values.single.clientId, 'local-1');
  });
  test('pending listing syncs without image and reconciles server ID',
      () async {
    final l = listing();
    await box.add(l);
    await sync.syncListings();
    expect(l.syncStatus, 'cloud');
    expect(l.id, 'server-local-1');
    expect(l.version, 1);
    expect(fake.requests.where((r) => r.path.contains('/images/')), isEmpty);
  });
  test('interrupted sync recovers to pending even without connectivity',
      () async {
    final l = listing()
      ..syncState = 'syncing'
      ..uploadAttempted = true;
    await box.add(l);
    fake.offline = true;
    await sync.syncListings();
    expect(l.syncLabel, 'Pending Sync');
    expect(l.uploadAttempted, true);
    expect(l.operationId, 'operation-1');
  });
  test('failure is durable, backoff applies and manual retry succeeds',
      () async {
    final l = listing();
    await box.add(l);
    fake.failCreate = true;
    await sync.syncListings();
    expect(l.syncLabel, 'Sync Failed');
    expect(l.syncError, isNotNull);
    expect(l.nextAttempt, isNotNull);
    final count = fake.requests.length;
    await sync.syncListings();
    expect(fake.requests.length, count + 1); // reachability only
    fake.failCreate = false;
    await sync.syncListings(retry: true);
    expect(l.syncLabel, 'Synced');
  });
  test('parallel sync calls cannot duplicate upload', () async {
    await box.add(listing());
    await Future.wait([sync.syncListings(), sync.syncListings()]);
    expect(fake.requests.where((r) => r.method == 'POST').length, 1);
    expect(fake.records.length, 1);
  });
  test('editing pending listing retains stable identity and one record',
      () async {
    final l = listing();
    await box.add(l);
    l.quantity = 9;
    l.queueChange();
    await l.save();
    await sync.syncListings();
    expect(fake.records.length, 1);
    expect(fake.records.values.single['quantity'], 9);
  });
  test('offline edit of synced listing updates instead of creating', () async {
    final l = listing();
    await box.add(l);
    await sync.syncListings();
    l.description = 'Updated';
    l.queueChange();
    await l.save();
    await sync.syncListings();
    expect(fake.records.length, 1);
    expect(l.version, 2);
    expect(fake.records.values.single['description'], 'Updated');
  });
  test(
      'image upload failure preserves listing and retries only pending operations',
      () async {
    final file = File('${dir.path}/crop.jpg');
    await file.writeAsBytes([255, 216, 255, 217]);
    final l = listing()
      ..imagePath = file.path
      ..imagePending = true;
    await box.add(l);
    fake.failImage = true;
    await sync.syncListings();
    expect(l.id, isNotNull);
    expect(l.corePending, false);
    expect(l.syncLabel, 'Sync Failed');
    expect(l.imagePending, true);
    final imageId = l.imageId;
    fake.failImage = false;
    await sync.syncListings(retry: true);
    expect(l.imageId, imageId);
    expect(l.syncLabel, 'Synced');
    expect(l.imagePending, false);
    expect(l.imageUrl, 'https://storage.example/crop.jpg');
    expect(fake.records.length, 1);
    expect(
        fake.requests
            .where((r) => r.method == 'POST' && r.path == '/listings')
            .length,
        1);
  });
  test('delete queued online listing removes server and local record',
      () async {
    final l = listing();
    await box.add(l);
    await sync.syncListings();
    l.quantity = 99;
    l.queueChange();
    l.deleted = true;
    l.syncStatus = 'local';
    await l.save();
    await sync.syncListings();
    expect(box.isEmpty, true);
    expect(fake.records, isEmpty);
    expect(fake.requests.where((r) => r.method == 'PUT'), isEmpty);
  });
  test('other account drafts are never uploaded', () async {
    final l = listing()..farmerId = 'another-user';
    await box.add(l);
    await sync.syncListings();
    expect(l.syncStatus, 'local');
    expect(fake.records, isEmpty);
  });
  test('server conflict is visible and never automatically overwritten',
      () async {
    final l = listing();
    await box.add(l);
    await sync.syncListings();
    l.queueChange();
    await l.save();
    fake.conflict = true;
    await sync.syncListings();
    expect(l.syncError, startsWith('Conflict:'));
    final count = fake.requests.length;
    await sync.syncListings(retry: true);
    expect(fake.requests.length, count + 1);
  });
}
