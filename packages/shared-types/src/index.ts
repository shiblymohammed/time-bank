/**
 * @ktb/shared-types
 *
 * Shared TypeScript types, enums and DTOs used by both the NestJS API
 * and the Next.js web dashboard. This package is intentionally kept
 * thin — business logic lives in @ktb/api.
 *
 * PRD decisions driving the shape of these types:
 *   - D#39  One permanent verified identity; multiple approved roles
 *   - D#2   Super Admin → Municipality Admin → Coordinator hierarchy
 *   - D#3   Time credits are distinct from loyalty coins
 *   - D#93  Flutter mobile + Next.js web at launch
 *   - D#95  NestJS + TypeScript + PostgreSQL backend
 */

// ─── Role enum ───────────────────────────────────────────────────────────────
/**
 * All actor roles in the system (PRD §2, D#2, D#39).
 * A single user record can hold multiple approved roles simultaneously.
 * Permissions are enforced on the server, never only in UI (NFR-09).
 */
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  MUNICIPALITY_ADMIN = 'MUNICIPALITY_ADMIN',
  COORDINATOR = 'COORDINATOR',
  VOLUNTEER = 'VOLUNTEER',
  BENEFICIARY = 'BENEFICIARY',
  CAREGIVER = 'CAREGIVER',
  MERCHANT = 'MERCHANT',
}

// ─── Account & verification status ──────────────────────────────────────────
/**
 * Lifecycle states for a user account.
 * PRD: D#80 suspension; D#82 permanent ban; D#46 deceased closure.
 */
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  /** Temporary suspension — wallet frozen, balances preserved (D#79, D#80) */
  SUSPENDED = 'SUSPENDED',
  /** Platform-wide permanent ban — Municipality Admin authorized (D#82, D#83) */
  PERMANENTLY_BANNED = 'PERMANENTLY_BANNED',
  /** Deceased — new operations stopped, nominee transfer initiated (D#46) */
  DECEASED_CLOSED = 'DECEASED_CLOSED',
  /** Duplicate account — coordinator-reviewed and Municipality Admin approved (D#87, D#88) */
  DUPLICATE_CLOSED = 'DUPLICATE_CLOSED',
}

/**
 * Identity verification status for a global user.
 */
export enum IdentityVerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

/**
 * Identity verification levels (Basic mobile verification vs document-verified).
 */
export enum IdentityVerificationLevel {
  BASIC = 'BASIC',
  DOCUMENT_VERIFIED = 'DOCUMENT_VERIFIED',
  COMMUNITY_VOUCHED = 'COMMUNITY_VOUCHED',
}

/**
 * Standard identity document types recognized for KYC/verification.
 */
export enum IdentityDocumentType {
  AADHAAR_CARD = 'AADHAAR_CARD',
  VOTER_ID = 'VOTER_ID',
  DRIVING_LICENSE = 'DRIVING_LICENSE',
  PASSPORT = 'PASSPORT',
  RATION_CARD = 'RATION_CARD',
  OTHER_GOVERNMENT_ID = 'OTHER_GOVERNMENT_ID',
}

/**
 * Document review status.
 */
export enum DocumentReviewStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUPERSEDED = 'SUPERSEDED',
}

// ─── Organization & membership types ─────────────────────────────────────────
/**
 * Administrative classification of an onboarded civic organization.
 */
export enum OrganizationType {
  MUNICIPAL_CORPORATION = 'MUNICIPAL_CORPORATION',
  MUNICIPALITY = 'MUNICIPALITY',
  GRAMA_PANCHAYAT = 'GRAMA_PANCHAYAT',
  SPECIAL_ADMINISTRATIVE_ZONE = 'SPECIAL_ADMINISTRATIVE_ZONE',
}

/**
 * Status of an onboarded organization / tenant.
 */
export enum OrganizationStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Organization membership lifecycle states.
 */
export enum MembershipStatus {
  APPLIED = 'APPLIED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
}

/**
 * Role grant lifecycle state.
 */
export enum RoleGrantStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  SUSPENDED = 'SUSPENDED',
}

/**
 * Audit actions for membership approvals and lifecycle transitions.
 */
export enum MembershipApprovalAction {
  APPLICATION_SUBMITTED = 'APPLICATION_SUBMITTED',
  DOCUMENT_REQUESTED = 'DOCUMENT_REQUESTED',
  MEMBERSHIP_APPROVED = 'MEMBERSHIP_APPROVED',
  MEMBERSHIP_REJECTED = 'MEMBERSHIP_REJECTED',
  MEMBERSHIP_SUSPENDED = 'MEMBERSHIP_SUSPENDED',
  MEMBERSHIP_REINSTATED = 'MEMBERSHIP_REINSTATED',
  ROLE_GRANTED = 'ROLE_GRANTED',
  ROLE_REVOKED = 'ROLE_REVOKED',
}

/**
 * Platform-wide global restriction types.
 */
