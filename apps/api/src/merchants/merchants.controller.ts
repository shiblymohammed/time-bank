import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { LoyaltyDecisionDto } from '../loyalty/dto/loyalty.dto';
import {
  ConsumeRedemptionDto,
  IssueRedemptionDto,
  LoyaltyCampaignDto,
  MerchantApplicationDto,
  MerchantOfferDto,
} from './dto/merchant.dto';
import { MerchantsService } from './merchants.service';

@Controller('organizations/:id/loyalty')
@UseGuards(AuthGuard, OrganizationAccessGuard)
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}
  @Post('merchant') apply(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: MerchantApplicationDto,
  ) {
    return this.merchants.apply(org, user, dto);
  }
  @Get('merchant') mine(@Param('id', ParseUUIDPipe) org: string, @CurrentUserId() user: string) {
    return this.merchants.mine(org, user);
  }
  @Get('review') review(@Param('id', ParseUUIDPipe) org: string, @CurrentUserId() user: string) {
    return this.merchants.review(org, user);
  }
  @Post('merchants/:merchantId/decide') decide(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('merchantId', ParseUUIDPipe) id: string,
    @Body() dto: LoyaltyDecisionDto,
  ) {
    return this.merchants.decideMerchant(org, user, id, dto.approve ? 'APPROVED' : 'REJECTED');
  }
  @Post('merchants/:merchantId/suspend') suspend(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('merchantId', ParseUUIDPipe) id: string,
  ) {
    return this.merchants.decideMerchant(org, user, id, 'SUSPENDED');
  }
  @Post('offers') propose(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: MerchantOfferDto,
  ) {
    return this.merchants.proposeOffer(org, user, dto);
  }
  @Get('offers') offers(@Param('id', ParseUUIDPipe) org: string, @CurrentUserId() user: string) {
    return this.merchants.offers(org, user);
  }
  @Post('offers/:offerId/decide') decideOffer(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('offerId', ParseUUIDPipe) id: string,
    @Body() dto: LoyaltyDecisionDto,
  ) {
    return this.merchants.decideOffer(org, user, id, dto.approve);
  }
  @Post('offers/:offerId/withdraw') withdraw(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('offerId', ParseUUIDPipe) id: string,
  ) {
    return this.merchants.withdraw(org, user, id);
  }
  @Post('redemptions') @Header('Cache-Control', 'no-store') issue(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: IssueRedemptionDto,
  ) {
    return this.merchants.issue(org, user, dto);
  }
  @Get('redemptions/:redemptionId') @Header('Cache-Control', 'no-store') status(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('redemptionId', ParseUUIDPipe) id: string,
  ) {
    return this.merchants.status(org, user, id);
  }
  @Post('redemptions/consume') consume(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: ConsumeRedemptionDto,
  ) {
    return this.merchants.consume(org, user, dto);
  }
  @Post('redemptions/:redemptionId/cancel') cancel(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('redemptionId', ParseUUIDPipe) id: string,
  ) {
    return this.merchants.cancel(org, user, id);
  }
  @Get('campaigns') campaigns(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
  ) {
    return this.merchants.campaigns(org, user);
  }
  @Post('campaigns') proposeCampaign(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Body() dto: LoyaltyCampaignDto,
  ) {
    return this.merchants.proposeCampaign(org, user, dto);
  }
  @Post('campaigns/:campaignId/decide') decideCampaign(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() user: string,
    @Param('campaignId', ParseUUIDPipe) id: string,
    @Body() dto: LoyaltyDecisionDto,
  ) {
    return this.merchants.decideCampaign(org, user, id, dto.approve);
  }
}
