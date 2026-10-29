import 'dart:io';
import 'package:flutter/material.dart';
import '../../../../data/models/listing_model.dart';
import '../../../../data/models/listing_validation.dart';
import 'marketplace_ui.dart';

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
        margin: const EdgeInsets.only(bottom: 14),
        elevation: 0,
        color: Colors.white,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: Color(0xFFE4EAE1))),
        child: InkWell(
            onTap: onTap,
            child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: SizedBox(
                              width: double.infinity,
                              child: ProduceImage(
                                  cropType: l.cropType,
                                  localPath: l.imagePath,
                                  imageUrl: l.imageUrl,
                                  height: 142))),
                      const SizedBox(height: 14),
                      Wrap(spacing: 8, runSpacing: 6, children: [
                        _badge(
                            l.status.toUpperCase(),
                            l.status == 'available'
                                ? marketGreen
                                : marketMuted),
                        if (showSync)
                          _badge(
                              l.syncLabel,
                              l.syncState == 'failed'
                                  ? Colors.orange.shade800
                                  : marketMuted),
                      ]),
                      const SizedBox(height: 10),
                      Text('${l.cropType} — ${l.variety ?? ''}',
                          style: const TextStyle(
                              color: marketInk,
                              fontSize: 20,
                              fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      Text(
                          'ETB ${l.pricePerUnit.toString().replaceFirst(RegExp(r'\.0$'), '')} / ${l.unit}',
                          style: const TextStyle(
                              color: marketGreen,
                              fontSize: 18,
                              fontWeight: FontWeight.w800)),
                      const SizedBox(height: 5),
                      Text('${l.quantity} ${l.unit} available',
                          style: const TextStyle(
                              color: marketMuted, fontSize: 13)),
                      const Divider(height: 24, color: Color(0xFFEEF1EB)),
                      Text(l.kebele ??
                          (l.latitude == null
                              ? 'Location unavailable'
                              : 'GPS: ${l.latitude!.toStringAsFixed(3)}, ${l.longitude!.toStringAsFixed(3)}')),
                      if (l.deleted)
                        const Text('Removal pending synchronization'),
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

  Widget _badge(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
            color: color.withAlpha(18), borderRadius: BorderRadius.circular(7)),
        child: Text(text,
            style: TextStyle(
                color: color,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: .4)),
      );
}
