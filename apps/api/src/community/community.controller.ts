import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
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
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { prepareProfilePhoto, PROFILE_PHOTO_MAX_BYTES } from '../identity/profile-photo.service';
import { CommunityService } from './community.service';

class CreateCommunityPostDto {
  @IsIn(['ANNOUNCEMENT', 'OPPORTUNITY', 'STORY', 'RECOGNITION']) postType!: string;
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
  @IsOptional() @Matches(/^[a-zA-Z0-9_-]{16,80}$/) submissionKey?: string;
}
class AnnouncementDto {
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
}
class EditCommunityPostDto {
  @IsIn(['OPPORTUNITY', 'STORY']) postType!: 'OPPORTUNITY' | 'STORY';
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
  @Matches(/^[a-zA-Z0-9_-]{16,80}$/) editKey!: string;
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsIn(['KEEP', 'REMOVE', 'REPLACE']) photoAction!: 'KEEP' | 'REMOVE' | 'REPLACE';
}
const postPhotoUpload = FileInterceptor('file', {
  limits: { fileSize: PROFILE_PHOTO_MAX_BYTES, files: 1, fields: 5, fieldSize: 12000 },
});
class FeedQueryDto {
  @IsOptional() @IsString() before?: string;
  @IsOptional() @IsIn(['ANNOUNCEMENT', 'RECOGNITION']) type?: 'ANNOUNCEMENT' | 'RECOGNITION';
}
class PhotoQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) v?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) retry?: number;
}
class ReactionDto {
  @IsIn(['SUPPORT', 'THANKS', 'INSPIRED']) reaction!: string;
}
class ReportDto {
  @IsIn(['INAPPROPRIATE', 'PRIVACY', 'MISLEADING', 'HARASSMENT', 'OTHER']) reason!: string;
  @IsOptional() @IsString() @MaxLength(500) details?: string;
}
class ReviewDto {
  @IsIn(['PUBLISHED', 'REJECTED', 'REMOVED']) status!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class SubmissionDecisionDto {
  @IsIn(['PUBLISHED', 'REJECTED']) status!: 'PUBLISHED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsInt() @Min(1) version!: number;
}
class ReportDecisionDto {
  @IsIn(['DISMISS', 'REMOVE_POST']) decision!: 'DISMISS' | 'REMOVE_POST';
  @IsString() @MinLength(1) @MaxLength(500) note!: string;
}

@ApiTags('Community')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id/community')
@UseGuards(AuthGuard, OrganizationAccessGuard)
export class CommunityController {
  constructor(private readonly community: CommunityService) {}
  @Get('feed')
  @Header('Cache-Control', 'private, no-store')
  feed(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Query() query: FeedQueryDto,
  ) {
    return this.community.feed(org, user, query.before, query.type);
  }
  @Get('announcements')
  @Header('Cache-Control', 'private, no-store')
  announcements(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Query('before') before?: string,
  ) {
    return this.community.announcements(org, user, before);
  }
  @Post('announcements')
  publishAnnouncement(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: AnnouncementDto,
  ) {
    return this.community.create(org, user, { postType: 'ANNOUNCEMENT', body: dto.body }, true);
  }
  @Delete('announcements/:postId')
  removeAnnouncement(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('postId', ParseUUIDPipe) post: string,
    @CurrentUserId() user: string,
  ) {
    return this.community.review(org, post, user, { status: 'REMOVED' }, true);
  }
  @Post('posts')
  @UseInterceptors(postPhotoUpload)
  async create(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: CreateCommunityPostDto,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    const photo = file ? await prepareProfilePhoto(file.buffer, true) : undefined;
    return this.community.create(org, user, dto, false, photo);
  }
  @Patch('posts/:postId')
  @UseInterceptors(postPhotoUpload)
  async edit(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('postId', ParseUUIDPipe) post: string,
    @CurrentUserId() user: string,
    @Body() dto: EditCommunityPostDto,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    const photo = file ? await prepareProfilePhoto(file.buffer, true) : undefined;
    return this.community.edit(org, user, post, dto, photo);
  }
  @Delete('posts/:postId')
  withdraw(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('postId', ParseUUIDPipe) post: string,
    @CurrentUserId() user: string,
  ) {
    return this.community.withdraw(org, user, post);
  }
  @Get('posts/:postId/photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async photo(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('postId', ParseUUIDPipe) post: string,
    @CurrentUserId() user: string,
    @Query() query: PhotoQueryDto,
  ) {
    return new StreamableFile(await this.community.photo(org, user, post, query.v), {
      type: 'image/jpeg',
      disposition: 'attachment; filename="community-photo.jpg"',
    });
  }
  @Get('posts/mine')
  @Header('Cache-Control', 'private, no-store')
  myPosts(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Query('before') before?: string,
  ) {
    return this.community.myPosts(org, user, before);
  }
  @Get('posts/pending')
  @Header('Cache-Control', 'private, no-store')
  pendingPosts(@Param('id', ParseUUIDPipe) org: string, @CurrentUserId() user: string) {
    return this.community.pendingPosts(org, user);
  }
  @Get('moderation') moderation(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
  ) {
    return this.community.moderation(org, user);
  }
  @Get('reports')
  @Header('Cache-Control', 'private, no-store')
  reports(@Param('id', ParseUUIDPipe) org: string, @CurrentUserId() user: string) {
    return this.community.reports(org, user);
  }
  @Post('reports/:reportId/decision')
  decideReport(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('reportId', ParseUUIDPipe) report: string,
    @CurrentUserId() user: string,
    @Body() dto: ReportDecisionDto,
  ) {
    return this.community.decideReport(org, report, user, dto);
  }
  @Post('posts/:postId/review') review(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('postId', ParseUUIDPipe) post: string,
    @CurrentUserId() user: string,
    @Body() dto: ReviewDto,
  ) {
    return this.community.review(org, post, user, dto);
  }
  @Post('posts/:postId/decision') decideSubmission(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('postId', ParseUUIDPipe) post: string,
    @CurrentUserId() user: string,
    @Body() dto: SubmissionDecisionDto,
  ) {
    return this.community.review(org, post, user, dto);
  }
  @Post('posts/:postId/reaction') react(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('postId', ParseUUIDPipe) post: string,
    @CurrentUserId() user: string,
    @Body() dto: ReactionDto,
  ) {
    return this.community.react(org, post, user, dto.reaction);
  }
  @Put('posts/:postId/reaction') setReaction(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('postId', ParseUUIDPipe) post: string,
    @CurrentUserId() user: string,
    @Body() dto: ReactionDto,
  ) {
    return this.community.react(org, post, user, dto.reaction);
  }
  @Delete('posts/:postId/reaction') removeReaction(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('postId', ParseUUIDPipe) post: string,
    @CurrentUserId() user: string,
  ) {
    return this.community.react(org, post, user, null);
  }
  @Post('posts/:postId/report') report(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('postId', ParseUUIDPipe) post: string,
    @CurrentUserId() user: string,
    @Body() dto: ReportDto,
  ) {
    return this.community.report(org, post, user, dto);
  }
}
