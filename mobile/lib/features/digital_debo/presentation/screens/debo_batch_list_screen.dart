import 'package:flutter/material.dart';
import '../../../../data/remote/debo_api.dart';
import 'debo_batch_detail_screen.dart';
import 'debo_request_screen.dart';

class DeboBatchListScreen extends StatefulWidget {
  final bool isFarmer;
  final DeboApi? api;
  const DeboBatchListScreen({super.key, this.isFarmer = false, this.api});
  @override
  State<DeboBatchListScreen> createState() => _DeboBatchListScreenState();
}

class _DeboBatchListScreenState extends State<DeboBatchListScreen> {
  late final DeboApi _api = widget.api ?? DeboApi();
  List<Map<String, dynamic>> _batches = [];
  bool _loading = true;
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _api.batches();
      if (mounted) setState(() => _batches = data);
    } catch (e) {
      if (mounted) setState(() => _error = deboError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
            title: Text(widget.isFarmer
                ? 'Debo invitations & history'
                : 'Digital Debo batches'),
            actions: [
              IconButton(
                  onPressed: _loading ? null : _load,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh')
            ]),
        floatingActionButton: widget.isFarmer
            ? null
            : FloatingActionButton.extended(
                onPressed: () async {
                  await Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => DeboRequestScreen(api: _api)));
                  if (mounted) _load();
                },
                icon: const Icon(Icons.add),
                label: const Text('Request produce')),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(_error!),
                    TextButton(onPressed: _load, child: const Text('Retry'))
                  ]))
                : _batches.isEmpty
                    ? Center(
                        child: Text(widget.isFarmer
                            ? 'No participation invitations yet.'
                            : 'No aggregation requests yet.'))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                            padding: const EdgeInsets.only(bottom: 100),
                            itemCount: _batches.length,
                            itemBuilder: (context, i) {
                              final b = _batches[i];
                              return Card(
                                  child: ListTile(
                                title:
                                    Text('${b['crop_type']} • ${b['status']}'),
                                subtitle: Text(
                                    '${deboQuantity(b['reserved_quantity'])} / ${deboQuantity(b['target_quantity'])} ${b['unit']} reserved\n${b['created_at']}'),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () async {
                                  await Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                          builder: (_) => DeboBatchDetailScreen(
                                              batchId: b['batch_id'],
                                              api: _api)));
                                  if (mounted) _load();
                                },
                              ));
                            })),
      );
}
