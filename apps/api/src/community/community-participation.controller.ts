import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import {
  CommunityParticipationService,
  NewCommunityEvent,
} from './community-participation.service';

class EventListDto {
  @IsOptional() @IsIn(['upcoming', 'mine', 'staff']) view: 'upcoming' | 'mine' | 'staff' =
    'upcoming';
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000000) offset = 0;
}

class PublishEventDto implements NewCommunityEvent {
  @IsUUID('4') id!: string;
  @IsString() @MaxLength(120) title!: string;
  @IsString() @MaxLength(2000) description!: string;
  @IsString() @MaxLength(200) venue!: string;
  @IsISO8601({ strict: true }) @Matches(/T.+(?:Z|[+-]\d{2}:\d{2})$/) startsAt!: string;
  @IsISO8601({ strict: true }) @Matches(/T.+(?:Z|[+-]\d{2}:\d{2})$/) endsAt!: string;
  @IsOptional() @IsInt() @Min(1) @Max(10000) capacity?: number;
}

class CancelEventDto {
  @IsString() @MaxLength(500) reason!: string;
}

@ApiTags('Community')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id/community')
@UseGuards(AuthGuard, OrganizationAccessGuard)
export class CommunityParticipationController {
  constructor(private readonly participation: CommunityParticipationService) {}

  @Get('blocks')
  @Header('Cache-Control', 'private, no-store')
  blocks(@Param('id', ParseUUIDPipe) org: string, @CurrentUserId() user: string) {
    return this.participation.blocks(org, user);
  }

  @Put('blocks/:memberId')
  block(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('memberId', ParseUUIDPipe) member: string,
  ) {
    return this.participation.setBlock(org, user, member, true);
  }

  @Delete('blocks/:memberId')
  unblock(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('memberId', ParseUUIDPipe) member: string,
  ) {
    return this.participation.setBlock(org, user, member, false);
  }

  @Get('events')
  @Header('Cache-Control', 'private, no-store')
  events(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Query() query: EventListDto,
  ) {
    return this.participation.events(org, user, query.view, query.offset);
  }

  @Post('events')
  publish(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: PublishEventDto,
  ) {
    return this.participation.publishEvent(org, user, dto);
  }

  @Post('events/:eventId/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('eventId', ParseUUIDPipe) event: string,
    @Body() dto: CancelEventDto,
  ) {
    return this.participation.cancelEvent(org, user, event, dto.reason);
  }

  @Put('events/:eventId/attendance')
  join(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('eventId', ParseUUIDPipe) event: string,
  ) {
    return this.participation.attendance(org, user, event, true);
  }

  @Delete('events/:eventId/attendance')
  withdraw(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('eventId', ParseUUIDPipe) event: string,
  ) {
    return this.participation.attendance(org, user, event, false);
  }

  @Put('achievements/:awardId/share')
  share(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('awardId', ParseUUIDPipe) award: string,
  ) {
    return this.participation.shareAchievement(org, user, award, true);
  }

  @Delete('achievements/:awardId/share')
  unshare(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('awardId', ParseUUIDPipe) award: string,
  ) {
    return this.participation.shareAchievement(org, user, award, false);
  }
}
