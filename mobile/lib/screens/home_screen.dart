import 'package:flutter/material.dart';
import 'role_based_home_screen.dart';

// Compatibility entry point; never expose a second, unguarded home navigation.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const RoleBasedHomeScreen();
  }
}
