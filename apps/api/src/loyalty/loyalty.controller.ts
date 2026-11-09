import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { UserRole } from '@ktb/shared-types';
import { LoyaltyService } from './loyalty.service';
import {
  EngagementAwardDto,
  LoyaltyDecisionDto,
  LoyaltyPolicyDto,
  LoyaltyPreferenceDto,
  LoyaltyProgramDto,
} from './dto/loyalty.dto';

@Controller('organizations/:id/loyalty')
@UseGuards(AuthGuard, OrganizationAccessGuard)
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}
  @Get('settings') settings(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
  ) {
    return this.loyalty.settings(org, user);
  }
  @Post('settings') program(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: LoyaltyProgramDto,
  ) {
    return this.loyalty.setProgram(org, user, dto);
  }
  @Get('wallet') @Header('Cache-Control', 'no-store') wallet(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
  ) {
    return this.loyalty.wallet(org, user);
  }
  @Post('wallet/refresh') refresh(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
  ) {
    return this.loyalty.refresh(org, user);
  }
  @Post('visibility') preference(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: LoyaltyPreferenceDto,
  ) {
    return this.loyalty.preference(org, user, dto);
  }
  @Get('leaderboard') leaderboard(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
  ) {
    return this.loyalty.leaderboard(org, user);
  }
  @Get('engagement') engagement(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
  ) {
    return this.loyalty.engagement(org, user);
  }
  @Post('engagement') propose(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: EngagementAwardDto,
  ) {
    return this.loyalty.proposeEngagement(org, user, dto);
  }
  @Post('engagement/:awardId/decide') decide(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('awardId', ParseUUIDPipe) award: string,
    @Body() dto: LoyaltyDecisionDto,
  ) {
    return this.loyalty.decideEngagement(org, user, award, dto.approve);
  }
  @Get('achievements/:entryId/certificate')
  @Header('Cache-Control', 'no-store')
  async certificate(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('entryId', ParseUUIDPipe) entry: string,
  ) {
    const file = await this.loyalty.certificate(org, user, entry);
    return new StreamableFile(file.bytes, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.bytes.length,
    });
  }
}

@Controller('admin/loyalty')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class CentralLoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}
  @Get('policies') policies(@CurrentUserId() user: string) {
    return this.loyalty.policies(user);
  }
  @Post('policies') policy(@CurrentUserId() user: string, @Body() dto: LoyaltyPolicyDto) {
    return this.loyalty.setPolicy(user, dto);
  }
}
