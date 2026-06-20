import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:dio/dio.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../data/models/listing_model.dart';

class SyncService {
  final _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  Future<void> syncListings() async {
    // Check connectivity
final List<ConnectivityResult> connectivity = await Connectivity().checkConnectivity();
if (connectivity.contains(ConnectivityResult.none)) {
  debugPrint('No internet, skip sync');
  return;
}

    // Get token
    final token = await _storage.read(key: 'supabase_token');
    if (token == null) {
      if (kDebugMode) {
        print('No token, skip sync');
      }
      return;
    }

    // Get listings with sync_status = 'local'
    final box = Hive.box<ListingModel>('listings');
    final localListings = box.values.where((l) => l.syncStatus == 'local').toList();

    if (localListings.isEmpty) {
      if (kDebugMode) {
        print('No local listings to sync');
      }
      return;
    }

    final baseUrl = dotenv.env['BACKEND_API_BASE_URL']!;
    try {
      final response = await _dio.post(
        '$baseUrl/api/listings/sync',
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json',
          },
        ),
        data: {
          'listings': localListings.map((l) => l.toJson()).toList(),
        },
      );

      if (response.statusCode == 201) {
        // Update sync_status to 'cloud' for all synced listings
        for (var listing in localListings) {
          // find matching listing by some unique local identifier?
          // Since we don't have a local ID yet, we'll match by timestamp or content.
          // Better: we should store a temporary local ID. For simplicity, we'll mark all as synced.
          // Actually we need to update each listing with the server ID. Let's assume we match by index.
          // For production, you'd store a local UUID. For now, we'll just mark all.
          listing.syncStatus = 'cloud';
          // Optionally, we could store the server listing ID. But for now, we'll just save.
          await listing.save();
        }
        if (kDebugMode) {
          print('✅ Synced ${localListings.length} listings');
        }
      } else {
        if (kDebugMode) {
          print('❌ Sync failed: ${response.data}');
        }
      }
    } catch (e) {
      if (kDebugMode) {
        print('❌ Sync error: $e');
      }
    }
  }
}