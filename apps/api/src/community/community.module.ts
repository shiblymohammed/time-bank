import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityImpactController } from './community-impact.controller';
import { CommunityImpactService } from './community-impact.service';
import { CommunityParticipationController } from './community-participation.controller';
import { CommunityParticipationService } from './community-participation.service';
import { CommunityService } from './community.service';
import { CommunityVisibilityController } from './community-visibility.controller';
import { CommunityVisibilityService } from './community-visibility.service';

@Module({
  controllers: [
    CommunityController,
    CommunityImpactController,
    CommunityParticipationController,
    CommunityVisibilityController,
  ],
  providers: [
    CommunityService,
    CommunityImpactService,
    CommunityParticipationService,
    CommunityVisibilityService,
  ],
})
export class CommunityModule {}
