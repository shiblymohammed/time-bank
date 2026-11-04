import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole } from '@ktb/shared-types';
import { MerchantStatus } from '@ktb/shared-types';

import { LoyaltyService } from './loyalty.service';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { ProposeOfferDto } from './dto/propose-offer.dto';
import { ReviewOfferDto } from './dto/review-offer.dto';
import { RedeemOfferDto } from './dto/redeem-offer.dto';

import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Loyalty Coins & Merchants')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  // ─── My Coin Wallet ─────────────────────────────────────────────────────────

  @Get('loyalty/wallet')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Get my loyalty coin wallet and recent history (FR-LOY-01)' })
  @ApiResponse({ status: 200, description: 'Wallet and history returned' })
  async getMyWallet(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.loyaltyService.getMyWallet(organizationId, userId);
  }

  // ─── Merchants ──────────────────────────────────────────────────────────────

  @Get('merchants')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'List active merchants in the organization' })
  @ApiResponse({ status: 200, description: 'Merchants listed' })
  async listMerchants(@Param('id', ParseUUIDPipe) organizationId: string) {
    return this.loyaltyService.listMerchants(organizationId);
  }

  @Post('merchants')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Register a new merchant for Municipality Admin approval (FR-LOY-03)' })
  @ApiResponse({ status: 201, description: 'Merchant registered, pending approval' })
  async registerMerchant(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: RegisterMerchantDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.loyaltyService.registerMerchant(organizationId, dto, userId, ip);
  }

  @Patch('merchants/:merchantId/status')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or suspend a merchant (Municipality Admin only)' })
  @ApiResponse({ status: 200, description: 'Merchant status updated' })
  async reviewMerchant(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body('status') status: MerchantStatus.ACTIVE | MerchantStatus.SUSPENDED,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.loyaltyService.reviewMerchant(organizationId, merchantId, status, userId, ip);
  }

  // ─── Merchant Offers ────────────────────────────────────────────────────────

  @Get('loyalty/offers')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'List active loyalty offers available to members' })
  @ApiResponse({ status: 200, description: 'Active offers listed' })
  async listActiveOffers(@Param('id', ParseUUIDPipe) organizationId: string) {
    return this.loyaltyService.listActiveOffers(organizationId);
  }

  @Post('merchants/:merchantId/offers')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Propose a new offer for Municipality Admin review (FR-LOY-03, D#20)' })
  @ApiResponse({ status: 201, description: 'Offer proposed, pending review' })
  async proposeOffer(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: ProposeOfferDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.loyaltyService.proposeOffer(organizationId, merchantId, dto, userId, ip);
  }

  @Patch('loyalty/offers/:offerId/review')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or reject a merchant offer (Municipality Admin only)' })
  @ApiResponse({ status: 200, description: 'Offer reviewed' })
  async reviewOffer(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: ReviewOfferDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.loyaltyService.reviewOffer(organizationId, offerId, dto, userId, ip);
  }

  // ─── Redemption ─────────────────────────────────────────────────────────────

  @Post('loyalty/redeem')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Redeem a merchant offer with loyalty coins (FR-LOY-04, D#21)' })
  @ApiResponse({ status: 201, description: 'Offer redeemed — coins debited' })
  @ApiResponse({ status: 400, description: 'Insufficient coins or invalid offer' })
  @ApiResponse({ status: 409, description: 'Offer at capacity or already redeemed' })
  async redeemOffer(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: RedeemOfferDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.loyaltyService.redeemOffer(organizationId, userId, dto, ip);
  }

  @Get('merchants/:merchantId/redemptions')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "View a merchant's redemption volume report" })
  @ApiResponse({ status: 200, description: 'Redemption history returned' })
  async listMerchantRedemptions(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.loyaltyService.listMerchantRedemptions(organizationId, merchantId, userId);
  }
}
