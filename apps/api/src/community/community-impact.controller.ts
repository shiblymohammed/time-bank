import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { CommunityImpactService } from './community-impact.service';

const MONTH = /^20\d{2}-(?:0[1-9]|1[0-2])$/;

class ImpactQuery {
  @IsOptional() @Matches(MONTH) month?: string;
}

class ImpactGoal {
  @Matches(MONTH) month!: string;
  @IsInt() @Min(1) @Max(1000000) targetHours!: number;
}

@Controller('organizations/:id/community/impact')
@UseGuards(AuthGuard, OrganizationAccessGuard)
export class CommunityImpactController {
  constructor(private readonly impact: CommunityImpactService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  read(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Query() query: ImpactQuery,
  ) {
    return this.impact.read(org, user, query.month);
  }

  @Put('goal')
  save(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() goal: ImpactGoal,
  ) {
    return this.impact.saveGoal(org, user, goal.month, goal.targetHours);
  }
}
