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
    );
  }

  @override
  void write(BinaryWriter writer, ListingModel obj) {
    writer
      ..writeByte(13)
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
      ..write(obj.createdAt);
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
