import 'dart:io';
import 'package:flutter/material.dart';
import '../../../../data/models/listing_model.dart';
import '../../../../data/models/listing_validation.dart';

class ProduceImage extends StatelessWidget {
  const ProduceImage(
      {super.key,
      required this.cropType,
      this.localPath,
      this.imageUrl,
      this.height = 80});
  final String cropType;
  final String? localPath, imageUrl;
  final double height;
  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
        height: height,
        color: Colors.green.shade50,
        alignment: Alignment.center,
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(
              cropType == 'Beans'
                  ? Icons.grass
                  : cropType == 'Maize'
                      ? Icons.eco
                      : Icons.agriculture,
              color: Colors.green,
              size: height < 100 ? 24 : 48),
          Text(cropType, maxLines: 1)
        ]));
    if (localPath != null && File(localPath!).existsSync()) {
      return Image.file(File(localPath!),
          height: height,
          fit: BoxFit.cover,
          errorBuilder: (_, error, stack) => placeholder);
    }
    if (imageUrl != null) {
      return Image.network(imageUrl!,
          height: height,
          fit: BoxFit.cover,
          errorBuilder: (_, error, stack) => placeholder);
    }
    return placeholder;
  }
}

class ListingCard extends StatelessWidget {
  const ListingCard(
      {super.key,
      required this.listing,
      required this.onTap,
      this.showSync = false});
  final ListingModel listing;
  final VoidCallback onTap;
  final bool showSync;
  @override
  Widget build(BuildContext context) {
    final l = listing;
    return Card(
        child: InkWell(
            onTap: onTap,
            child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ProduceImage(
                          cropType: l.cropType,
                          localPath: l.imagePath,
                          imageUrl: l.imageUrl),
                      Text('${l.cropType} — ${l.variety ?? ''}',
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold)),
                      Text(
                          '${l.quantity} ${l.unit} · ETB ${l.pricePerUnit} per ${l.unit}'),
                      Text(l.kebele ??
                          (l.latitude == null
                              ? 'Location unavailable'
                              : 'GPS: ${l.latitude!.toStringAsFixed(3)}, ${l.longitude!.toStringAsFixed(3)}')),
                      Text(
                          'Availability: ${l.status}${showSync ? ' · ${l.syncLabel}' : ''}'),
                      if (l.deleted)
                        const Text('Removal pending synchronization'),
                      Text(
                          'Created: ${l.createdAt.toLocal().toString().split('.').first}'),
                      if (l.harvestDate != null)
                        Text('Harvest: ${l.harvestDate}'),
                      if (l.qualityGrade != null)
                        Text(
                            'Farmer-reported: ${qualityGrades[l.qualityGrade] ?? l.qualityGrade}'),
                      if (showSync && l.syncError != null)
                        Text(l.syncError!,
                            style: const TextStyle(color: Colors.red)),
                    ]))));
  }
}
