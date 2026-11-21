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
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
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
import { PROFILE_PHOTO_MAX_BYTES } from '../identity/profile-photo.service';
import {
  CommunityParticipationService,
  EventCheckIn,
  NewCommunityEvent,
} from './community-participation.service';

class EventListDto {
  @IsOptional() @IsIn(['upcoming', 'mine', 'staff']) view: 'upcoming' | 'mine' | 'staff' =
    'upcoming';
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000000) offset = 0;
}

/**
 * Multipart form fields always arrive as text, so numbers and the checkbox are converted here.
 * JSON requests carry real numbers and booleans and pass through unchanged.
 */
const optionalNumber = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? undefined : Number(value);
const formBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/** A cover image is at most 5 MB, and a publish form has fewer than 20 text fields. */
const eventPhotoUpload = FileInterceptor('file', {
  limits: { fileSize: PROFILE_PHOTO_MAX_BYTES, files: 1, fields: 20, fieldSize: 12000 },
});

class PublishEventDto implements NewCommunityEvent {
  @IsUUID('4') id!: string;
  @IsString() @MaxLength(120) title!: string;
  @IsString() @MaxLength(2000) description!: string;
  @IsString() @MaxLength(200) venue!: string;
  @IsISO8601({ strict: true }) @Matches(/T.+(?:Z|[+-]\d{2}:\d{2})$/) startsAt!: string;
  @IsISO8601({ strict: true }) @Matches(/T.+(?:Z|[+-]\d{2}:\d{2})$/) endsAt!: string;
  @IsOptional() @Transform(optionalNumber) @IsInt() @Min(1) @Max(10000) capacity?: number;
  @IsOptional() @Transform(formBoolean) @IsBoolean() earnsCredits?: boolean;
  @IsOptional() @Transform(optionalNumber) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Transform(optionalNumber) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(50)
  @Max(1000)
  checkInRadiusMeters?: number;
}

class ConfirmAttendanceDto {
  @IsInt() @Min(1) @Max(1440) minutes!: number;
}

class ConfirmAllAttendanceDto {
  /** Optional cap applied to everyone; each person still keeps their own lower limit. */
  @IsOptional() @IsInt() @Min(1) @Max(1440) maxMinutes?: number;
}

class CheckInDto implements EventCheckIn {
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) accuracyMeters?: number;
  /** The secret from the organiser's QR code. */
  @IsString() @Matches(/^[0-9a-f]{64}$/) code!: string;
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

  /** Accepts JSON, or multipart form data when the event has a cover image in `file`. */
  @Post('events')
  @UseInterceptors(eventPhotoUpload)
  publish(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: PublishEventDto,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    return this.participation.publishEvent(org, user, dto, file);
  }

  @Get('events/:eventId/photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async eventPhoto(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('eventId', ParseUUIDPipe) event: string,
  ) {
    return new StreamableFile(await this.participation.eventPhoto(org, user, event), {
      type: 'image/jpeg',
      // The dashboard gateway only accepts downloads marked as attachments, then serves
      // approved image types inline itself, exactly as it does for community post photos.
      disposition: 'attachment; filename="event-photo.jpg"',
    });
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

  @Get('events/:eventId/attendees')
  @Header('Cache-Control', 'private, no-store')
  attendees(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('eventId', ParseUUIDPipe) event: string,
  ) {
    return this.participation.eventAttendees(org, user, event);
  }

  /** Staff only: the QR code to show at the venue, so members can scan it to check in. */
  @Get('events/:eventId/check-in-qr')
  @Header('Cache-Control', 'private, no-store')
  checkInQr(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('eventId', ParseUUIDPipe) event: string,
  ) {
    return this.participation.checkInQr(org, user, event);
  }

  @Post('events/:eventId/check-in')
  checkIn(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('eventId', ParseUUIDPipe) event: string,
    @Body() dto: CheckInDto,
  ) {
    return this.participation.checkIn(org, user, event, dto);
  }

  @Post('events/:eventId/attendees/confirm-all')
  confirmAllAttendance(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('eventId', ParseUUIDPipe) event: string,
    @Body() dto: ConfirmAllAttendanceDto,
  ) {
    return this.participation.confirmAllAttendance(org, user, event, dto.maxMinutes);
  }

  @Post('events/:eventId/attendees/:membershipId/confirm')
  confirmAttendance(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('eventId', ParseUUIDPipe) event: string,
    @Param('membershipId', ParseUUIDPipe) membership: string,
    @Body() dto: ConfirmAttendanceDto,
  ) {
    return this.participation.confirmAttendance(org, user, event, membership, dto.minutes);
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
