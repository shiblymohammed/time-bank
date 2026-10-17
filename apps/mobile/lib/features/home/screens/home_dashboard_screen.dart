import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/brand/brand_provider.dart';
import '../../auth/screens/otp_login_screen.dart';

class HomeDashboardScreen extends ConsumerStatefulWidget {
  final String userPhone;

  const HomeDashboardScreen({
    super.key,
    required this.userPhone,
  });

  @override
  ConsumerState<HomeDashboardScreen> createState() => _HomeDashboardScreenState();
}

class _HomeDashboardScreenState extends ConsumerState<HomeDashboardScreen> {
  // Mock member state demonstrating multi-organization memberships
  final List<Map<String, dynamic>> _memberships = [
    {
      'code': 'KOTTAKKAL',
      'name': 'Kottakkal Time Bank',
      'status': 'APPROVED',
      'number': 'KOTTAKKAL-2026-0042',
      'roles': ['VOLUNTEER'],
    },
    {
      'code': 'KOZHIKODE',
      'name': 'Kozhikode Municipal Time Bank',
      'status': 'APPLIED',
      'number': null,
      'roles': [],
    },
  ];

  void _applyToOrg(String code, String name) {
    setState(() {
      _memberships.add({
        'code': code,
        'name': name,
        'status': 'APPLIED',
        'number': null,
        'roles': [],
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final brand = ref.watch(brandProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(brand.appDisplayName),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            tooltip: 'Sign Out',
            onPressed: () {
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (_) => const OtpLoginScreen()),
              );
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // User header
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: brand.primaryColor.withOpacity(0.15),
                  foregroundColor: brand.primaryColor,
                  child: const Icon(Icons.person),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Verified Citizen',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                    Text(
                      widget.userPhone,
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                    ),
                  ],
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.green.shade300),
                  ),
                  child: Text(
                    'BASIC KYC',
                    style: TextStyle(
                      color: Colors.green.shade800,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // ─── UNIVERSAL TIME WALLET CARD (D#17, ITB-008) ───
            Container(
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [brand.primaryColor, brand.primaryColor.withOpacity(0.85)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: brand.primaryColor.withOpacity(0.3),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'UNIVERSAL TIME WALLET',
                        style: TextStyle(
                          color: Colors.white70,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.2,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Text(
                          'GLOBAL D#17',
                          style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      const Text(
                        '12.50',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 36,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'HOURS (CREDITS)',
                        style: TextStyle(
                          color: brand.secondaryColor,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Follows your universal identity across all municipalities and corporations.',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),

            // ─── MULTI-TENANT MEMBERSHIPS SECTION (ITB-005) ───
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Civic Memberships',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                TextButton.icon(
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Apply to Other'),
                  onPressed: () {
                    showModalBottomSheet(
                      context: context,
                      shape: const RoundedRectangleBorder(
                        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                      ),
                      builder: (ctx) => Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              'Join Another Municipality',
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Your universal wallet will carry over immediately. Approval is managed locally.',
                              style: TextStyle(color: Colors.black54, fontSize: 13),
                            ),
                            const SizedBox(height: 16),
                            ListTile(
                              leading: const Icon(Icons.location_city),
                              title: const Text('Malappuram Civic Time Bank'),
                              subtitle: const Text('Malappuram District'),
                              trailing: ElevatedButton(
                                onPressed: () {
                                  _applyToOrg('MALAPPURAM', 'Malappuram Civic Time Bank');
                                  Navigator.pop(ctx);
                                },
                                child: const Text('Apply'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
            const SizedBox(height: 8),

            // List of memberships
            ..._memberships.map((m) {
              final isApproved = m['status'] == 'APPROVED';
              return Card(
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide(color: Colors.grey.shade200),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              m['name'],
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: isApproved ? Colors.green.shade50 : Colors.amber.shade50,
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: isApproved ? Colors.green.shade200 : Colors.amber.shade200,
                              ),
                            ),
                            child: Text(
                              m['status'],
                              style: TextStyle(
                                color: isApproved ? Colors.green.shade800 : Colors.amber.shade800,
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (m['number'] != null) ...[
                        Row(
                          children: [
                            const Text(
                              'ID Number: ',
                              style: TextStyle(fontSize: 12, color: Colors.black54),
                            ),
                            Text(
                              m['number'],
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                fontFamily: 'monospace',
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                      ],
                      if (m['roles'] != null && (m['roles'] as List).isNotEmpty) ...[
                        Wrap(
                          spacing: 6,
                          children: (m['roles'] as List)
                              .map(
                                (r) => Chip(
                                  label: Text(
                                    r.toString(),
                                    style: const TextStyle(fontSize: 11, color: Colors.white),
                                  ),
                                  backgroundColor: brand.primaryColor,
                                  visualDensity: VisualDensity.compact,
                                  padding: EdgeInsets.zero,
                                ),
                              )
                              .toList(),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
