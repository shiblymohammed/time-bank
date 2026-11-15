import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';

/** Live discovery must stop on logout/recovery even while an old access JWT has not expired. */
@Injectable()
export class NearbySessionGuard implements CanActivate {
  constructor(private readonly db: DataSource) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest().user;
    if (typeof user?.sessionId !== 'string' || !isUUID(user.sessionId))
      throw new UnauthorizedException('Sign in again to use Nearby.');
    const sessions = await this.db.query(
      `SELECT 1 FROM authentication_sessions
      WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()`,
      [user.sessionId, user.id],
    );
    if (!sessions.length) throw new UnauthorizedException('This sign-in has ended. Sign in again.');
    return true;
  }
}
