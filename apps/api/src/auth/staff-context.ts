import { AsyncLocalStorage } from 'node:async_hooks';
import { UserRole } from '@ktb/shared-types';

/** Roles that act on other people's records, and so need the emailed staff code. */
export const STAFF_ROLES: readonly UserRole[] = [
  UserRole.COORDINATOR,
  UserRole.MUNICIPALITY_ADMIN,
  UserRole.SUPER_ADMIN,
];

interface RequestContext {
  /** Set by AuthGuard: whether this sign-in passed the emailed staff code. */
  staffVerified?: boolean;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * False only inside a request whose sign-in has not passed the staff code. Background
 * workers run outside any request and keep their authority.
 */
export function staffPowersAllowed(): boolean {
  return requestContext.getStore()?.staffVerified !== false;
}

export function withoutUnverifiedStaffRoles<T extends string>(roles: T[]): T[] {
  return staffPowersAllowed()
    ? roles
    : roles.filter((role) => !STAFF_ROLES.includes(role as unknown as UserRole));
}
