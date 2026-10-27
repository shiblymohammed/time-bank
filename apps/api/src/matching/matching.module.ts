import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VolunteerSkill } from './entities/volunteer-skill.entity';
import { VolunteerAvailability } from './entities/volunteer-availability.entity';
import { VolunteerAssignment } from './entities/volunteer-assignment.entity';
import { OperationalZone } from './entities/operational-zone.entity';
import { VolunteerZoneAssignment } from './entities/volunteer-zone-assignment.entity';
import { MatchingRound } from './entities/matching-round.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';

import { MatchingService } from './matching.service';
import { MatchingController } from './matching.controller';
import { MatchingConfigService } from './matching-config.service';
import { CANDIDATE_RANKING_STRATEGY } from './ranking/ranking-strategy.interface';
import { DeterministicCandidateRankingStrategy } from './ranking/deterministic-ranking.strategy';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RequestsModule } from '../requests/requests.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VolunteerSkill,
      VolunteerAvailability,
      VolunteerAssignment,
      OperationalZone,
      VolunteerZoneAssignment,
      MatchingRound,
      ServiceRequest,
      OrganizationMembership,
      GlobalAccountRestriction,
    ]),
    AuditModule,
    AuthorizationModule,
    forwardRef(() => RequestsModule),
  ],
  controllers: [MatchingController],
  providers: [
    MatchingConfigService,
    {
      provide: CANDIDATE_RANKING_STRATEGY,
      useClass: DeterministicCandidateRankingStrategy,
    },
    MatchingService,
  ],
  exports: [MatchingService, MatchingConfigService, CANDIDATE_RANKING_STRATEGY],
})
export class MatchingModule {}
