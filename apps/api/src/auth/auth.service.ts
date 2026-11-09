import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
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
  OrganizationStatus,
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
import { REFRESH_OVERLAP_MS, refreshLifetimeMs } from './session-policy';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RESTRICTED_SCOPE } from './guards/auth.guard';

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
  /** This sign-in can only read the restriction and appeal it. */
  accountRestricted?: boolean;
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

  private assertLegacyOtpEnabled(): void {
    const environment = this.configService.get<string>('NODE_ENV');
    if (
      !['development', 'test'].includes(environment ?? '') ||
      this.configService.get<string>('AUTH_ALLOW_MOCK_OTP') !== 'true' ||
      this.configService.get<string>('SMS_PROVIDER', 'local-mock') !== 'local-mock'
    ) {
      throw new ServiceUnavailableException(
        'Legacy SMS sign-in is disabled. Use Firebase phone sign-in.',
      );
    }
  }

  /**
   * Request a single-use OTP challenge (M2-07, FR-IDENT-01).
   * Enforces 60-second rate-limiting cooldown and logs an audit trail.
   */
  async requestOtp(
    dto: RequestOtpDto,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string; expiresInSeconds: number; devOtp?: string }> {
    const phoneE164 = normalizeToE164(dto.phone);
    this.assertLegacyOtpEnabled();
    const phoneHash = sha256(phoneE164);

    // 1. Rate-limiting cooldown: prevent requesting a new OTP within 60s
    const cooldownSeconds = 60;
    const cooldownCutoff = new Date(Date.now() - cooldownSeconds * 1000);

    const isDev = this.configService.get('NODE_ENV') !== 'production';
    const isLocalMockOtp =
      ['development', 'test'].includes(this.configService.get<string>('NODE_ENV') ?? '') &&
      this.configService.get<string>('AUTH_ALLOW_MOCK_OTP') === 'true' &&
      this.configService.get<string>('SMS_PROVIDER', 'local-mock') === 'local-mock';
    const otp = isLocalMockOtp ? '123456' : crypto.randomInt(100000, 1000000).toString();
    const expirySeconds = Number(this.configService.get('OTP_EXPIRY_SECONDS') ?? 600);
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);
    const maxAttempts = Number(this.configService.get('OTP_MAX_ATTEMPTS') ?? 3);

    await this.dataSource.transaction(async (manager) => {
      // A row lock cannot protect a phone's first challenge. Serialize issuance
      // (and verification below) by phone, including across API instances.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`otp:${phoneHash}`]);
      const otpRepo = manager.getRepository(OtpChallenge);
      const recentChallenge = await otpRepo.findOne({
        where: { phoneHash, createdAt: MoreThan(cooldownCutoff) },
        order: { createdAt: 'DESC' },
      });
      if (recentChallenge) {
        throw new HttpException(
          `Please wait ${cooldownSeconds} seconds before requesting a new verification code`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await otpRepo.save(
        otpRepo.create({
          phoneHash,
          codeHash: sha256(otp),
          expiresAt,
          attemptCount: 0,
          maxAttempts,
        }),
      );
    });

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
    this.assertLegacyOtpEnabled();
    // Throw after commit so a wrong code still spends an attempt.
    if (!(await this.spendCode(phoneE164, dto.code))) {
      throw new UnauthorizedException('Invalid verification code');
    }
    return this.signInVerifiedPhone(phoneE164, dto, ipAddress);
  }

  /** A signed-in person proves they still hold their phone, by a code sent to it. */
  async confirmOwnPhoneCode(phone: string, code: string): Promise<boolean> {
    this.assertLegacyOtpEnabled();
    return this.spendCode(normalizeToE164(phone), code);
  }

  private async spendCode(phoneE164: string, code: string): Promise<boolean> {
    const phoneHash = sha256(phoneE164);

    // Lock verification and consumption together. Concurrent callers must not
    // both spend one code, or lose failed-attempt increments by saving stale rows.
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`otp:${phoneHash}`]);
      const otpRepo = manager.getRepository(OtpChallenge);
      const challenge = await otpRepo.findOne({
        where: {
          phoneHash,
        },
        order: { createdAt: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });

      if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) {
        throw new BadRequestException('No active verification challenge found or code has expired');
      }
      if (challenge.attemptCount >= challenge.maxAttempts) {
        throw new BadRequestException(
          'Maximum verification attempts exceeded. Please request a new code',
        );
      }
      challenge.attemptCount += 1;
      const matches = sha256(code) === challenge.codeHash;
      if (matches) challenge.consumedAt = new Date();
      await otpRepo.save(challenge);
      return matches;
    });
  }

  /** Called only after a server OTP or a verified Firebase phone ID token. */
  async signInVerifiedPhone(
    phone: string,
    dto: Pick<VerifyOtpDto, 'organizationCode' | 'deviceInfo'>,
    ipAddress?: string,
  ): Promise<AuthSessionResponse> {
    const phoneE164 = normalizeToE164(phone);
    // An app built for one community names it at sign-in. Refuse an unknown or closed one
    // before creating anything, instead of quietly signing in without a community.
    let appOrg: Organization | null = null;
    if (dto.organizationCode) {
      appOrg = await this.orgRepo.findOne({
        where: { code: dto.organizationCode.trim().toUpperCase() },
      });
      if (!appOrg || appOrg.status !== OrganizationStatus.ACTIVE) {
        throw new BadRequestException("This app's community is not available right now");
      }
    }
    // 3. User lookup or onboarding in atomic transaction
    let user: User;
    let isNewUser = false;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Firebase may exchange the same verified phone concurrently on first login.
      // Serialize provisioning so the unique phone/wallet constraints do not become a 500.
      await queryRunner.manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `identity:${phoneE164}`,
      ]);
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

    // 4. Check user status. A restricted person may still sign in, but only to read and appeal.
    const restricted = await this.isRestricted(
      user,
      () => new ForbiddenException('This account is closed. Contact your community coordinator.'),
    );

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

    if (superAdminGrant && !restricted) {
      isSuperAdmin = true;
      roles.push(UserRole.SUPER_ADMIN);
    }

    if (appOrg) {
      activeOrg = appOrg;
      {
        const membership = await this.membershipRepo.findOne({
          where: { organizationId: activeOrg.id, userId: user.id },
          relations: ['roleGrants'],
        });

        if (membership && membership.status === MembershipStatus.APPROVED && !restricted) {
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
      // The sign-in is locked to this app's community (see AuthGuard).
      ...(activeOrg ? { appOrg: activeOrg.id } : {}),
      ...(restricted ? { scope: RESTRICTED_SCOPE } : {}),
    };

    // Cryptographically secure refresh token (30-day lifetime per D#39)
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = sha256(rawRefreshToken);
    const refreshExpiresAt = new Date(
      Date.now() + refreshLifetimeMs(this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRY')),
    );

    const session = this.sessionRepo.create({
      userId: user.id,
      refreshTokenHash,
      activeOrgId: activeOrg?.id ?? null,
      deviceInfo: dto.deviceInfo ?? {},
      expiresAt: refreshExpiresAt,
    });
    await this.sessionRepo.save(session);
    // The token names its sign-in, so staff powers can wait for that sign-in's email code.
    const accessToken = this.jwtService.sign({ ...jwtPayload, sid: session.id });

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
      ...(restricted ? { accountRestricted: true } : {}),
    };
  }

  /**
   * True for a person restricted by a suspension, ban or hold, or closed as a duplicate: they can
   * still read why, and appeal. Any other closed account, such as a retired or deceased one,
   * cannot sign in at all.
   */
  private async isRestricted(user: User, refuse: () => Error): Promise<boolean> {
    if (
      user.status === AccountStatus.SUSPENDED ||
      user.status === AccountStatus.PERMANENTLY_BANNED ||
      user.status === AccountStatus.DUPLICATE_CLOSED
    ) {
      return true;
    }
    if (user.status !== AccountStatus.ACTIVE) throw refuse();
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM global_account_restrictions WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1`,
      [user.id],
    );
    return rows.length > 0;
  }

  /**
   * Refreshes an expired access token using a valid refresh token.
   */
  async refreshToken(
    dto: RefreshTokenDto,
    ipAddress?: string,
  ): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> {
    const tokenHash = sha256(dto.refreshToken);
    const live = { revokedAt: IsNull(), expiresAt: MoreThan(new Date()) };

    const session = await this.sessionRepo.findOne({
      where: [
        { refreshTokenHash: tokenHash, ...live },
        { previousRefreshTokenHash: tokenHash, ...live },
      ],
      relations: ['user'],
    });

    if (!session || !session.user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Someone restricted since signing in drops to the limited sign-in, and comes back from it
    // on the next refresh after access returns.
    const sessionRestricted = await this.isRestricted(
      session.user,
      () => new ForbiddenException('Account is not active'),
    );

    if (
      session.refreshTokenHash !== tokenHash &&
      Date.now() - (session.rotatedAt?.getTime() ?? 0) > REFRESH_OVERLAP_MS
    ) {
      await this.sessionRepo.update(session.id, { revokedAt: new Date() });
      await this.auditService.logEvent({
        eventType: 'AUTH_REFRESH_REUSE_DETECTED',
        actorId: session.user.id,
        targetId: session.id,
        targetType: 'AUTHENTICATION_SESSION',
        organizationId: session.activeOrgId ?? null,
        ipAddress,
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
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

    if (superAdminGrant && !sessionRestricted) {
      isSuperAdmin = true;
      roles.push(UserRole.SUPER_ADMIN);
    }

    if (session.activeOrgId && !sessionRestricted) {
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
      sid: session.id,
      ...(session.activeOrgId ? { appOrg: session.activeOrgId } : {}),
      ...(sessionRestricted ? { scope: RESTRICTED_SCOPE } : {}),
    };

    const accessToken = this.jwtService.sign(payload);

    // The replacement is worked out from the token presented, so a retry or a parallel request
    // with the same token gets the same replacement back. A phone whose reply was lost therefore
    // stays signed in instead of holding a token that no longer works.
    const replacement = crypto
      .createHmac('sha256', this.configService.getOrThrow<string>('JWT_SECRET'))
      .update(`refresh:${session.id}:${dto.refreshToken}`)
      .digest('hex');
    let refreshToken: string | undefined;
    if (session.refreshTokenHash === tokenHash) {
      // A parallel request with the same token may win this update; it writes the same value.
      await this.sessionRepo.update(
        { id: session.id, refreshTokenHash: tokenHash },
        {
          refreshTokenHash: sha256(replacement),
          previousRefreshTokenHash: tokenHash,
          rotatedAt: new Date(),
        },
      );
      refreshToken = replacement;
    } else if (session.refreshTokenHash === sha256(replacement)) {
      refreshToken = replacement;
    }

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
      ...(refreshToken ? { refreshToken } : {}),
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
      where: [{ refreshTokenHash: tokenHash }, { previousRefreshTokenHash: tokenHash }],
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
      requestedRole: m.requestedRole ?? null,
      roles: (m.roleGrants || [])
        .filter((g) => g.status === RoleGrantStatus.ACTIVE)
        .map((g) => g.role),
    }));

    return {
      id: user.id,
      phoneE164: user.phoneE164,
      fullName: user.fullName ?? null,
      status: user.status,
      primaryOrgId: user.primaryOrgId,
      createdAt: user.createdAt,
      verifiedIdentity: user.verifiedIdentity
        ? {
            id: user.verifiedIdentity.id,
            verificationStatus: user.verifiedIdentity.verificationStatus,
            verificationLevel: user.verifiedIdentity.verificationLevel,
            verifiedAt: user.verifiedIdentity.verifiedAt,
            documentType: user.verifiedIdentity.documentType ?? null,
            documentLast4: user.verifiedIdentity.documentLast4 ?? null,
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
