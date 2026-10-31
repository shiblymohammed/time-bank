import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@ktb/shared-types';
import { AuthorizationService } from '../authorization.service';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const evaluateGlobalAccess = jest.fn();
  const getAllAndOverride = jest.fn();
  const guard = new RolesGuard(
    { getAllAndOverride } as unknown as Reflector,
    { evaluateGlobalAccess } as unknown as AuthorizationService,
  );
  const context = (request: object) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('validates global admin routes without an organization context', async () => {
    getAllAndOverride.mockReturnValue([UserRole.SUPER_ADMIN]);
    evaluateGlobalAccess.mockResolvedValue({ isSuperAdmin: true, roles: [UserRole.SUPER_ADMIN] });
    await expect(guard.canActivate(context({ user: { id: 'admin' } }))).resolves.toBe(true);
    expect(evaluateGlobalAccess).toHaveBeenCalledWith('admin');
  });
  it('rejects claimed Super Admin privileges without current database authorization', async () => {
    getAllAndOverride.mockReturnValue([UserRole.SUPER_ADMIN]);
    evaluateGlobalAccess.mockResolvedValue({ isSuperAdmin: false, roles: [] });
    await expect(
      guard.canActivate(context({ user: { id: 'user', isSuperAdmin: true } })),
    ).rejects.toThrow(ForbiddenException);
  });
  it('does not permit tenant roles without organization evaluation', async () => {
    getAllAndOverride.mockReturnValue([UserRole.COORDINATOR]);
    evaluateGlobalAccess.mockResolvedValue({ isSuperAdmin: false, roles: [] });
    await expect(
      guard.canActivate(
        context({ user: { id: 'coordinator', roles: [UserRole.COORDINATOR], isSuperAdmin: true } }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('checks tenant roles against the evaluated membership', async () => {
    getAllAndOverride.mockReturnValue([UserRole.COORDINATOR]);
    await expect(
      guard.canActivate(
        context({ organizationMembership: { roles: [UserRole.COORDINATOR], isSuperAdmin: false } }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        context({ organizationMembership: { roles: [UserRole.VOLUNTEER], isSuperAdmin: false } }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(evaluateGlobalAccess).not.toHaveBeenCalled();
  });
});
