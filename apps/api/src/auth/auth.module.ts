import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OtpChallenge } from './entities/otp-challenge.entity';
import { AuthenticationSession } from './entities/authentication-session.entity';
import { User } from '../identity/entities/user.entity';
import { VerifiedIdentity } from '../identity/entities/verified-identity.entity';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { MembershipRoleGrant } from '../memberships/entities/membership-role-grant.entity';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './guards/auth.guard';
import { SmsService } from './sms/sms.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OtpChallenge,
      AuthenticationSession,
      User,
      VerifiedIdentity,
      UniversalTimeWallet,
      Organization,
      OrganizationMembership,
      MembershipRoleGrant,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_TOKEN_EXPIRY') ?? '15m') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, SmsService],
  exports: [JwtModule, AuthGuard, AuthService, SmsService],
})
export class AuthModule {}
