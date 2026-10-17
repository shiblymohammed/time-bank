/// Multi-tenant membership info model for mobile.
class MemberOrgSummary {
  final String organizationId;
  final String organizationCode;
  final String organizationName;
  final String status;
  final String? membershipNumber;
  final List<String> roles;

  const MemberOrgSummary({
    required this.organizationId,
    required this.organizationCode,
    required this.organizationName,
    required this.status,
    this.membershipNumber,
    required this.roles,
  });

  factory MemberOrgSummary.fromJson(Map<String, dynamic> json) {
    return MemberOrgSummary(
      organizationId: json['organizationId'] as String? ?? '',
      organizationCode: json['organizationCode'] as String? ?? '',
      organizationName: json['organizationName'] as String? ?? '',
      status: json['status'] as String? ?? 'APPLIED',
      membershipNumber: json['membershipNumber'] as String?,
      roles: (json['roles'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
    );
  }
}

/// Mobile authenticated user profile.
class UserProfile {
  final String id;
  final String phoneE164;
  final String status;
  final double walletBalance;
  final List<MemberOrgSummary> memberships;

  const UserProfile({
    required this.id,
    required this.phoneE164,
    required this.status,
    required this.walletBalance,
    required this.memberships,
  });
}