export enum GlobalRestrictionType {
  TEMPORARY_SUSPENSION = 'TEMPORARY_SUSPENSION',
  PERMANENT_BAN = 'PERMANENT_BAN',
  DUPLICATE_FREEZE = 'DUPLICATE_FREEZE',
  FRAUD_INVESTIGATION_HOLD = 'FRAUD_INVESTIGATION_HOLD',
}

/**
 * Global restriction lifecycle status.
 */
export enum GlobalRestrictionStatus {
  ACTIVE = 'ACTIVE',
  RESOLVED = 'RESOLVED',
  OVERTURNED_ON_APPEAL = 'OVERTURNED_ON_APPEAL',
}

// ─── Wallet / ledger types ────────────────────────────────────────────────────
/**
 * The two distinct wallet types (D#3).
 * Time credits are a lifetime universal wallet (D#17).
 * Loyalty coins are municipality-enabled (D#4, D#23, D#94).
 */
export enum WalletType {
  /** Lifetime time-credit wallet — cross-municipality (D#17, FR-TIME-01) */
  TIME_CREDIT = 'TIME_CREDIT',
  /** Merchant loyalty coins — separate, cannot pay for services (D#3, BR-03) */
  LOYALTY_COIN = 'LOYALTY_COIN',
}

// ─── AppEnvironment ───────────────────────────────────────────────────────────
/**
 * D#104: Development and production only — no staging environment.
 */
export type AppEnvironment = 'development' | 'production';

// ─── API response envelope ────────────────────────────────────────────────────
/**
 * Standard success envelope for all API responses.
 * Error responses follow RFC 7807 Problem Details (implemented in API layer).
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  /** ISO-8601 timestamp of the response */
  timestamp: string;
}

export interface ApiPaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ─── Municipality ─────────────────────────────────────────────────────────────
/**
 * Minimal municipality reference type.
 * Full entity lives in the API module (D#1, D#2, D#52).
 */
export interface MunicipalityRef {
  id: string;
  name: string;
  /** ISO 3166-2 state code, e.g. "KL" for Kerala */
  stateCode: string;
}

// ─── Health check ────────────────────────────────────────────────────────────
export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  environment: AppEnvironment;
  timestamp: string;
}

// ─── Milestone 3: Service Catalogue, Requests & Matching Types ───────────────

export enum UrgencyType {
  IMMEDIATE = 'IMMEDIATE',
  SCHEDULED = 'SCHEDULED',
}

export enum CreationChannel {
  DIRECT_BENEFICIARY = 'DIRECT_BENEFICIARY',
  CAREGIVER_PROXY = 'CAREGIVER_PROXY',
  COORDINATOR_ON_BEHALF = 'COORDINATOR_ON_BEHALF',
}

export enum ServiceRequestStatus {
  DRAFT = 'DRAFT',
  MATCHING_ACTIVE = 'MATCHING_ACTIVE',
  PARTIALLY_ACCEPTED = 'PARTIALLY_ACCEPTED',
  FULLY_MATCHED = 'FULLY_MATCHED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
  EXPIRED_UNMATCHED = 'EXPIRED_UNMATCHED',
  ESCALATED_TO_COORDINATOR = 'ESCALATED_TO_COORDINATOR',
}

export enum VolunteerAssignmentStatus {
  OFFERED = 'OFFERED',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  TIMED_OUT = 'TIMED_OUT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  WITHDRAWN = 'WITHDRAWN',
  REPLACED = 'REPLACED',
}

export enum CaregiverRelationshipType {
  FAMILY_CHILD = 'FAMILY_CHILD',
  FAMILY_SPOUSE = 'FAMILY_SPOUSE',
  LEGAL_GUARDIAN = 'LEGAL_GUARDIAN',
  COMMUNITY_REPRESENTATIVE = 'COMMUNITY_REPRESENTATIVE',
  OTHER = 'OTHER',
}

export enum CaregiverAuthorizationStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REVOKED = 'REVOKED',
}

export enum BeneficiaryEligibilityType {
  ONGOING = 'ONGOING',
  TEMPORARY = 'TEMPORARY',
}

export enum BeneficiaryEligibilityStatus {
  ACTIVE = 'ACTIVE',
  PENDING_REVIEW = 'PENDING_REVIEW',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
}

export enum SkillVerificationStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum ServiceProposalStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum CancellerRole {
  BENEFICIARY = 'BENEFICIARY',
  CAREGIVER = 'CAREGIVER',
  COORDINATOR = 'COORDINATOR',
  SYSTEM = 'SYSTEM',
}

export enum MatchingRoundStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  ESCALATED = 'ESCALATED',
}

export enum MatchingEscalationReason {
  ROUNDS_EXHAUSTED = 'ROUNDS_EXHAUSTED',
  NO_QUALIFIED_CANDIDATES = 'NO_QUALIFIED_CANDIDATES',
  START_TIME_IMMINENT = 'START_TIME_IMMINENT',
  MANUAL_COORDINATOR_TRIGGER = 'MANUAL_COORDINATOR_TRIGGER',
}
