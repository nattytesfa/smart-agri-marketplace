import 'package:hive/hive.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/listing_model.dart';
import '../remote/listings_api.dart';

class ListingRepository {
  Box<ListingModel> get box => Hive.box<ListingModel>('listings');
  String? get owner => Supabase.instance.client.auth.currentUser?.id;

  Future<void> refresh() async {
    final response = await listingApi().get('/listings/me');
    final remote = (response.data as List)
        .map((j) => ListingModel.fromJson(Map<String, dynamic>.from(j)))
        .toList();
    for (final listing in remote) {
      final matches = box.values
          .where((l) =>
              l.farmerId == owner &&
              (l.id == listing.id ||
                  (l.clientId != null && l.clientId == listing.clientId)))
          .toList();
      if (matches.isEmpty) {
        await box.add(listing);
      } else if (matches.first.syncStatus == 'cloud') {
        await box.put(matches.first.key, listing);
      }
    }
    final ids = remote.map((l) => l.id).toSet();
    for (final local in box.values.toList()) {
      if (local.farmerId == owner &&
          local.syncStatus == 'cloud' &&
          !ids.contains(local.id)) {
        await local.delete();
      }
    }
  }
}
