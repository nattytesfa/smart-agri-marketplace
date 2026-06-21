import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:smart_agri_marketplace/screens/my_listings_screen.dart';
import 'package:smart_agri_marketplace/screens/profile_screen.dart';
import '../features/listings/presentation/screens/listing_list_screen.dart';
import '../features/listings/presentation/screens/listing_create_screen.dart';
import '../features/digital_debo/presentation/screens/debo_batch_list_screen.dart';

class RoleBasedHomeScreen extends StatefulWidget {
  const RoleBasedHomeScreen({super.key});

  @override
  State<RoleBasedHomeScreen> createState() => _RoleBasedHomeScreenState();
}

class _RoleBasedHomeScreenState extends State<RoleBasedHomeScreen> {
  final _storage = const FlutterSecureStorage();
  int _currentIndex = 0;
  String _userRole = 'farmer'; // Default

  // Farmer screens
  final List<Widget> _farmerScreens = const [
    ListingListScreen(), // Browse
    MyListingsScreen(), // My Listings (we'll create this)
    ListingCreateScreen(), // Sell
    ProfileScreen(), // Profile
  ];

  // Buyer screens
  final List<Widget> _buyerScreens = const [
    ListingListScreen(), // Browse
    DeboBatchListScreen(), // Debo (bulk buy)
    Placeholder(), // Transactions
    ProfileScreen(), // Profile
  ];

  @override
  void initState() {
    super.initState();
    _loadUserRole();
  }

  Future<void> _loadUserRole() async {
    final role = await _storage.read(key: 'user_role') ?? 'farmer';
    setState(() => _userRole = role);
  }

  @override
  Widget build(BuildContext context) {
    final isFarmer = _userRole == 'farmer';
    final screens = isFarmer ? _farmerScreens : _buyerScreens;
    final tabs = isFarmer
        ? const [
            BottomNavigationBarItem(icon: Icon(Icons.search), label: 'Browse'),
            BottomNavigationBarItem(
                icon: Icon(Icons.list), label: 'My Listings'),
            BottomNavigationBarItem(
                icon: Icon(Icons.add_circle), label: 'Sell'),
            BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
          ]
        : const [
            BottomNavigationBarItem(icon: Icon(Icons.search), label: 'Browse'),
            BottomNavigationBarItem(icon: Icon(Icons.group), label: 'Debo'),
            BottomNavigationBarItem(icon: Icon(Icons.receipt), label: 'Orders'),
            BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
          ];

    return Scaffold(
      body: screens[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        type: BottomNavigationBarType.fixed,
        selectedItemColor: Colors.green,
        unselectedItemColor: Colors.grey,
        items: tabs,
      ),
    );
  }
}
