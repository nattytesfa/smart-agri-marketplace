import 'package:flutter/material.dart';
import '../../../listings/presentation/widgets/marketplace_ui.dart';

// Display formatting only: preserve the server's exact decimal string.
String walletMoney(Object? value) {
  final parts = (value ?? '0.00').toString().split('.');
  final whole = parts.first
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
  return '$whole.${parts.length > 1 ? parts[1] : '00'}';
}

String financeLabel(Object? value) {
  final text = (value ?? 'Pending').toString().replaceAll('_', ' ');
  return text.isEmpty
      ? 'Pending'
      : '${text[0].toUpperCase()}${text.substring(1)}';
}

String financeDate(BuildContext context, Object? value) {
  final date = DateTime.tryParse(value.toString())?.toLocal();
  if (date == null) return 'Not provided';
  return '${MaterialLocalizations.of(context).formatMediumDate(date)} · ${TimeOfDay.fromDateTime(date).format(context)}';
}

class FinancePanel extends StatelessWidget {
  // Use a Material surface so interactive rows retain visible ink feedback.
  const FinancePanel({super.key, required this.child, this.padding = 20});
  final Widget child;
  final double padding;
  @override
  Widget build(BuildContext context) => Material(
      color: Colors.white,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: Color(0xFFE3E9E2))),
      child: Padding(padding: EdgeInsets.all(padding), child: child));
}

class DemoFundsNotice extends StatelessWidget {
  const DemoFundsNotice({super.key});
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: const Color(0xFFEEF3EB),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFDAE5D7))),
      child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.verified_user_outlined, color: marketGreen, size: 20),
        SizedBox(width: 10),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Demo Wallet — Virtual ETB, No Real Money',
              style: TextStyle(
                  color: marketInk, fontSize: 12, fontWeight: FontWeight.w700)),
          SizedBox(height: 4),
          Text(
              'No real deposits, withdrawals or payouts. Pending escrow is not available money.',
              style: TextStyle(color: marketMuted, fontSize: 12, height: 1.5)),
        ])),
      ]));
}

class FinanceMetric extends StatelessWidget {
  const FinanceMetric(
      {super.key,
      required this.label,
      required this.amount,
      required this.icon,
      this.color = marketGreen,
      this.caption});
  final String label;
  final Object? amount;
  final IconData icon;
  final Color color;
  final String? caption;
  @override
  Widget build(BuildContext context) => FinancePanel(
      padding: 16,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
                color: color.withValues(alpha: .08),
                borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: color, size: 21)),
        const SizedBox(height: 14),
        Text(label,
            style: const TextStyle(
                color: marketMuted, fontSize: 12, fontWeight: FontWeight.w500)),
        const SizedBox(height: 7),
        FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text('ETB ${walletMoney(amount)}',
                style: const TextStyle(
                    color: marketInk,
                    fontSize: 21,
                    fontWeight: FontWeight.w800))),
        if (caption != null) ...[
          const SizedBox(height: 7),
          Text(caption!,
              style: const TextStyle(
                  fontSize: 11, height: 1.4, color: marketMuted))
        ],
      ]));
}

class FinanceStatus extends StatelessWidget {
  const FinanceStatus(this.label, {super.key, this.warning = false});
  final String label;
  final bool warning;
  @override
  Widget build(BuildContext context) {
    final status = label.toLowerCase().replaceAll(' ', '_');
    final failed = ['failed', 'expired', 'rejected'].contains(status);
    final caution = warning ||
        [
          'pending',
          'held',
          'unfunded',
          'open',
          'under_review',
          'disputed',
          'reconciliation_required'
        ].contains(status);
    final complete = [
      'completed',
      'settled',
      'delivered',
      'ready',
      'fulfilled',
      'confirmed',
      'released',
      'simulated_paid'
    ].contains(status);
    final color = failed
        ? const Color(0xFFAA3E3E)
        : caution
            ? const Color(0xFF94651D)
            : complete
                ? marketGreen
                : const Color(0xFF586978);
    final background = failed
        ? const Color(0xFFFCEEEE)
        : caution
            ? const Color(0xFFFFF2DC)
            : complete
                ? const Color(0xFFEBF3ED)
                : const Color(0xFFEEF1F5);
    return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
            color: background, borderRadius: BorderRadius.circular(8)),
        child: Text(financeLabel(label),
            style: TextStyle(
                color: color, fontSize: 11, fontWeight: FontWeight.w600)));
  }
}

