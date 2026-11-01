import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@ktb/shared-types';
import { RoleHierarchyService } from './role-hierarchy.service';

describe('RoleHierarchyService', () => {
  let service: RoleHierarchyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoleHierarchyService],
    }).compile();

    service = module.get<RoleHierarchyService>(RoleHierarchyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('assertCanGrantRole', () => {
    describe('SUPER_ADMIN privileges', () => {
      it('should allow SUPER_ADMIN to grant any operational role', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.SUPER_ADMIN, UserRole.VOLUNTEER),
        ).not.toThrow();
        expect(() =>
          service.assertCanGrantRole(UserRole.SUPER_ADMIN, UserRole.BENEFICIARY),
        ).not.toThrow();
        expect(() =>
          service.assertCanGrantRole(UserRole.SUPER_ADMIN, UserRole.CAREGIVER),
        ).not.toThrow();
        expect(() =>
          service.assertCanGrantRole(UserRole.SUPER_ADMIN, UserRole.MERCHANT),
        ).not.toThrow();
      });

      it('should allow SUPER_ADMIN to grant COORDINATOR role', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.SUPER_ADMIN, UserRole.COORDINATOR),
        ).not.toThrow();
      });

      it('should allow SUPER_ADMIN to grant MUNICIPALITY_ADMIN role', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.SUPER_ADMIN, UserRole.MUNICIPALITY_ADMIN),
        ).not.toThrow();
      });

      it('should allow SUPER_ADMIN to grant SUPER_ADMIN role', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.SUPER_ADMIN, UserRole.SUPER_ADMIN),
        ).not.toThrow();
      });
    });

    describe('MUNICIPALITY_ADMIN privileges', () => {
      it('should allow MUNICIPALITY_ADMIN to grant operational roles', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.MUNICIPALITY_ADMIN, UserRole.VOLUNTEER),
        ).not.toThrow();
        expect(() =>
          service.assertCanGrantRole(UserRole.MUNICIPALITY_ADMIN, UserRole.BENEFICIARY),
        ).not.toThrow();
        expect(() =>
          service.assertCanGrantRole(UserRole.MUNICIPALITY_ADMIN, UserRole.CAREGIVER),
        ).not.toThrow();
        expect(() =>
          service.assertCanGrantRole(UserRole.MUNICIPALITY_ADMIN, UserRole.MERCHANT),
        ).not.toThrow();
      });

      it('should allow MUNICIPALITY_ADMIN to grant COORDINATOR role', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.MUNICIPALITY_ADMIN, UserRole.COORDINATOR),
        ).not.toThrow();
      });

      it('should reject MUNICIPALITY_ADMIN attempting to grant SUPER_ADMIN', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN),
        ).toThrow(ForbiddenException);
        expect(() =>
          service.assertCanGrantRole(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN),
        ).toThrow(/global administrative role/i);
      });

      it('should reject MUNICIPALITY_ADMIN attempting to grant MUNICIPALITY_ADMIN', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.MUNICIPALITY_ADMIN, UserRole.MUNICIPALITY_ADMIN),
        ).toThrow(ForbiddenException);
        expect(() =>
          service.assertCanGrantRole(UserRole.MUNICIPALITY_ADMIN, UserRole.MUNICIPALITY_ADMIN),
        ).toThrow(/only SUPER_ADMIN can grant administrative roles/i);
      });
    });

    describe('COORDINATOR privileges', () => {
      it('should allow COORDINATOR to grant operational roles', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.COORDINATOR, UserRole.VOLUNTEER),
        ).not.toThrow();
        expect(() =>
          service.assertCanGrantRole(UserRole.COORDINATOR, UserRole.BENEFICIARY),
        ).not.toThrow();
        expect(() =>
          service.assertCanGrantRole(UserRole.COORDINATOR, UserRole.CAREGIVER),
        ).not.toThrow();
        expect(() =>
          service.assertCanGrantRole(UserRole.COORDINATOR, UserRole.MERCHANT),
        ).not.toThrow();
      });

      it('should reject COORDINATOR attempting to grant COORDINATOR', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.COORDINATOR, UserRole.COORDINATOR),
        ).toThrow(ForbiddenException);
        expect(() =>
          service.assertCanGrantRole(UserRole.COORDINATOR, UserRole.COORDINATOR),
        ).toThrow(/cannot grant COORDINATOR role/i);
      });

      it('should reject COORDINATOR attempting to grant MUNICIPALITY_ADMIN', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN),
        ).toThrow(ForbiddenException);
        expect(() =>
          service.assertCanGrantRole(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN),
        ).toThrow(/cannot grant administrative roles/i);
      });

      it('should reject COORDINATOR attempting to grant SUPER_ADMIN', () => {
        expect(() =>
          service.assertCanGrantRole(UserRole.COORDINATOR, UserRole.SUPER_ADMIN),
        ).toThrow(ForbiddenException);
        expect(() =>
          service.assertCanGrantRole(UserRole.COORDINATOR, UserRole.SUPER_ADMIN),
        ).toThrow(/global administrative role.*cannot be granted/i);
      });
    });

    describe('Non-administrative roles', () => {
      it('should reject VOLUNTEER attempting to grant any role', () => {
        expect(() => service.assertCanGrantRole(UserRole.VOLUNTEER, UserRole.VOLUNTEER)).toThrow(
          ForbiddenException,
        );
        expect(() => service.assertCanGrantRole(UserRole.VOLUNTEER, UserRole.VOLUNTEER)).toThrow(
          /does not have authority to grant roles/i,
        );
      });

      it('should reject BENEFICIARY attempting to grant any role', () => {
        expect(() => service.assertCanGrantRole(UserRole.BENEFICIARY, UserRole.VOLUNTEER)).toThrow(
          ForbiddenException,
        );
      });

      it('should reject CAREGIVER attempting to grant any role', () => {
        expect(() => service.assertCanGrantRole(UserRole.CAREGIVER, UserRole.VOLUNTEER)).toThrow(
          ForbiddenException,
        );
      });

      it('should reject MERCHANT attempting to grant any role', () => {
        expect(() => service.assertCanGrantRole(UserRole.MERCHANT, UserRole.VOLUNTEER)).toThrow(
          ForbiddenException,
        );
      });
    });
  });

  describe('assertValidMembershipRole', () => {
    it('should allow operational roles', () => {
      expect(() => service.assertValidMembershipRole(UserRole.VOLUNTEER)).not.toThrow();
      expect(() => service.assertValidMembershipRole(UserRole.BENEFICIARY)).not.toThrow();
      expect(() => service.assertValidMembershipRole(UserRole.CAREGIVER)).not.toThrow();
      expect(() => service.assertValidMembershipRole(UserRole.MERCHANT)).not.toThrow();
    });

    it('should allow COORDINATOR role', () => {
      expect(() => service.assertValidMembershipRole(UserRole.COORDINATOR)).not.toThrow();
    });

    it('should allow MUNICIPALITY_ADMIN role', () => {
      expect(() => service.assertValidMembershipRole(UserRole.MUNICIPALITY_ADMIN)).not.toThrow();
    });

    it('should reject SUPER_ADMIN in membership workflows', () => {
      expect(() => service.assertValidMembershipRole(UserRole.SUPER_ADMIN)).toThrow(
        ForbiddenException,
      );
      expect(() => service.assertValidMembershipRole(UserRole.SUPER_ADMIN)).toThrow(
        /global administrative role.*cannot be granted during membership approval/i,
      );
    });
  });

  describe('isOperationalRole', () => {
    it('should return true for operational roles', () => {
      expect(service.isOperationalRole(UserRole.VOLUNTEER)).toBe(true);
      expect(service.isOperationalRole(UserRole.BENEFICIARY)).toBe(true);
      expect(service.isOperationalRole(UserRole.CAREGIVER)).toBe(true);
      expect(service.isOperationalRole(UserRole.MERCHANT)).toBe(true);
      expect(service.isOperationalRole(UserRole.COORDINATOR)).toBe(true);
    });

    it('should return false for administrative roles', () => {
      expect(service.isOperationalRole(UserRole.MUNICIPALITY_ADMIN)).toBe(false);
      expect(service.isOperationalRole(UserRole.SUPER_ADMIN)).toBe(false);
    });
  });

  describe('requiresSuperAdminToGrant', () => {
    it('should return true for SUPER_ADMIN role', () => {
      expect(service.requiresSuperAdminToGrant(UserRole.SUPER_ADMIN)).toBe(true);
    });

    it('should return true for MUNICIPALITY_ADMIN role', () => {
      expect(service.requiresSuperAdminToGrant(UserRole.MUNICIPALITY_ADMIN)).toBe(true);
    });

    it('should return false for operational roles', () => {
      expect(service.requiresSuperAdminToGrant(UserRole.COORDINATOR)).toBe(false);
      expect(service.requiresSuperAdminToGrant(UserRole.VOLUNTEER)).toBe(false);
      expect(service.requiresSuperAdminToGrant(UserRole.BENEFICIARY)).toBe(false);
      expect(service.requiresSuperAdminToGrant(UserRole.CAREGIVER)).toBe(false);
      expect(service.requiresSuperAdminToGrant(UserRole.MERCHANT)).toBe(false);
    });
  });
});
