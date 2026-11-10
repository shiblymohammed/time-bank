import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { UserRole } from '@ktb/shared-types';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { ChooseWardDto, CreateWardDto, UpdateWardDto } from './dto/ward.dto';
import { NOC_MAX_BYTES } from './noc-storage';
import { WardsService } from './wards.service';

const ip = (req: Request) => req.ip ?? req.socket.remoteAddress;

@ApiTags('Wards')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id/wards')
export class WardsController {
  constructor(private readonly wards: WardsService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Active wards, for someone choosing theirs (no phone numbers)' })
  list(@Param('id', ParseUUIDPipe) organizationId: string) {
    return this.wards.listForMembers(organizationId);
  }

  @Get('manage')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Every ward with its representative, for staff' })
  manage(@Param('id', ParseUUIDPipe) organizationId: string) {
    return this.wards.listForStaff(organizationId);
  }

  @Post()
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Add a ward and its councillor or ward member' })
  create(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateWardDto,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    return this.wards.create(organizationId, actorId, dto, ip(req));
  }

  @Patch(':wardId')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Edit a ward, or switch it off' })
  update(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('wardId', ParseUUIDPipe) wardId: string,
    @Body() dto: UpdateWardDto,
    @CurrentUserId() actorId: string,
    @Req() req: Request,
  ) {
    return this.wards.update(organizationId, wardId, actorId, dto, ip(req));
  }
}

/** The member's ward and ward NOC. Applicants are not approved yet, so only sign-in is required. */
@ApiTags('Wards')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id/memberships')
export class WardNocController {
  constructor(private readonly wards: WardsService) {}

  @Put(':membershipId/ward')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Choose my ward' })
  chooseWard(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: ChooseWardDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.wards.chooseWard(organizationId, membershipId, userId, dto.wardId, ip(req));
  }

  @Post(':membershipId/noc')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: NOC_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload my signed ward NOC (JPG, PNG or PDF, up to 5 MB)' })
  uploadNoc(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.wards.uploadNoc(organizationId, membershipId, userId, file, ip(req));
  }

  @Get('documents/:documentId/file')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Open an uploaded document (the member who sent it, or staff)' })
  async file(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUserId() viewerId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.wards.readFile(organizationId, documentId, viewerId, ip(req));
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(file.bytes);
  }
}