class FinanceBadge extends StatelessWidget {
  const FinanceBadge(
      {super.key,
      required this.label,
      this.icon,
      this.color = marketGreen,
      this.background});
  final String label;
  final IconData? icon;
  final Color color;
  final Color? background;
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
          color: background ?? color.withValues(alpha: .09),
          borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4)
        ],
        Text(label,
            style: TextStyle(
                color: color,
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: .4)),
      ]));
}

class FinancePanelHeader extends StatelessWidget {
  const FinancePanelHeader(
      {super.key,
      required this.icon,
      required this.title,
      this.subtitle,
      this.trailing});
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) =>
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: const Color(0xFFEDF3EC),
                borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, size: 20, color: marketGreen)),
        const SizedBox(width: 12),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title,
              style: const TextStyle(
                  color: marketInk, fontSize: 15, fontWeight: FontWeight.w800)),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle!,
                style: const TextStyle(
                    color: marketMuted, fontSize: 12, height: 1.45)),
          ],
        ])),
        if (trailing != null) ...[const SizedBox(width: 10), trailing!],
      ]);
}

class FinanceBalanceTile extends StatelessWidget {
  const FinanceBalanceTile(
      {super.key,
      required this.label,
      required this.amount,
      required this.icon,
      this.caption = 'Demo funds'});
  final String label;
  final Object? amount;
  final IconData icon;
  final String caption;
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
          color: const Color(0xFFF8FAF7),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE6ECE4))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 15, color: marketGreen),
          const SizedBox(width: 7),
          Expanded(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: marketMuted,
                      fontSize: 11,
                      fontWeight: FontWeight.w600)))
        ]),
        const SizedBox(height: 10),
        FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text('ETB ${walletMoney(amount)}',
                style: const TextStyle(
                    color: marketInk,
                    fontSize: 17,
                    fontWeight: FontWeight.w800))),
        const SizedBox(height: 3),
        Text(caption,
            style: const TextStyle(
                color: marketMuted, fontSize: 10, letterSpacing: .2)),
      ]));
}

class FinanceLineRow extends StatelessWidget {
  const FinanceLineRow(
      {super.key,
      required this.label,
      required this.value,
      this.icon,
      this.caption,
      this.valueColor = marketInk,
      this.bold = false});
  final String label;
  final String value;
  final IconData? icon;
  final String? caption;
  final Color valueColor;
  final bool bold;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (icon != null) ...[
          Icon(icon, size: 15, color: marketMuted),
          const SizedBox(width: 8)
        ],
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label,
              style: const TextStyle(
                  color: marketInk, fontSize: 12, fontWeight: FontWeight.w600)),
          if (caption != null)
            Text(caption!,
                style: const TextStyle(color: marketMuted, fontSize: 10.5)),
        ])),
        const SizedBox(width: 12),
        Text(value,
            style: TextStyle(
                color: valueColor,
                fontSize: 12.5,
                fontWeight: bold ? FontWeight.w800 : FontWeight.w700)),
      ]));
}

class FinanceInfoTile extends StatelessWidget {
  const FinanceInfoTile(
      {super.key, required this.label, required this.value, this.icon});
  final String label;
  final String value;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      decoration: BoxDecoration(
          color: const Color(0xFFF8FAF7),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE6ECE4))),
      child: Row(children: [
        if (icon != null) ...[
          Icon(icon, size: 15, color: marketGreen),
          const SizedBox(width: 8)
        ],
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label,
              style: const TextStyle(
                  color: marketMuted,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: .3)),
          const SizedBox(height: 3),
          FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value,
                  style: const TextStyle(
                      color: marketInk,
                      fontSize: 13,
                      fontWeight: FontWeight.w700))),
        ])),
      ]));
}

class FinanceMetaChip extends StatelessWidget {
  const FinanceMetaChip({super.key, required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
          color: const Color(0xFFF3F6F2),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFE6ECE4))),
      child: Text.rich(
          TextSpan(children: [
            TextSpan(
                text: label,
                style: const TextStyle(
                    color: marketMuted,
                    fontSize: 10,
                    fontWeight: FontWeight.w600)),
            TextSpan(
                text: value,
                style: const TextStyle(
                    color: marketInk,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700)),
          ]),
          maxLines: 1,
          overflow: TextOverflow.ellipsis));
}

class FinanceSectionTitle extends StatelessWidget {
  const FinanceSectionTitle(this.title, {super.key, this.subtitle});
  final String title;
  final String? subtitle;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title,
            style: const TextStyle(
                color: marketInk, fontSize: 19, fontWeight: FontWeight.w800)),
        if (subtitle != null) ...[
          const SizedBox(height: 5),
          Text(subtitle!,
              style: const TextStyle(
                  color: marketMuted, fontSize: 12, height: 1.5))
        ],
      ]));
}
