import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole } from '@ktb/shared-types';

import { DonationsService } from './donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { CreateCommunityPoolDto } from './dto/create-community-pool.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Time Credit Donations')
@ApiBearerAuth('JWT-auth')
@Controller()
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  @Post('organizations/:id/donations')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({
    summary: 'Give time credits to a verified member or a community pool',
    description:
      'Credits leave the caller’s universal wallet. The organization in the path is recorded as the origin (ITB-009). A retry with the same idempotencyKey gives only once.',
  })
  @ApiResponse({ status: 201, description: 'Credits given' })
  @ApiResponse({ status: 403, description: 'The caller’s wallet is frozen' })
  @ApiResponse({ status: 404, description: 'No verified member or open pool matches' })
  @ApiResponse({ status: 409, description: 'Not enough credits, or the key was reused' })
  async donate(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateDonationDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.donationsService.donate(organizationId, userId, dto, ip);
  }

  @Get('donation-pools')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Approved community pools of every participating organization' })
  @ApiResponse({ status: 200, description: 'Open pools with their organization and balance' })
  async listPools() {
    return this.donationsService.listPools();
  }

  @Post('organizations/:id/donation-pools')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve a community pool for this organization (D#19)' })
  @ApiResponse({ status: 201, description: 'Pool created' })
  @ApiResponse({ status: 409, description: 'A pool with that name already exists' })
  async createPool(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateCommunityPoolDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.donationsService.createPool(organizationId, userId, dto, ip);
  }
}
