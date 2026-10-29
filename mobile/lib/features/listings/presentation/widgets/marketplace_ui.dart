import 'package:flutter/material.dart';

const marketGreen = Color(0xFF176B45);
const marketInk = Color(0xFF20352B);
const marketMuted = Color(0xFF738078);
const marketBackground = Color(0xFFF6F8F5);

class MarketplaceTheme extends StatelessWidget {
  const MarketplaceTheme({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Theme(
        data: Theme.of(context).copyWith(
          scaffoldBackgroundColor: marketBackground,
          colorScheme: ColorScheme.fromSeed(seedColor: marketGreen),
          appBarTheme: const AppBarTheme(
            backgroundColor: marketBackground,
            foregroundColor: marketInk,
            elevation: 0,
            scrolledUnderElevation: 0,
            centerTitle: false,
            titleTextStyle: TextStyle(
                color: marketInk, fontSize: 21, fontWeight: FontWeight.w700),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: Colors.white,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 17),
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFDFE6DE))),
            enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFDFE6DE))),
            focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: marketGreen, width: 1.5)),
          ),
          filledButtonTheme: FilledButtonThemeData(
              style: FilledButton.styleFrom(
            backgroundColor: marketGreen,
            foregroundColor: Colors.white,
            minimumSize: const Size(48, 52),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          )),
        ),
        child: child,
      );
}

class MarketIntro extends StatelessWidget {
  const MarketIntro(
      {super.key,
      required this.eyebrow,
      required this.title,
      required this.subtitle});
  final String eyebrow, title, subtitle;
  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(eyebrow.toUpperCase(),
              style: const TextStyle(
                  color: marketGreen,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.8)),
          const SizedBox(height: 8),
          Text(title,
              style: const TextStyle(
                  color: marketInk,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  height: 1.15)),
          const SizedBox(height: 8),
          Text(subtitle,
              style: const TextStyle(
                  color: marketMuted, fontSize: 14, height: 1.5)),
        ],
      );
}

class MarketEmpty extends StatelessWidget {
  const MarketEmpty(
      {super.key,
      required this.icon,
      required this.title,
      required this.message,
      this.action});
  final IconData icon;
  final String title, message;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
              padding: const EdgeInsets.all(22),
              decoration: const BoxDecoration(
                  color: Color(0xFFE7EFE4), shape: BoxShape.circle),
              child: Icon(icon, size: 38, color: marketGreen)),
          const SizedBox(height: 20),
          Text(title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 21, fontWeight: FontWeight.w700, color: marketInk)),
          const SizedBox(height: 8),
          Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: marketMuted, height: 1.6)),
          if (action != null) ...[const SizedBox(height: 20), action!],
        ]),
      );
}

class MarketNotice extends StatelessWidget {
  const MarketNotice({super.key, required this.message, this.warning = false});
  final String message;
  final bool warning;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: warning ? const Color(0xFFFFF3DD) : const Color(0xFFEAF2E6),
            borderRadius: BorderRadius.circular(14)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(warning ? Icons.info_outline_rounded : Icons.cloud_done_outlined,
              size: 20, color: warning ? const Color(0xFF94651D) : marketGreen),
          const SizedBox(width: 10),
          Expanded(
              child: Text(message,
                  style: TextStyle(
                      fontSize: 12,
                      height: 1.5,
                      color: warning ? const Color(0xFF94651D) : marketGreen))),
        ]),
      );
}
