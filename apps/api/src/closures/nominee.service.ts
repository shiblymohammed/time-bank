import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AccountStatus } from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { FirebaseTokenService } from '../auth/firebase-token.service';
import { normalizeToE164 } from '../auth/utils/phone.util';
import { User } from '../identity/entities/user.entity';
import { cleanPersonName } from '../identity/person-name';
import { RemoveNomineeDto, SetNomineeDto } from './dto/closure.dto';
import { DeathNominee } from './entities/death-nominee.entity';

/**
 * Who a member names to receive their time credits after death (FR-IDENT-06, D#44, D#45). Naming or
 * changing someone needs a fresh code to the member's own phone, so a borrowed, unlocked phone is
 * not enough on its own. The nominee needs no account until the credits are passed on.
 */
@Injectable()
export class NomineeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auth: AuthService,
    private readonly firebase: FirebaseTokenService,
    private readonly auditService: AuditService,
  ) {}

  async mine(userId: string) {
    const current = await this.dataSource.manager.findOne(DeathNominee, {
      where: { userId, replacedAt: IsNull() },
    });
    return { nominee: current ? nomineeView(current) : null };
  }

  async set(userId: string, dto: SetNomineeDto, ipAddress?: string) {
    const user = await this.findUser(userId);
    const name = this.cleanName(dto.name);
    const phone = normalizeToE164(dto.phone);
    if (phone === user.phoneE164) {
      throw new BadRequestException('Name someone other than yourself');
    }
    await this.confirmOwnPhone(user, dto);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await this.lockFor(manager, userId);
      const current = await manager.findOne(DeathNominee, {
        where: { userId, replacedAt: IsNull() },
      });
      if (current?.nomineeName === name && current.nomineePhone === phone) {
        return { nominee: nomineeView(current) };
      }
      if (current) {
        current.replacedAt = new Date();
        await manager.save(DeathNominee, current);
      }
      const saved = await manager.save(
        DeathNominee,
        manager.create(DeathNominee, { userId, nomineeName: name, nomineePhone: phone }),
      );
      await this.audit(manager, 'NOMINEE_SET', userId, saved.id, ipAddress, {
        changed: Boolean(current),
      });
      return { nominee: nomineeView(saved) };
    });
  }

  async remove(userId: string, dto: RemoveNomineeDto, ipAddress?: string) {
    await this.confirmOwnPhone(await this.findUser(userId), dto);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await this.lockFor(manager, userId);
      const current = await manager.findOne(DeathNominee, {
        where: { userId, replacedAt: IsNull() },
      });
      if (current) {
        current.replacedAt = new Date();
        await manager.save(DeathNominee, current);
        await this.audit(manager, 'NOMINEE_REMOVED', userId, current.id, ipAddress, {});
      }
      return { nominee: null };
    });
  }

  /** A token issued before a restriction or closure lasts minutes, and must not change this. */
  private async findUser(userId: string): Promise<User> {
    const user = await this.dataSource.manager.findOne(User, { where: { id: userId } });
    if (!user) throw new NotFoundException('Person not found');
    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('This account is restricted');
    }
    return user;
  }

  private cleanName(raw: string): string {
    try {
      return cleanPersonName(raw);
    } catch {
      throw new BadRequestException('Enter their full name (2 to 100 letters)');
    }
  }

  /** A wrong code is a 400, not a 401: the app would treat a 401 as being signed out. */
  private async confirmOwnPhone(user: User, proof: RemoveNomineeDto): Promise<void> {
    if (proof.idToken) {
      const phone = await this.firebase.verifyPhoneToken(proof.idToken);
      if (normalizeToE164(phone) !== user.phoneE164) {
        throw new ForbiddenException('Confirm with the phone on this account');
      }
      return;
    }
    if (!proof.code) throw new BadRequestException('Confirm with a code sent to your phone');
    if (!(await this.auth.confirmOwnPhoneCode(user.phoneE164, proof.code))) {
      throw new BadRequestException('That code is not right');
    }
  }

  private lockFor(manager: EntityManager, userId: string): Promise<unknown> {
    return manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `nominee:${userId}`,
    ]);
  }

  /** Never the nominee's name or phone. */
  private async audit(
    manager: EntityManager,
    eventType: string,
    actorId: string,
    targetId: string,
    ipAddress: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.logEvent(
      {
        eventType,
        actorId,
        targetId,
        targetType: 'death_nominees',
        organizationId: null,
        payload,
        ipAddress: ipAddress ?? null,
      },
      manager,
    );
  }
}

function nomineeView(nominee: DeathNominee) {
  return {
    name: nominee.nomineeName,
    phone: nominee.nomineePhone,
    since: nominee.createdAt,
  };
}
