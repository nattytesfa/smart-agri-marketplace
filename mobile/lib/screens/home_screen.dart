import 'package:flutter/material.dart';
import '../features/listings/presentation/screens/listing_list_screen.dart';
import '../features/digital_debo/presentation/screens/debo_batch_list_screen.dart';
import '../features/listings/presentation/screens/listing_create_screen.dart';
import 'profile_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  final List<Widget> _screens = [
    const ListingListScreen(), // Browse
    const DeboBatchListScreen(), // Debo (bulk buy)
    const ListingCreateScreen(), // Sell
    const ProfileScreen(), // Profile
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        type: BottomNavigationBarType.fixed,
        selectedItemColor: Colors.green,
        unselectedItemColor: Colors.grey,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.search), label: 'Browse'),
          BottomNavigationBarItem(icon: Icon(Icons.group), label: 'Debo'),
          BottomNavigationBarItem(icon: Icon(Icons.add_circle), label: 'Sell'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}
