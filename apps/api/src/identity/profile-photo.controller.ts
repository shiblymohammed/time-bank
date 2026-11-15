import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { PROFILE_PHOTO_MAX_BYTES, ProfilePhotoService } from './profile-photo.service';

@ApiTags('People')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard)
@Controller('auth/me/photo')
export class ProfilePhotoController {
  constructor(private readonly photos: ProfilePhotoService) {}

  @Put()
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: PROFILE_PHOTO_MAX_BYTES, files: 1, fields: 0 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Add or replace my optional profile photo (JPG, PNG or WebP, up to 5 MB)',
  })
  upload(
    @CurrentUserId() userId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Req() request: Request,
  ) {
    return this.photos.upload(userId, file, request.ip);
  }

  @Get()
  @ApiOperation({ summary: 'Read my private profile photo' })
  async read(@CurrentUserId() userId: string, @Res({ passthrough: true }) response: Response) {
    const bytes = await this.photos.read(userId);
    response.set({
      'Content-Type': 'image/jpeg',
      'Content-Disposition': 'inline; filename="profile-photo.jpg"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(bytes);
  }

  @Delete()
  @ApiOperation({ summary: 'Remove my optional profile photo' })
  remove(@CurrentUserId() userId: string, @Req() request: Request) {
    return this.photos.remove(userId, request.ip);
  }
}
