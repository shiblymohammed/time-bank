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

// ─── Account status ───────────────────────────────────────────────────────────
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
