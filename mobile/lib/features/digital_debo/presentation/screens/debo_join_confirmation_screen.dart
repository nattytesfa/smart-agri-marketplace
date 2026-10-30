import 'package:flutter/material.dart';
import '../../../../data/models/listing_validation.dart';
import '../../../../data/remote/debo_api.dart';

class DeboJoinConfirmationScreen extends StatefulWidget {
  final String batchId;
  final Map<String, dynamic> contribution;
  final DeboApi api;
  const DeboJoinConfirmationScreen(
      {super.key,
      required this.batchId,
      required this.contribution,
      required this.api});
  @override
  State<DeboJoinConfirmationScreen> createState() =>
      _DeboJoinConfirmationScreenState();
}

class _DeboJoinConfirmationScreenState
    extends State<DeboJoinConfirmationScreen> {
  final _form = GlobalKey<FormState>();
  late final _quantity = TextEditingController(
      text: '${widget.contribution['proposed_quantity']}');
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _quantity.dispose();
    super.dispose();
  }

  Future<void> _respond(String action) async {
    if (action == 'accepted' && !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.respond(
          widget.batchId,
          widget.contribution['listing_id'],
          action,
          double.tryParse(_quantity.text) ?? 0);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(action == 'accepted'
                ? 'Participation confirmed and quantity reserved by the server.'
                : 'Invitation declined. No produce reserved.')));
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) setState(() => _error = deboError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.contribution;
    return Scaffold(
        appBar: AppBar(title: const Text('Confirm Debo participation')),
        body: Padding(
            padding: const EdgeInsets.all(16),
            child: Form(
                key: _form,
                child: ListView(children: [
                  Text('${l['crop_type']} • ${l['variety']}'),
                  Text(
                      'Requested ${l['proposed_quantity']} ${l['unit']}\nCurrently unreserved: ${l['available_quantity']} ${l['unit']}\nAgreed asking price: ETB ${l['unit_price']} / ${l['unit']}'),
                  const Text(
                      'You may confirm a smaller quantity. Availability and price are checked again before any reservation.'),
                  TextFormField(
                      controller: _quantity,
                      enabled: !_busy,
                      decoration: const InputDecoration(
                          labelText: 'Contribution quantity'),
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      validator: (v) =>
                          positiveNumber(v) ??
                          (double.parse(v!) > deboNumber(l['proposed_quantity'])
                              ? 'Cannot exceed the invitation quantity'
                              : null)),
                  if (_error != null)
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                  if (_busy) const Center(child: CircularProgressIndicator()),
                  FilledButton(
                      onPressed: _busy ? null : () => _respond('accepted'),
                      child: const Text('Accept & reserve')),
                  OutlinedButton(
                      onPressed: _busy ? null : () => _respond('declined'),
                      child: const Text('Decline')),
                ]))));
  }
}
