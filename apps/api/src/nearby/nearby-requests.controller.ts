import { Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { NearbySessionGuard } from './nearby-session.guard';
import { NearbyRequestsQueryDto } from './nearby.dto';
import { NearbyRequestsService } from './nearby-requests.service';

@Controller('organizations/:id/community/nearby/requests')
@UseGuards(AuthGuard, NearbySessionGuard, OrganizationAccessGuard)
export class NearbyRequestsController {
  constructor(private readonly feed: NearbyRequestsService) {}
  @Get()
  list(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Query() query: NearbyRequestsQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set('Cache-Control', 'private, no-store');
    return this.feed.list(org, user, query);
  }
  @Get(':token/photo')
  async photo(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('token') token: string,
    @CurrentUserId() user: string,
    @Res() response: Response,
  ) {
    return this.send(response, await this.feed.image(org, user, token, 'request'));
  }
  @Get(':token/member-photo')
  async memberPhoto(
    @Param('id', ParseUUIDPipe) org: string,
    @Param('token') token: string,
    @CurrentUserId() user: string,
    @Res() response: Response,
  ) {
    return this.send(response, await this.feed.image(org, user, token, 'member'));
  }
  private send(response: Response, bytes: Buffer) {
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': 'image/jpeg',
      'X-Content-Type-Options': 'nosniff',
    });
    return response.send(bytes);
  }
}
