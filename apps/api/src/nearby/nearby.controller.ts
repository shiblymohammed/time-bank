import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthGuard, AuthenticatedUserPayload } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { NearbyAvailabilityDto, NearbyAreaVisibilityDto } from './nearby.dto';
import { NearbyService } from './nearby.service';
import { NearbySessionGuard } from './nearby-session.guard';

@ApiTags('Nearby')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id/community')
@UseGuards(AuthGuard, NearbySessionGuard, OrganizationAccessGuard)
export class NearbyController {
  constructor(private readonly nearby: NearbyService) {}
  @Get('nearby')
  @ApiOperation({ summary: 'Coarse community-area activity and my expiring availability' })
  snapshot(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set('Cache-Control', 'private, no-store');
    return this.nearby.snapshot(org, user);
  }
  @Put('availability')
  available(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: NearbyAvailabilityDto,
    @Req() request: Request & { user?: AuthenticatedUserPayload },
  ) {
    return this.nearby.available(org, user, request.user?.sessionId, dto);
  }
  @Delete('availability')
  stop(@Param('id', ParseUUIDPipe) org: string, @CurrentUserId() user: string) {
    return this.nearby.stop(org, user);
  }
  @Put('nearby/areas/:areaId')
  publish(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('areaId', ParseUUIDPipe) area: string,
    @CurrentUserId() user: string,
    @Body() dto: NearbyAreaVisibilityDto,
  ) {
    return this.nearby.publish(org, user, area, dto.visible);
  }
}
