import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { CommunityVisibilityService } from './community-visibility.service';

class VisibilityDto {
  @ValidateIf((value: VisibilityDto) => value.displayName !== null)
  @IsString()
  @MaxLength(60)
  displayName!: string | null;
  @IsBoolean() sharePhoto!: boolean;
  @ValidateIf((value: VisibilityDto) => value.sharePhoto) @IsUUID() photoVersion?: string;
}

@Controller('organizations/:id/community')
@UseGuards(AuthGuard, OrganizationAccessGuard)
export class CommunityVisibilityController {
  constructor(private readonly visibility: CommunityVisibilityService) {}

  @Get('visibility')
  @Header('Cache-Control', 'private, no-store')
  settings(@Param('id', ParseUUIDPipe) org: string, @CurrentUserId() user: string) {
    return this.visibility.settings(org, user);
  }

  @Put('visibility')
  @Header('Cache-Control', 'private, no-store')
  update(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: VisibilityDto,
  ) {
    return this.visibility.update(org, user, dto);
  }

  @Get('posts/:postId/author-photo/:version')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async photo(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('postId', ParseUUIDPipe) post: string,
    @Param('version', ParseUUIDPipe) version: string,
  ) {
    return new StreamableFile(await this.visibility.photo(org, user, post, version), {
      type: 'image/jpeg',
    });
  }
}
