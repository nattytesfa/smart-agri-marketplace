import 'dart:async';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:hive/hive.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide MultipartFile;
import 'package:uuid/uuid.dart';
import '../data/models/listing_model.dart';
import '../data/remote/listings_api.dart';

class SyncService {
  SyncService({Dio? api, Box<ListingModel>? box, String? Function()? owner})
      : _apiOverride = api,
        _boxOverride = box,
        _ownerOverride = owner;
  final Dio? _apiOverride;
  final Box<ListingModel>? _boxOverride;
  final String? Function()? _ownerOverride;
  static bool _running = false;
  static Timer? _timer;

  static void start() {
    _timer ??= Timer.periodic(
        const Duration(seconds: 30), (_) => SyncService().syncListings());
    SyncService().syncListings();
  }

  Future<void> syncListings({bool retry = false}) async {
    if (_running) return;
    final owner = _ownerOverride != null
        ? _ownerOverride!()
        : Supabase.instance.client.auth.currentUser?.id;
    if (owner == null) return;
    final api = _apiOverride ?? listingApi();
    final box = _boxOverride ?? Hive.box<ListingModel>('listings');
    _running = true;
    try {
      // Recover requests interrupted by process death, without changing their
      // idempotency keys or leaving "Syncing" displayed indefinitely offline.
      for (final listing in box.values.toList()) {
        if (listing.farmerId == owner &&
            listing.syncStatus == 'local' &&
            listing.syncState == 'syncing') {
          listing.syncState = 'pending';
          await listing.save();
        }
      }
      // Interface connectivity is not enough: verify the actual API is reachable.
      await api.get('/listings', queryParameters: {'limit': 1});
      for (final listing in box.values.toList()) {
        if (listing.farmerId != owner || listing.syncStatus == 'cloud') {
          continue;
        }
        if (listing.syncState == 'review') continue;
        if (!retry &&
            listing.nextAttempt != null &&
            listing.nextAttempt!.isAfter(DateTime.now())) {
          continue;
        }
        // A conflict needs explicit user resolution, not an automatic overwrite.
        if (listing.syncState == 'failed' &&
            listing.syncError?.startsWith('Conflict:') == true) {
          continue;
        }
        listing.clientId ??= const Uuid().v4();
        listing.operationId ??= const Uuid().v4();
        listing.syncState = 'syncing';
        if (listing.id == null) listing.uploadAttempted = true;
        listing.attempts++;
        await listing.save();
        try {
          // Deletion supersedes unsent edits/images for a known server record.
          if (listing.deleted && listing.id != null) {
            await api.delete('/listings/${listing.id}',
                data: {'version': listing.version});
            await listing.delete();
            continue;
          }
          if (listing.corePending || listing.id == null) {
            final response = listing.id == null
                ? await api.post('/listings', data: listing.toJson())
                : await api.put('/listings/${listing.id}',
                    data: listing.toJson());
            final remote = response.data['listing'];
            listing.id = remote['listing_id'];
            listing.version = remote['version'];
            if (remote['last_operation_id'] != null &&
                remote['last_operation_id'] != listing.operationId) {
              await listing.save();
              throw DioException(
                  requestOptions: response.requestOptions,
                  response: Response(
                      requestOptions: response.requestOptions,
                      statusCode: 409,
                      data: {
                        'error':
                            'A previous upload exists with different changes. Review its server version.'
                      }));
            }
            listing.corePending = false;
            await listing.save();
          }
          if (listing.deleted) {
            await api.delete('/listings/${listing.id}',
                data: {'version': listing.version});
            await listing.delete();
            continue;
          }
          if (listing.imagePending && listing.imagePath != null) {
            listing.imageId ??= const Uuid().v4();
            await listing.save();
            final upload = await api.post(
                '/listings/${listing.id}/images/${listing.imageId}',
                data: FormData.fromMap({
                  'image': await MultipartFile.fromFile(listing.imagePath!)
                }));
            listing.imageUrl = upload.data['image_url'];
            // A stable image operation UUID also makes a lost update response safe to replay.
            final payload = listing.toJson()
              ..['operation_id'] = listing.imageId;
            final response =
                await api.put('/listings/${listing.id}', data: payload);
            listing.version = response.data['listing']['version'];
            listing.imagePending = false;
          }
          listing.syncStatus = 'cloud';
          listing.syncState = 'synced';
          listing.syncError = null;
          listing.nextAttempt = null;
          listing.attempts = 0;
          await listing.save();
        } catch (e) {
          listing.syncState = 'failed';
          final code = e is DioException ? e.response?.statusCode : null;
          final message = e is DioException ? e.response?.data : null;
          listing.syncError = code == 409
              ? 'Conflict: $message Refresh and review server changes.'
              : 'Unable to sync${listing.imagePending ? ' image' : ''}. ${message ?? 'Check your connection and retry.'}';
          listing.nextAttempt = DateTime.now().add(Duration(
              seconds: min(900, 5 * pow(2, min(listing.attempts, 8)).toInt())));
          await listing.save();
        }
      }
    } catch (_) {
      // Leave durable pending operations intact when the backend is unreachable.
    } finally {
      _running = false;
    }
  }
}
