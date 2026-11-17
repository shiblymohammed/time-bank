import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { prepareProfilePhoto, PROFILE_PHOTO_MAX_BYTES } from '../identity/profile-photo.service';
import { InstantHelpService } from './instant-help.service';
import {
  StartInstantHelpDto,
  FinishInstantHelpDto,
  ReviewInstantHelpDto,
} from './instant-help.dto';
@ApiTags('Instant help')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:orgId/instant-help')
@UseGuards(AuthGuard, OrganizationAccessGuard)
export class InstantHelpController {
  constructor(private readonly service: InstantHelpService) {}
  @Header('Cache-Control', 'private, no-store') @Get('mine') mine(
    @Param('orgId', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
  ) {
    return this.service.mine(org, user);
  }
  @Header('Cache-Control', 'private, no-store') @Get('reviews') reviews(
    @Param('orgId', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Query('status') status?: string,
  ) {
    return this.service.reviews(org, user, status);
  }
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photo', maxCount: 1 },
        { name: 'voice', maxCount: 1 },
      ],
      { limits: { files: 2, fields: 5, fieldSize: 1024, fileSize: PROFILE_PHOTO_MAX_BYTES } },
    ),
  )
  async start(
    @Param('orgId', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: StartInstantHelpDto,
    @UploadedFiles() files?: { photo?: { buffer: Buffer }[]; voice?: { buffer: Buffer }[] },
  ) {
    const photo = files?.photo?.[0]?.buffer;
    const voice = files?.voice?.[0]?.buffer;
    return this.service.start(org, user, dto, {
      ...(photo ? { photo: await prepareProfilePhoto(photo, true) } : {}),
      ...(voice ? { voice } : {}),
    });
  }

  @Get(':sessionId/voice')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async voice(
    @Param('orgId', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('sessionId', ParseUUIDPipe) id: string,
  ) {
    return new StreamableFile(await this.service.voice(org, user, id), {
      type: 'audio/wav',
      disposition: 'attachment; filename="instant-help.wav"',
    });
  }
  @Header('Cache-Control', 'private, no-store') @Get(':sessionId') detail(
    @Param('orgId', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('sessionId', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(org, user, id);
  }
  @Post(':sessionId/stop')
  stop(
    @Param('orgId', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('sessionId', ParseUUIDPipe) id: string,
  ) {
    return this.service.stop(org, user, id);
  }
  @Post(':sessionId/finish') finish(
    @Param('orgId', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @Body() dto: FinishInstantHelpDto,
  ) {
    return this.service.finish(org, user, id, dto);
  }
  @Post(':sessionId/resubmit') resubmit(
    @Param('orgId', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @Body() dto: FinishInstantHelpDto,
  ) {
    return this.service.resubmit(org, user, id, dto);
  }
  @Post(':sessionId/review') review(
    @Param('orgId', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @Body() dto: ReviewInstantHelpDto,
  ) {
    return this.service.review(org, user, id, dto);
  }
  @Post(':sessionId/photos')
  @UseInterceptors(
    FileInterceptor('file', { limits: { files: 1, fileSize: PROFILE_PHOTO_MAX_BYTES, fields: 0 } }),
  )
  async upload(
    @Param('orgId', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    if (!file) throw new BadRequestException('Choose a photo');
    return this.service.addPhoto(org, user, id, await prepareProfilePhoto(file.buffer, true));
  }
  @Header('Cache-Control', 'private, no-store')
  @Get(':sessionId/photos/:photoId')
  @Header('X-Content-Type-Options', 'nosniff')
  async photo(
    @Param('orgId', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photo: string,
  ) {
    return new StreamableFile(await this.service.photo(org, user, id, photo), {
      type: 'image/jpeg',
      disposition: 'attachment; filename="instant-help.jpg"',
    });
  }
}
