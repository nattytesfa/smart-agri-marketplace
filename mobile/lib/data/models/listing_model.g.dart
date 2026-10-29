// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'listing_model.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class ListingModelAdapter extends TypeAdapter<ListingModel> {
  @override
  final int typeId = 0;

  @override
  ListingModel read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return ListingModel(
      id: fields[0] as String?,
      cropType: fields[1] as String,
      variety: fields[2] as String?,
      quantity: fields[3] as double,
      unit: fields[4] as String,
      pricePerUnit: fields[5] as double,
      latitude: fields[6] as double?,
      longitude: fields[7] as double?,
      harvestDate: fields[8] as String?,
      status: fields[9] as String,
      syncStatus: fields[10] as String,
      imagePath: fields[11] as String?,
      createdAt: fields[12] as DateTime?,
      clientId: fields[13] as String?,
      farmerId: fields[14] as String?,
      kebele: fields[15] as String?,
      qualityGrade: fields[16] as String?,
      description: fields[17] as String?,
      imageUrl: fields[18] as String?,
      version: fields[19] as int?,
      operationId: fields[20] as String?,
      syncState: fields[21] as String?,
      syncError: fields[22] as String?,
      attempts: fields[23] == null ? 0 : fields[23] as int,
      nextAttempt: fields[24] as DateTime?,
      deleted: fields[25] == null ? false : fields[25] as bool,
      corePending: fields[26] == null ? true : fields[26] as bool,
      imagePending: fields[27] == null ? false : fields[27] as bool,
      imageId: fields[28] as String?,
      farmerName: fields[29] as String?,
      uploadAttempted: fields[30] == null ? false : fields[30] as bool,
    );
  }

  @override
  void write(BinaryWriter writer, ListingModel obj) {
    writer
      ..writeByte(31)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.cropType)
      ..writeByte(2)
      ..write(obj.variety)
      ..writeByte(3)
      ..write(obj.quantity)
      ..writeByte(4)
      ..write(obj.unit)
      ..writeByte(5)
      ..write(obj.pricePerUnit)
      ..writeByte(6)
      ..write(obj.latitude)
      ..writeByte(7)
      ..write(obj.longitude)
      ..writeByte(8)
      ..write(obj.harvestDate)
      ..writeByte(9)
      ..write(obj.status)
      ..writeByte(10)
      ..write(obj.syncStatus)
      ..writeByte(11)
      ..write(obj.imagePath)
      ..writeByte(12)
      ..write(obj.createdAt)
      ..writeByte(13)
      ..write(obj.clientId)
      ..writeByte(14)
      ..write(obj.farmerId)
      ..writeByte(15)
      ..write(obj.kebele)
      ..writeByte(16)
      ..write(obj.qualityGrade)
      ..writeByte(17)
      ..write(obj.description)
      ..writeByte(18)
      ..write(obj.imageUrl)
      ..writeByte(19)
      ..write(obj.version)
      ..writeByte(20)
      ..write(obj.operationId)
      ..writeByte(21)
      ..write(obj.syncState)
      ..writeByte(22)
      ..write(obj.syncError)
      ..writeByte(23)
      ..write(obj.attempts)
      ..writeByte(24)
      ..write(obj.nextAttempt)
      ..writeByte(25)
      ..write(obj.deleted)
      ..writeByte(26)
      ..write(obj.corePending)
      ..writeByte(27)
      ..write(obj.imagePending)
      ..writeByte(28)
      ..write(obj.imageId)
      ..writeByte(29)
      ..write(obj.farmerName)
      ..writeByte(30)
      ..write(obj.uploadAttempted);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ListingModelAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
