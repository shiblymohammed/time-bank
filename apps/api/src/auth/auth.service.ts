import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  AccountStatus,
  IdentityVerificationStatus,
  IdentityVerificationLevel,
  UserRole,
  RoleGrantStatus,
  MembershipStatus,
} from '@ktb/shared-types';

import { OtpChallenge } from './entities/otp-challenge.entity';
import { AuthenticationSession } from './entities/authentication-session.entity';
import { User } from '../identity/entities/user.entity';
import { VerifiedIdentity } from '../identity/entities/verified-identity.entity';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { AuditService } from '../audit/audit.service';
import { SmsService } from './sms/sms.service';
import { normalizeToE164, sha256 } from './utils/phone.util';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

export interface AuthSessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    phoneE164: string;
    status: AccountStatus;
    primaryOrgId?: string | null;
  };
  verifiedIdentity?: {
    verificationStatus: string;
    verificationLevel: string;
  };
  universalWallet?: {
    balanceCredits: number;
    frozenCredits: number;
  };
  activeOrganization?: {
    id: string;
    code: string;
    name: string;
  } | null;
  roles: string[];
  isSuperAdmin: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(OtpChallenge)
    private readonly otpRepo: Repository<OtpChallenge>,
    @InjectRepository(AuthenticationSession)
    private readonly sessionRepo: Repository<AuthenticationSession>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly smsService: SmsService,
  ) {}

  /**
   * Request a single-use OTP challenge (M2-07, FR-IDENT-01).
   * Enforces 60-second rate-limiting cooldown and logs an audit trail.
   */
  async requestOtp(
    dto: RequestOtpDto,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string; expiresInSeconds: number; devOtp?: string }> {
    const phoneE164 = normalizeToE164(dto.phone);
    const phoneHash = sha256(phoneE164);

    // 1. Rate-limiting cooldown: prevent requesting a new OTP within 60s
    const cooldownSeconds = 60;
    const cooldownCutoff = new Date(Date.now() - cooldownSeconds * 1000);

    const recentChallenge = await this.otpRepo.findOne({
      where: {
        phoneHash,
        consumedAt: IsNull(),
        createdAt: MoreThan(cooldownCutoff),
      },
      order: { createdAt: 'DESC' },
    });

    if (recentChallenge) {
      throw new HttpException(
        `Please wait ${cooldownSeconds} seconds before requesting a new verification code`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Generate 6-digit numeric OTP code
    const isDev = this.configService.get('NODE_ENV') !== 'production';
    const otp = crypto.randomInt(100000, 1000000).toString();
    const codeHash = sha256(otp);

    // 3. Challenge validity: default 10 minutes (600s)
    const expirySeconds = Number(this.configService.get('OTP_EXPIRY_SECONDS') ?? 600);
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);
    const maxAttempts = Number(this.configService.get('OTP_MAX_ATTEMPTS') ?? 3);

    const challenge = this.otpRepo.create({
      phoneHash,
      codeHash,
      expiresAt,
      attemptCount: 0,
      maxAttempts,
    });
    await this.otpRepo.save(challenge);

    // 4. Dispatch SMS
    await this.smsService.sendOtp(phoneE164, otp);

    // 5. Audit log
    await this.auditService.logEvent({
      eventType: 'OTP_REQUESTED',
      ipAddress,
      payload: {
        phoneHash,
        expiresAt,
        maxAttempts,
      },
    });

    return {
      success: true,
      message: 'Verification code sent successfully',
      expiresInSeconds: expirySeconds,
      ...(isDev ? { devOtp: otp } : {}),
    };
  }

  /**
   * Verifies an OTP code and establishes an authenticated session (M2-08, M2-09).
   * Automatically creates global user + universal wallet if first-time verification.
   */
  async verifyOtp(dto: VerifyOtpDto, ipAddress?: string): Promise<AuthSessionResponse> {
    const phoneE164 = normalizeToE164(dto.phone);
    const phoneHash = sha256(phoneE164);

    // 1. Fetch latest active unconsumed challenge
    const challenge = await this.otpRepo.findOne({
      where: {
        phoneHash,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!challenge) {
      throw new BadRequestException('No active verification challenge found or code has expired');
    }

    if (challenge.attemptCount >= challenge.maxAttempts) {
      throw new BadRequestException(
        'Maximum verification attempts exceeded. Please request a new code',
      );
    }

    // 2. Validate code
    challenge.attemptCount += 1;
    const inputHash = sha256(dto.code);

    if (inputHash !== challenge.codeHash) {
      await this.otpRepo.save(challenge);
      throw new UnauthorizedException('Invalid verification code');
    }

    // Consume challenge
    challenge.consumedAt = new Date();
    await this.otpRepo.save(challenge);

    // 3. User lookup or onboarding in atomic transaction
    let user: User;
    let isNewUser = false;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userRepo = queryRunner.manager.getRepository(User);
      const identityRepo = queryRunner.manager.getRepository(VerifiedIdentity);
      const walletRepo = queryRunner.manager.getRepository(UniversalTimeWallet);

      const existingUser = await userRepo.findOne({
        where: { phoneE164 },
        relations: ['verifiedIdentity', 'universalWallet'],
      });

      if (!existingUser) {
        // Auto-provision global identity + universal wallet
        isNewUser = true;
        const newUser = userRepo.create({
          phoneE164,
          status: AccountStatus.ACTIVE,
        });
        const savedUser = await userRepo.save(newUser);

        const identity = identityRepo.create({
          userId: savedUser.id,
          verificationStatus: IdentityVerificationStatus.UNVERIFIED,
          verificationLevel: IdentityVerificationLevel.BASIC,
        });
        await identityRepo.save(identity);
        savedUser.verifiedIdentity = identity;

        const wallet = walletRepo.create({
          userId: savedUser.id,
          balanceCredits: 0.0,
          frozenCredits: 0.0,
          status: 'ACTIVE',
        });
        await walletRepo.save(wallet);
        savedUser.universalWallet = wallet;

        user = savedUser;
      } else {
        user = existingUser;
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    // 4. Check user status
    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(`Your account is ${user.status.toLowerCase()}. Access denied.`);
    }

    // 5. Resolve organization context (if provided)
    let activeOrg: Organization | null = null;
    let roles: string[] = [];
    let isSuperAdmin = false;

    // Check if user has global SUPER_ADMIN grant anywhere
    const superAdminGrant = await this.membershipRepo
      .createQueryBuilder('membership')
      .innerJoin('membership.roleGrants', 'grant')
      .where('membership.userId = :userId', { userId: user.id })
      .andWhere('grant.role = :role', { role: UserRole.SUPER_ADMIN })
      .andWhere('grant.status = :status', { status: RoleGrantStatus.ACTIVE })
      .andWhere('membership.status = :membershipStatus', {
        membershipStatus: MembershipStatus.APPROVED,
      })
      .getOne();

    if (superAdminGrant) {
      isSuperAdmin = true;
      roles.push(UserRole.SUPER_ADMIN);
    }

    if (dto.organizationCode) {
      activeOrg = await this.orgRepo.findOne({
        where: { code: dto.organizationCode.toUpperCase() },
      });

      if (activeOrg) {
        const membership = await this.membershipRepo.findOne({
          where: { organizationId: activeOrg.id, userId: user.id },
          relations: ['roleGrants'],
        });

        if (membership && membership.status === MembershipStatus.APPROVED) {
          const activeGrants = membership.roleGrants
            .filter((g) => g.status === RoleGrantStatus.ACTIVE)
            .map((g) => g.role);

          roles = Array.from(new Set([...roles, ...activeGrants]));
        }
      }
    }

    // 6. Generate JWT Access Token & Refresh Token (M2-09)
    const jwtPayload = {
      sub: user.id,
      phone: user.phoneE164,
      orgId: activeOrg?.id ?? null,
      roles,
      isSuperAdmin,
    };
    const accessToken = this.jwtService.sign(jwtPayload);

    // Cryptographically secure refresh token (30-day lifetime per D#39)
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = sha256(rawRefreshToken);
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const session = this.sessionRepo.create({
      userId: user.id,
      refreshTokenHash,
      activeOrgId: activeOrg?.id ?? null,
      deviceInfo: dto.deviceInfo ?? {},
      expiresAt: refreshExpiresAt,
    });
    await this.sessionRepo.save(session);

    // 7. Audit log events
    if (isNewUser) {
      await this.auditService.logEvent({
        eventType: 'IDENTITY_REGISTERED',
        actorId: user.id,
        targetId: user.id,
        targetType: 'USER',
        organizationId: activeOrg?.id ?? null,
        ipAddress,
        payload: { phoneE164 },
      });
    }

    await this.auditService.logEvent({
      eventType: 'AUTH_LOGIN',
      actorId: user.id,
      targetId: session.id,
      targetType: 'AUTHENTICATION_SESSION',
      organizationId: activeOrg?.id ?? null,
      ipAddress,
      payload: {
        activeOrgId: activeOrg?.id ?? null,
        isNewUser,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900, // 15 minutes in seconds
      user: {
        id: user.id,
        phoneE164: user.phoneE164,
        status: user.status,
        primaryOrgId: user.primaryOrgId ?? null,
      },
      verifiedIdentity: user.verifiedIdentity
        ? {
            verificationStatus: user.verifiedIdentity.verificationStatus,
            verificationLevel: user.verifiedIdentity.verificationLevel,
          }
        : {
            verificationStatus: IdentityVerificationStatus.UNVERIFIED,
            verificationLevel: IdentityVerificationLevel.BASIC,
          },
      universalWallet: user.universalWallet
        ? {
            balanceCredits: Number(user.universalWallet.balanceCredits),
            frozenCredits: Number(user.universalWallet.frozenCredits),
          }
        : {
            balanceCredits: 0,
            frozenCredits: 0,
          },
      activeOrganization: activeOrg
        ? {
            id: activeOrg.id,
            code: activeOrg.code,
            name: activeOrg.name,
          }
        : null,
      roles,
      isSuperAdmin,
    };
  }

  /**
   * Refreshes an expired access token using a valid refresh token.
   */
  async refreshToken(
    dto: RefreshTokenDto,
    ipAddress?: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const tokenHash = sha256(dto.refreshToken);

    const session = await this.sessionRepo.findOne({
      where: {
        refreshTokenHash: tokenHash,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: ['user'],
    });

    if (!session || !session.user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (session.user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }

    // Determine roles in session's active organization
    let roles: string[] = [];
    let isSuperAdmin = false;

    const superAdminGrant = await this.membershipRepo
      .createQueryBuilder('membership')
      .innerJoin('membership.roleGrants', 'grant')
      .where('membership.userId = :userId', { userId: session.user.id })
      .andWhere('grant.role = :role', { role: UserRole.SUPER_ADMIN })
      .andWhere('grant.status = :status', { status: RoleGrantStatus.ACTIVE })
      .andWhere('membership.status = :membershipStatus', {
        membershipStatus: MembershipStatus.APPROVED,
      })
      .getOne();

    if (superAdminGrant) {
      isSuperAdmin = true;
      roles.push(UserRole.SUPER_ADMIN);
    }

    if (session.activeOrgId) {
      const membership = await this.membershipRepo.findOne({
        where: { organizationId: session.activeOrgId, userId: session.user.id },
        relations: ['roleGrants'],
      });

      if (membership && membership.status === MembershipStatus.APPROVED) {
        const activeGrants = membership.roleGrants
          .filter((g) => g.status === RoleGrantStatus.ACTIVE)
          .map((g) => g.role);

        roles = Array.from(new Set([...roles, ...activeGrants]));
      }
    }

    const payload = {
      sub: session.user.id,
      phone: session.user.phoneE164,
      orgId: session.activeOrgId ?? null,
      roles,
      isSuperAdmin,
    };

    const accessToken = this.jwtService.sign(payload);

    await this.auditService.logEvent({
      eventType: 'AUTH_TOKEN_REFRESHED',
      actorId: session.user.id,
      targetId: session.id,
      targetType: 'AUTHENTICATION_SESSION',
      organizationId: session.activeOrgId ?? null,
      ipAddress,
    });

    return {
      accessToken,
      expiresIn: 900,
    };
  }

  /**
   * Terminates an authentication session by revoking the refresh token.
   */
  async logout(
    dto: RefreshTokenDto,
    userId?: string,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string }> {
    const tokenHash = sha256(dto.refreshToken);

    const session = await this.sessionRepo.findOne({
      where: { refreshTokenHash: tokenHash },
    });

    if (session && !session.revokedAt) {
      session.revokedAt = new Date();
      await this.sessionRepo.save(session);

      await this.auditService.logEvent({
        eventType: 'AUTH_LOGOUT',
        actorId: userId ?? session.userId,
        targetId: session.id,
        targetType: 'AUTHENTICATION_SESSION',
        organizationId: session.activeOrgId ?? null,
        ipAddress,
      });
    }

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * Retrieves current authenticated user profile, wallet, and multi-tenant memberships.
   */
  async getMe(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: [
        'verifiedIdentity',
        'universalWallet',
        'memberships',
        'memberships.organization',
        'memberships.organization.branding',
        'memberships.roleGrants',
      ],
    });

    if (!user) {
      throw new NotFoundException('User identity not found');
    }

    const memberships = (user.memberships || []).map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      organizationCode: m.organization?.code,
      organizationName: m.organization?.name,
      branding: m.organization?.branding
        ? {
            appDisplayName: m.organization.branding.appDisplayName,
            primaryColor: m.organization.branding.primaryColor,
            secondaryColor: m.organization.branding.secondaryColor,
            logoKey: m.organization.branding.logoKey,
          }
        : null,
      membershipNumber: m.membershipNumber,
      status: m.status,
      appliedAt: m.appliedAt,
      approvedAt: m.approvedAt,
      roles: (m.roleGrants || [])
        .filter((g) => g.status === RoleGrantStatus.ACTIVE)
        .map((g) => g.role),
    }));

    return {
      id: user.id,
      phoneE164: user.phoneE164,
      status: user.status,
      primaryOrgId: user.primaryOrgId,
      createdAt: user.createdAt,
      verifiedIdentity: user.verifiedIdentity
        ? {
            id: user.verifiedIdentity.id,
            verificationStatus: user.verifiedIdentity.verificationStatus,
            verificationLevel: user.verifiedIdentity.verificationLevel,
            verifiedAt: user.verifiedIdentity.verifiedAt,
          }
        : null,
      universalWallet: user.universalWallet
        ? {
            id: user.universalWallet.id,
            balanceCredits: Number(user.universalWallet.balanceCredits),
            frozenCredits: Number(user.universalWallet.frozenCredits),
            status: user.universalWallet.status,
          }
        : null,
      memberships,
    };
  }
}
