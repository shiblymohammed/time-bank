import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface AuthenticatedUserPayload {
  id: string;
  phoneE164?: string;
  roles?: string[];
  isSuperAdmin?: boolean;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. Check development/test bypass header
    const devUserId = request.headers['x-user-id'];
    const isDev = this.configService.get('NODE_ENV') !== 'production';

    if (isDev && devUserId && typeof devUserId === 'string') {
      request.user = {
        id: devUserId,
        phoneE164: request.headers['x-user-phone'] ?? '+919876543210',
        isSuperAdmin: request.headers['x-is-super-admin'] === 'true',
      };
      request.userId = devUserId;
      return true;
    }

    // 2. Extract Bearer token from Authorization header
    const authHeader = request.headers['authorization'];
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Missing authorization token');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization format; Bearer token required');
    }

    try {
      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      const payload = await this.jwtService.verifyAsync(token, { secret });

      request.user = {
        id: payload.sub ?? payload.id,
        phoneE164: payload.phone,
        activeOrgId: payload.orgId,
        roles: payload.roles ?? [],
        isSuperAdmin: payload.isSuperAdmin ?? false,
      };
      request.userId = request.user.id;

      return true;
    } catch {
      throw new UnauthorizedException('Token is invalid or expired');
    }
  }
}
