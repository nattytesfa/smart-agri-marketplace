import 'package:hive/hive.dart';
import 'package:uuid/uuid.dart';

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

  @HiveField(13)
  String? clientId;
  @HiveField(14)
  String? farmerId;
  @HiveField(15)
  String? kebele;
  @HiveField(16)
  String? qualityGrade;
  @HiveField(17)
  String? description;
  @HiveField(18)
  String? imageUrl;
  @HiveField(19)
  int? version;
  @HiveField(20)
  String? operationId;
  @HiveField(21)
  String? syncState;
  @HiveField(22)
  String? syncError;
  @HiveField(23, defaultValue: 0)
  int attempts;
  @HiveField(24)
  DateTime? nextAttempt;
  @HiveField(25, defaultValue: false)
  bool deleted;
  @HiveField(26, defaultValue: true)
  bool corePending;
  @HiveField(27, defaultValue: false)
  bool imagePending;
  @HiveField(28)
  String? imageId;
  @HiveField(29)
  String? farmerName;
  @HiveField(30, defaultValue: false)
  bool uploadAttempted;

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
    this.clientId,
    this.farmerId,
    this.kebele,
    this.qualityGrade,
    this.description,
    this.imageUrl,
    this.version,
    this.operationId,
    this.syncState,
    this.syncError,
    this.attempts = 0,
    this.nextAttempt,
    this.deleted = false,
    this.corePending = true,
    this.imagePending = false,
    this.imageId,
    this.farmerName,
    this.uploadAttempted = false,
  }) : createdAt = createdAt ?? DateTime.now();

  String get syncLabel => syncState == 'syncing'
      ? 'Syncing'
      : syncState == 'failed'
          ? 'Sync Failed'
          : syncStatus == 'cloud'
              ? 'Synced'
              : 'Pending Sync';

  void queueChange() {
    uploadAttempted = uploadAttempted || (id == null && attempts > 0);
    clientId ??= const Uuid().v4();
    operationId = const Uuid().v4();
    corePending = true;
    syncStatus = 'local';
    syncState = 'pending';
    syncError = null;
    attempts = 0;
    nextAttempt = null;
  }

  factory ListingModel.fromJson(Map<String, dynamic> j) => ListingModel(
        id: j['listing_id'],
        clientId: j['client_id'],
        farmerId: j['farmer_id'],
        farmerName: j['farmer_name'],
        cropType: j['crop_type'],
        variety: j['variety'],
        quantity: double.parse('${j['quantity']}'),
        unit: j['unit'] ?? 'quintal',
        pricePerUnit: double.parse('${j['price_per_unit']}'),
        latitude: (j['lat'] as num?)?.toDouble(),
        longitude: (j['lng'] as num?)?.toDouble(),
        kebele: j['kebele'],
        harvestDate: j['harvest_date']?.toString().split('T').first,
        qualityGrade: j['quality_grade'],
        description: j['description'],
        imageUrl: j['image_url'],
        status: j['status'] ?? 'available',
        version: j['version'],
        createdAt: DateTime.tryParse(j['created_at'] ?? ''),
        syncStatus: 'cloud',
        corePending: false,
      );

  // Convert to JSON for API
  Map<String, dynamic> toJson() => {
        'client_id': clientId,
        'operation_id': operationId,
        if (version != null) 'version': version,
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
        'kebele': kebele,
        'quality_grade': qualityGrade,
        'description': description,
        'image_url': imageUrl,
      };
}
