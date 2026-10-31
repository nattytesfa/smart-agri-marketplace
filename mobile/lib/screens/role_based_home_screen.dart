import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:smart_agri_marketplace/screens/my_listings_screen.dart';
import 'package:smart_agri_marketplace/screens/profile_screen.dart';
import '../features/listings/presentation/screens/listing_list_screen.dart';
import '../features/listings/presentation/screens/listing_create_screen.dart';
import '../features/digital_debo/presentation/screens/debo_batch_list_screen.dart';
import 'advisory_screen.dart';
import '../features/listings/presentation/widgets/marketplace_ui.dart';
import '../features/transactions_escrow/presentation/screens/wallet_screen.dart';
import '../data/remote/transactions_api.dart';
import '../services/auth_service.dart';

class RoleBasedHomeScreen extends StatefulWidget {
  const RoleBasedHomeScreen({super.key});

  @override
  State<RoleBasedHomeScreen> createState() => _RoleBasedHomeScreenState();
}

class _RoleBasedHomeScreenState extends State<RoleBasedHomeScreen> {
  final _storage = const FlutterSecureStorage();
  int _currentIndex = 0;
  String? _userRole;
  String? _accountError;

  // Farmer screens
  final List<Widget> _farmerScreens = const [
    ListingListScreen(), // Browse
    MyListingsScreen(), // My Listings
    ListingCreateScreen(), // Sell
    DeboBatchListScreen(isFarmer: true),
    ProfileScreen(), // Profile
    AdvisoryScreen(), // Advisory
    WalletScreen(),
  ];

  // Buyer screens
  final List<Widget> _buyerScreens = const [
    ListingListScreen(), // Browse
    DeboBatchListScreen(), // Debo (bulk buy)
    WalletScreen(),
    ProfileScreen(), // Profile
  ];

  @override
  void initState() {
    super.initState();
    _loadUserRole();
  }

  Future<void> _loadUserRole() async {
    try {
      final account = await TransactionsApi().account();
      final role = account['role'] as String;
      await _storage.write(key: 'user_id', value: account['user_id']);
      await _storage.write(key: 'user_role', value: role);
      if (mounted) {
        setState(() {
          _userRole = role;
          _accountError = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _accountError = TransactionsApi.error(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_userRole == null) {
      return Scaffold(
          body: Center(
              child: _accountError == null
                  ? const CircularProgressIndicator()
                  : Column(mainAxisSize: MainAxisSize.min, children: [
                      Text(_accountError!),
                      TextButton(
                          onPressed: _loadUserRole,
                          child: const Text('Retry account verification')),
                      TextButton(
                          onPressed: () async {
                            await AuthService().discardSession();
                            if (context.mounted) {
                              Navigator.pushNamedAndRemoveUntil(
                                  context, '/login', (_) => false);
                            }
                          },
                          child: const Text('Sign in / register')),
                    ])));
    }
    final isFarmer = _userRole == 'farmer';
    final screens = isFarmer ? _farmerScreens : _buyerScreens;
    final tabs = isFarmer
        ? const [
            BottomNavigationBarItem(icon: Icon(Icons.search), label: 'Browse'),
            BottomNavigationBarItem(
                icon: Icon(Icons.inventory_2_outlined), label: 'My Listings'),
            BottomNavigationBarItem(
                icon: Icon(Icons.add_circle_outline_rounded), label: 'Sell'),
            BottomNavigationBarItem(icon: Icon(Icons.group), label: 'Debo'),
            BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
            BottomNavigationBarItem(
                icon: Icon(Icons.light_mode), label: 'Advice'),
            BottomNavigationBarItem(
                icon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
          ]
        : const [
            BottomNavigationBarItem(icon: Icon(Icons.search), label: 'Browse'),
            BottomNavigationBarItem(icon: Icon(Icons.group), label: 'Debo'),
            BottomNavigationBarItem(
                icon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
            BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
          ];

    return Scaffold(
      body: screens[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        elevation: 12,
        selectedItemColor: marketGreen,
        unselectedItemColor: marketMuted,
        selectedFontSize: 11,
        unselectedFontSize: 11,
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.w700),
        items: tabs,
      ),
    );
  }
}
