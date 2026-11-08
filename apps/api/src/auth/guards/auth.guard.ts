import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { requestContext } from '../staff-context';

export interface AuthenticatedUserPayload {
  id: string;
  phoneE164?: string;
  roles?: string[];
  isSuperAdmin?: boolean;
  /** The sign-in this token belongs to. */
  sessionId?: string;
}

/** STAFF_SECOND_FACTOR=off turns the emailed staff code off, for private QA only. */
export function staffCodeRequired(config: ConfigService): boolean {
  return config.get<string>('STAFF_SECOND_FACTOR', 'email') !== 'off';
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  /** Records on the request whether its sign-in passed the staff email code. */
  private async markStaffVerification(userId: string, sessionId?: string): Promise<void> {
    const store = requestContext.getStore();
    if (!store) return;
    if (!staffCodeRequired(this.configService) || !this.dataSource) {
      store.staffVerified = true;
      return;
    }
    const rows: unknown[] = sessionId
      ? await this.dataSource.query(
          `SELECT 1 FROM authentication_sessions
           WHERE id = $1 AND user_id = $2 AND staff_verified_at IS NOT NULL
             AND revoked_at IS NULL AND expires_at > now()`,
          [sessionId, userId],
        )
      : [];
    store.staffVerified = rows.length > 0;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Development impersonation requires an explicit opt-in and real database permissions.
    const devUserId = request.headers['x-user-id'];
    const environment = this.configService.get<string>('NODE_ENV');
    const allowsDevHeaders =
      (environment === 'development' || environment === 'test') &&
      this.configService.get<string>('AUTH_ALLOW_DEV_HEADERS') === 'true';

    if (allowsDevHeaders && devUserId && typeof devUserId === 'string') {
      request.user = {
        id: devUserId,
        phoneE164: request.headers['x-user-phone'] ?? '+919876543210',
        isSuperAdmin: false,
      };
      request.userId = devUserId;
      const store = requestContext.getStore();
      if (store) store.staffVerified = true;
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

    let payload: Record<string, any>;
    try {
      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      payload = await this.jwtService.verifyAsync(token, { secret });
    } catch {
      throw new UnauthorizedException('Token is invalid or expired');
    }

    request.user = {
      id: payload.sub ?? payload.id,
      phoneE164: payload.phone,
      activeOrgId: payload.orgId,
      roles: payload.roles ?? [],
      isSuperAdmin: payload.isSuperAdmin ?? false,
      sessionId: typeof payload.sid === 'string' ? payload.sid : undefined,
    };
    request.userId = request.user.id;
    await this.markStaffVerification(request.user.id, request.user.sessionId);
    return true;
  }
}
