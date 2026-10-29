import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../../../data/models/listing_model.dart';
import '../../../../data/models/listing_validation.dart';
import '../../../../data/remote/listings_api.dart';
import '../widgets/listing_card.dart';
import '../widgets/marketplace_ui.dart';
import 'listing_detail_screen.dart';

class ListingListScreen extends StatefulWidget {
  const ListingListScreen({super.key});
  @override
  State<ListingListScreen> createState() => _ListingListScreenState();
}

class _ListingListScreenState extends State<ListingListScreen> {
  final _search = TextEditingController(),
      _min = TextEditingController(),
      _max = TextEditingController(),
      _location = TextEditingController(),
      _radius = TextEditingController(),
      _from = TextEditingController(),
      _to = TextEditingController();
  String? _crop, _grade, _unit;
  String _sort = 'newest', _status = 'available';
  double? _lat, _lng;
  List<ListingModel> _listings = [];
  bool _loading = false, _more = true;
  String? _error;
  @override
  void initState() {
    super.initState();
    _fetch();
  }

  @override
  void dispose() {
    for (final c in [_search, _min, _max, _location, _radius, _from, _to]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _fetch({bool more = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if ((_radius.text.isNotEmpty || _sort == 'distance') && _lat == null) {
        throw Exception('Capture your GPS location to use distance filters.');
      }
      for (final value in [_min.text, _max.text, _radius.text]) {
        if (value.isNotEmpty &&
            (double.tryParse(value) == null ||
                !double.parse(value).isFinite ||
                double.parse(value) < 0)) {
          throw Exception(
              'Price and radius must be valid nonnegative numbers.');
        }
      }
      final response = await listingApi().get('/listings', queryParameters: {
        if (_search.text.trim().isNotEmpty) 'search': _search.text.trim(),
        if (_crop != null) 'crop_type': _crop,
        if (_grade != null) 'quality_grade': _grade,
        if (_unit != null) 'unit': _unit,
        if (_min.text.isNotEmpty) 'min_price': _min.text,
        if (_max.text.isNotEmpty) 'max_price': _max.text,
        if (_location.text.trim().isNotEmpty) 'location': _location.text.trim(),
        if (_from.text.isNotEmpty) 'harvest_from': _from.text,
        if (_to.text.isNotEmpty) 'harvest_to': _to.text,
        if (_radius.text.isNotEmpty)
          'radius': double.parse(_radius.text) * 1000,
        if (_lat != null) 'lat': _lat,
        if (_lng != null) 'lng': _lng,
        'sort': _sort,
        'status': _status,
        'limit': 20,
        'offset': more ? _listings.length : 0,
      });
      final rows = (response.data as List)
          .map((j) => ListingModel.fromJson(Map<String, dynamic>.from(j)))
          .toList();
      if (mounted) {
        setState(() {
          _listings = more ? [..._listings, ...rows] : rows;
          _more = rows.length == 20;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not load listings. $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _gps() async {
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      final p = await Geolocator.getCurrentPosition(
          locationSettings:
              const LocationSettings(timeLimit: Duration(seconds: 15)));
      _lat = p.latitude;
      _lng = p.longitude;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('GPS captured. Apply filters to search.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('GPS unavailable. Use Kebele search without radius.')));
      }
    }
  }

  Future<void> _filters() async {
    await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        constraints: const BoxConstraints(maxWidth: 640),
        builder: (c) => StatefulBuilder(
            builder: (c, update) => MarketplaceTheme(
                    child: Padding(
                  padding: EdgeInsets.only(
                      bottom: MediaQuery.viewInsetsOf(c).bottom),
                  child: Container(
                    constraints: BoxConstraints(
                        maxHeight: MediaQuery.sizeOf(c).height * .9 -
                            MediaQuery.viewInsetsOf(c).bottom),
                    clipBehavior: Clip.antiAlias,
                    decoration: const BoxDecoration(
                        color: marketBackground,
                        borderRadius:
                            BorderRadius.vertical(top: Radius.circular(28))),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const SizedBox(height: 10),
                      Container(
                          width: 36,
                          height: 4,
                          decoration: BoxDecoration(
                              color: const Color(0xFFD4DED3),
                              borderRadius: BorderRadius.circular(4))),
                      Padding(
                          padding: const EdgeInsets.fromLTRB(24, 20, 16, 18),
                          child: Row(children: [
                            Container(
                                padding: const EdgeInsets.all(11),
                                decoration: BoxDecoration(
                                    color: const Color(0xFFE3EDDF),
                                    borderRadius: BorderRadius.circular(14)),
                                child: const Icon(Icons.tune_rounded,
                                    color: marketGreen, size: 22)),
                            const SizedBox(width: 12),
                            const Expanded(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                  Text('Filter produce',
                                      style: TextStyle(
                                          color: marketInk,
                                          fontSize: 22,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: -.5)),
                                  SizedBox(height: 3),
                                  Text('Find the right harvest for you.',
                                      style: TextStyle(
                                          color: marketMuted, fontSize: 12)),
                                ])),
                            IconButton(
                                tooltip: 'Close filters',
                                onPressed: () => Navigator.pop(c),
                                icon:
                                    const Icon(Icons.close_rounded, size: 21)),
                          ])),
                      const Divider(height: 1, color: Color(0xFFE2E8DF)),
                      Flexible(
                          child: SingleChildScrollView(
                              padding: const EdgeInsets.fromLTRB(24, 20, 24, 8),
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    _filterSection(
                                        Icons.eco_outlined,
                                        'Produce',
                                        'Choose a crop and its availability.'),
                                    DropdownButtonFormField<String>(
                                        isExpanded: true,
                                        initialValue: _crop,
                                        decoration: const InputDecoration(
                                            labelText: 'Crop'),
                                        items: [
                                          const DropdownMenuItem<String>(
                                              value: null,
                                              child: Text('All crops')),
                                          ...cropTypes
                                              .where((v) => v != 'Other')
                                              .map((v) => DropdownMenuItem(
                                                  value: v, child: Text(v)))
                                        ],
                                        onChanged: (v) =>
                                            update(() => _crop = v)),
                                    _filterSection(
                                        Icons.payments_outlined,
                                        'Price & unit',
                                        'Compare prices using the same unit.'),
                                    TextField(
                                        controller: _min,
                                        keyboardType: const TextInputType
                                            .numberWithOptions(decimal: true),
                                        decoration: const InputDecoration(
                                            labelText: 'Minimum price',
                                            suffixText: 'ETB')),
                                    TextField(
                                        controller: _max,
                                        keyboardType: const TextInputType
                                            .numberWithOptions(decimal: true),
                                        decoration: const InputDecoration(
                                            labelText: 'Maximum price',
                                            suffixText: 'ETB')),
                                    DropdownButtonFormField<String>(
                                        isExpanded: true,
                                        initialValue: _unit,
                                        decoration: const InputDecoration(
                                            labelText: 'Price per unit'),
                                        items: [
                                          const DropdownMenuItem<String>(
                                              value: null,
                                              child: Text('All units')),
                                          ...listingUnits.map((v) =>
                                              DropdownMenuItem(
                                                  value: v, child: Text(v)))
                                        ],
                                        onChanged: (v) =>
                                            update(() => _unit = v)),
                                    _filterSection(
                                        Icons.location_on_outlined,
                                        'Location',
                                        'Search by Kebele, or use GPS for nearby produce.'),
                                    TextField(
                                        controller: _location,
                                        decoration: const InputDecoration(
                                            labelText: 'Kebele')),
                                    TextButton.icon(
                                        onPressed: _gps,
                                        icon: const Icon(Icons.gps_fixed),
                                        label: const Text(
                                            'Use my current location')),
                                    TextField(
                                        controller: _radius,
                                        keyboardType: const TextInputType
                                            .numberWithOptions(decimal: true),
                                        decoration: const InputDecoration(
                                            labelText: 'Search radius',
                                            suffixText: 'km',
                                            helperText:
                                                'Requires your GPS location. Optional.')),
                                    _filterSection(
                                        Icons.verified_outlined,
                                        'Availability & quality',
                                        'Refine by listing status and farmer-reported grade.'),
                                    DropdownButtonFormField<String>(
                                        isExpanded: true,
                                        initialValue: _status,
                                        decoration: const InputDecoration(
                                            labelText: 'Availability'),
                                        items: ['available', 'reserved', 'sold']
                                            .map((v) => DropdownMenuItem(
                                                value: v, child: Text(v)))
                                            .toList(),
                                        onChanged: (v) =>
                                            update(() => _status = v!)),
                                    DropdownButtonFormField<String>(
                                        isExpanded: true,
                                        initialValue: _grade,
                                        decoration: const InputDecoration(
                                            labelText: 'Farmer-reported grade'),
                                        items: [
                                          const DropdownMenuItem<String>(
                                              value: null,
                                              child: Text('All grades')),
                                          ...qualityGrades.entries.map((e) =>
                                              DropdownMenuItem(
                                                  value: e.key,
                                                  child: Text(e.value)))
                                        ],
                                        onChanged: (v) =>
                                            update(() => _grade = v)),
                                    _filterSection(
                                        Icons.calendar_month_outlined,
                                        'Harvest dates',
                                        'Choose a harvest window. Both dates are optional.'),
                                    TextField(
                                        controller: _from,
                                        readOnly: true,
                                        decoration: InputDecoration(
                                            labelText: 'Harvested from',
                                            suffixIcon: IconButton(
                                                icon: const Icon(Icons.clear),
                                                onPressed: () =>
                                                    update(_from.clear))),
                                        onTap: () async {
                                          final d = await showDatePicker(
                                              context: c,
                                              firstDate: DateTime(1900),
                                              lastDate: DateTime.now(),
                                              initialDate: DateTime.now());
                                          if (d != null && c.mounted) {
                                            update(() => _from.text = d
                                                .toIso8601String()
                                                .split('T')
                                                .first);
                                          }
                                        }),
                                    TextField(
                                        controller: _to,
                                        readOnly: true,
                                        decoration: InputDecoration(
                                            labelText: 'Harvested through',
                                            suffixIcon: IconButton(
                                                icon: const Icon(Icons.clear),
                                                onPressed: () =>
                                                    update(_to.clear))),
                                        onTap: () async {
                                          final d = await showDatePicker(
                                              context: c,
                                              firstDate: DateTime(1900),
                                              lastDate: DateTime.now(),
                                              initialDate: DateTime.now());
                                          if (d != null && c.mounted) {
                                            update(() => _to.text = d
                                                .toIso8601String()
                                                .split('T')
                                                .first);
                                          }
                                        }),
                                    _filterSection(
                                        Icons.sort_rounded,
                                        'Sort results',
                                        'Put the most relevant produce first.'),
                                    DropdownButtonFormField<String>(
                                        isExpanded: true,
                                        initialValue: _sort,
                                        decoration: const InputDecoration(
                                            labelText: 'Sort'),
                                        items: const [
                                          DropdownMenuItem(
                                              value: 'newest',
                                              child: Text('Newest')),
                                          DropdownMenuItem(
                                              value: 'price_asc',
                                              child:
                                                  Text('Price: low to high')),
                                          DropdownMenuItem(
                                              value: 'price_desc',
                                              child:
                                                  Text('Price: high to low')),
                                          DropdownMenuItem(
                                              value: 'distance',
                                              child:
                                                  Text('Distance (GPS only)'))
                                        ],
                                        onChanged: (v) =>
                                            update(() => _sort = v!)),
                                  ]
                                      .expand((child) =>
                                          [child, const SizedBox(height: 16)])
                                      .toList()))),
                      Container(
                          padding: const EdgeInsets.fromLTRB(24, 16, 24, 16),
                          decoration: const BoxDecoration(
                              color: Colors.white,
                              border: Border(
                                  top: BorderSide(color: Color(0xFFE2E8DF)))),
                          child: SafeArea(
                              top: false,
                              child: Row(children: [
                                TextButton(
                                    onPressed: () => Navigator.pop(c),
                                    child: const Text('Close')),
                                const SizedBox(width: 16),
                                Expanded(
                                    child: FilledButton.icon(
                                        onPressed: () {
                                          Navigator.pop(c);
                                          _fetch();
                                        },
                                        icon: const Icon(Icons.check_rounded,
                                            size: 19),
                                        label: const Text('Apply filters'))),
                              ]))),
                    ]),
                  ),
                ))));
  }

  Widget _filterSection(IconData icon, String title, String subtitle) =>
      Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 2),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: marketGreen, size: 20),
          const SizedBox(width: 10),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(title,
                    style: const TextStyle(
                        color: marketInk,
                        fontSize: 15,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(subtitle,
                    style: const TextStyle(
                        color: marketMuted, fontSize: 12, height: 1.4)),
              ])),
        ]),
      );

  @override
  Widget build(BuildContext context) => MarketplaceTheme(
      child: Scaffold(
          appBar: AppBar(
              titleSpacing: 20,
              title: Row(children: [
                Container(
                  padding: const EdgeInsets.all(9),
                  decoration: BoxDecoration(
                      color: marketGreen,
                      borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.spa_outlined,
                      color: Colors.white, size: 22),
                ),
                const SizedBox(width: 10),
                const Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text('Marketplace',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -.5)),
                      Text('GROWN LOCAL. CONNECTED DIRECT.',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: marketMuted,
                              fontSize: 8,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1)),
                    ])),
              ]),
              actions: [
                IconButton(
                    tooltip: 'Refresh',
                    onPressed: _loading ? null : () => _fetch(),
                    style: IconButton.styleFrom(
                        backgroundColor: Colors.white,
                        side: const BorderSide(color: Color(0xFFE2E8DF))),
                    icon: const Icon(Icons.refresh_rounded, size: 20)),
                const SizedBox(width: 12),
              ]),
          body: Center(
              child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 960),
                  child: RefreshIndicator(
                      onRefresh: () => _fetch(),
                      child: CustomScrollView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          slivers: [
                            SliverToBoxAdapter(
                                child: Column(children: [
                              const Padding(
                                padding: EdgeInsets.fromLTRB(20, 18, 20, 22),
                                child: _HarvestBanner(),
                              ),
                              Padding(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 20),
                                  child: Row(children: [
                                    Expanded(
                                        child: TextField(
                                            controller: _search,
                                            textInputAction:
                                                TextInputAction.search,
                                            decoration: InputDecoration(
                                                hintText:
                                                    'Search crop or variety',
                                                prefixIcon: const Icon(
                                                    Icons.search_rounded,
                                                    color: marketMuted),
                                                suffixIcon: IconButton(
                                                    onPressed: () => _fetch(),
                                                    icon: const Icon(Icons
                                                        .arrow_forward_rounded))),
                                            onSubmitted: (_) => _fetch())),
                                    const SizedBox(width: 10),
                                    IconButton.filledTonal(
                                        onPressed: _filters,
                                        tooltip: 'Filter produce',
                                        icon: const Icon(Icons.tune_rounded),
                                        style: IconButton.styleFrom(
                                            minimumSize: const Size(54, 54),
                                            shape: RoundedRectangleBorder(
                                                borderRadius:
                                                    BorderRadius.circular(
                                                        14)))),
                                  ])),
                              SizedBox(
                                  height: 68,
                                  child: ListView(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 20, vertical: 12),
                                    scrollDirection: Axis.horizontal,
                                    children: [
                                      null,
                                      ...cropTypes.where((v) => v != 'Other')
                                    ]
                                        .map((crop) => Padding(
                                              padding: const EdgeInsets.only(
                                                  right: 8),
                                              child: ChoiceChip(
                                                  label:
                                                      Text(crop ?? 'All crops'),
                                                  selected: _crop == crop,
                                                  onSelected: _loading
                                                      ? null
                                                      : (_) {
                                                          setState(() =>
                                                              _crop = crop);
                                                          _fetch();
                                                        },
                                                  showCheckmark: false,
                                                  selectedColor: marketGreen,
                                                  backgroundColor: Colors.white,
                                                  labelStyle: TextStyle(
                                                      color: _crop == crop
                                                          ? Colors.white
                                                          : marketMuted,
                                                      fontWeight:
                                                          FontWeight.w600),
                                                  side: const BorderSide(
                                                      color: Color(0xFFE1E7DE)),
                                                  shape: RoundedRectangleBorder(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              22))),
                                            ))
                                        .toList(),
                                  )),
                              Padding(
                                  padding:
                                      const EdgeInsets.fromLTRB(20, 0, 20, 12),
                                  child: Row(children: [
                                    const Expanded(
                                        child: Text('Explore produce',
                                            style: TextStyle(
                                                fontSize: 18,
                                                fontWeight: FontWeight.w700,
                                                color: marketInk))),
                                    PopupMenuButton<String>(
                                      tooltip: 'Sort produce',
                                      initialValue: _sort,
                                      enabled: !_loading,
                                      onSelected: (value) {
                                        setState(() => _sort = value);
                                        _fetch();
                                      },
                                      itemBuilder: (_) => const [
                                        PopupMenuItem(
                                            value: 'newest',
                                            child: Text('Newest first')),
                                        PopupMenuItem(
                                            value: 'price_asc',
                                            child: Text('Price: low to high')),
                                        PopupMenuItem(
                                            value: 'price_desc',
                                            child: Text('Price: high to low')),
                                      ],
                                      child: Padding(
                                          padding: const EdgeInsets.symmetric(
                                              vertical: 10),
                                          child: Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                const Icon(Icons.sort_rounded,
                                                    size: 16,
                                                    color: marketMuted),
                                                const SizedBox(width: 5),
                                                Text(
                                                    _sort == 'newest'
                                                        ? 'Newest'
                                                        : _sort == 'price_asc'
                                                            ? 'Price ↑'
                                                            : _sort ==
                                                                    'price_desc'
                                                                ? 'Price ↓'
                                                                : 'Nearest',
                                                    style: const TextStyle(
                                                        color: marketMuted,
                                                        fontSize: 12,
                                                        fontWeight:
                                                            FontWeight.w600)),
                                                const Icon(
                                                    Icons
                                                        .keyboard_arrow_down_rounded,
                                                    size: 16,
                                                    color: marketMuted),
                                              ])),
                                    ),
                                  ])),
                              if (_loading)
                                const Padding(
                                    padding:
                                        EdgeInsets.symmetric(horizontal: 20),
                                    child:
                                        LinearProgressIndicator(minHeight: 2)),
                              if (_error != null)
                                Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                        20, 12, 20, 12),
                                    child: const MarketNotice(
                                        message:
                                            'Unable to reach the marketplace. Check your connection and try again.',
                                        warning: true)),
                            ])),
                            if (_listings.isEmpty && !_loading)
                              SliverToBoxAdapter(
                                  child: MarketEmpty(
                                icon: _error == null
                                    ? Icons.eco_outlined
                                    : Icons.wifi_off_rounded,
                                title: _error == null
                                    ? 'A fresh start'
                                    : 'Let’s reconnect',
                                message: _error == null
                                    ? 'No produce matches this search. Try another crop or adjust your filters.'
                                    : 'Your next great find is worth the wait. Refresh to try again.',
                                action: OutlinedButton.icon(
                                    onPressed: _error == null
                                        ? _filters
                                        : () => _fetch(),
                                    icon: Icon(_error == null
                                        ? Icons.tune
                                        : Icons.refresh),
                                    label: Text(_error == null
                                        ? 'Adjust filters'
                                        : 'Try again')),
                              ))
                            else
                              SliverPadding(
                                  padding:
                                      const EdgeInsets.fromLTRB(20, 8, 20, 20),
                                  sliver: SliverList(
                                      delegate:
                                          SliverChildBuilderDelegate((_, i) {
                                    if (i == _listings.length) {
                                      return _more
                                          ? TextButton(
                                              onPressed: _loading
                                                  ? null
                                                  : () => _fetch(more: true),
                                              child: const Text('Load more'))
                                          : const SizedBox(height: 20);
                                    }
                                    return ListingCard(
                                        listing: _listings[i],
                                        onTap: () => Navigator.push(
                                            context,
                                            MaterialPageRoute(
                                                builder: (_) =>
                                                    ListingDetailScreen(
                                                        listing:
                                                            _listings[i]))));
                                  }, childCount: _listings.length + 1))),
                          ]))))));
}

class _HarvestBanner extends StatelessWidget {
  const _HarvestBanner();

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF124D36), Color(0xFF23744D)]),
        ),
        child: Stack(children: [
          Positioned(
              right: -30,
              bottom: -45,
              child: ExcludeSemantics(
                  child: Icon(Icons.spa_outlined,
                      size: 200, color: Colors.white.withAlpha(12)))),
          Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                            color: Colors.white.withAlpha(22),
                            borderRadius: BorderRadius.circular(20)),
                        child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.eco_outlined,
                                  size: 13, color: Color(0xFFD5E9AF)),
                              SizedBox(width: 6),
                              Flexible(
                                  child: Text('FRESH FROM THE FARM',
                                      style: TextStyle(
                                          color: Color(0xFFD5E9AF),
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          letterSpacing: 1.2)))
                            ])),
                    const SizedBox(height: 16),
                    const Text('Good produce.\nFair prices.',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 30,
                            height: 1.12,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -.8)),
                    const SizedBox(height: 12),
                    const Text(
                        'Discover the harvest.\nConnect directly with growers.',
                        style: TextStyle(
                            color: Color(0xFFD3E4D9),
                            fontSize: 13,
                            height: 1.5)),
                  ])),
        ]),
      );
}
