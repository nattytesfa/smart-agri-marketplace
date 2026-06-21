import 'package:hive/hive.dart';

part 'listing_model.g.dart';

@HiveType(typeId: 0)
class ListingModel extends HiveObject {
  @HiveField(0)
  String? id; // server assigned after sync

  @HiveField(1)
  String cropType;

  @HiveField(2)
  String? variety;

  @HiveField(3)
  double quantity;

  @HiveField(4)
  String unit; // 'quintal'

  @HiveField(5)
  double pricePerUnit;

  @HiveField(6)
  double? latitude;

  @HiveField(7)
  double? longitude;

  @HiveField(8)
  String? harvestDate; // ISO string

  @HiveField(9)
  String status; // 'available', 'reserved', 'sold'

  @HiveField(10)
  String syncStatus; // 'local' or 'cloud'

  @HiveField(11)
  String? imagePath; // local file path

  @HiveField(12)
  DateTime createdAt;

  ListingModel({
    this.id,
    required this.cropType,
    this.variety,
    required this.quantity,
    this.unit = 'quintal',
    required this.pricePerUnit,
    this.latitude,
    this.longitude,
    this.harvestDate,
    this.status = 'available',
    this.syncStatus = 'local',
    this.imagePath,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  // Convert to JSON for API
  Map<String, dynamic> toJson() => {
        'crop_type': cropType,
        'variety': variety,
        'quantity': quantity,
        'unit': unit,
        'price_per_unit': pricePerUnit,
        'location_lat': latitude,
        'location_lng': longitude,
        'harvest_date': harvestDate,
        'status': status,
        'sync_status': syncStatus,
      };
}
