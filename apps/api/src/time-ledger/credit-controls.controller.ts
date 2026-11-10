import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ktb/shared-types';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { CreditControlsService } from './credit-controls.service';
import {
  ChangeWalletStatusDto,
  CreditAmountDto,
  InvestigateCreditReviewDto,
  OpenCreditReviewDto,
  ResolveCreditReviewDto,
  SpendAssistanceCreditsDto,
} from './dto/credit-controls.dto';
import { WalletTransactionsQueryDto } from './dto/wallet-transactions-query.dto';

@ApiTags('Time Credit Controls')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id')
@UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
export class CreditControlsController {
  constructor(private readonly controls: CreditControlsService) {}

  @Post('requests/:requestId/credit-spending')
  @ApiOperation({
    summary: 'Voluntarily fund completed assistance using my credits or an approved pool',
  })
  spend(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() actor: string,
    @Param('requestId', ParseUUIDPipe) request: string,
    @Body() dto: SpendAssistanceCreditsDto,
  ) {
    return this.controls.spend(org, actor, request, dto);
  }

  @Post('credit-reviews')
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Hold disputed source credits pending investigation',
  })
  open(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() actor: string,
    @Body() dto: OpenCreditReviewDto,
  ) {
    return this.controls.openReview(org, actor, dto);
  }

  @Get('credit-reviews')
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  list(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() actor: string,
    @Query() query: WalletTransactionsQueryDto,
  ) {
    return this.controls.listReviews(org, actor, query.page, query.limit);
  }

  @Post('credit-reviews/:reviewId/investigation')
  @Roles(UserRole.COORDINATOR, UserRole.SUPER_ADMIN)
  investigate(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() actor: string,
    @Param('reviewId', ParseUUIDPipe) review: string,
    @Body() dto: InvestigateCreditReviewDto,
  ) {
    return this.controls.investigate(org, actor, review, dto);
  }

  @Get('credit-reviews/:reviewId/transfers')
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  transfers(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() actor: string,
    @Param('reviewId', ParseUUIDPipe) review: string,
    @Query() query: WalletTransactionsQueryDto,
  ) {
    return this.controls.downstreamTransfers(org, actor, review, query.page, query.limit);
  }

  @Get('donation-pools/:poolId/transactions')
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  poolHistory(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() actor: string,
    @Param('poolId', ParseUUIDPipe) pool: string,
    @Query() query: WalletTransactionsQueryDto,
  ) {
    return this.controls.poolHistory(org, actor, pool, query.page, query.limit);
  }

  @Post('credit-reviews/:reviewId/resolution')
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  resolve(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() actor: string,
    @Param('reviewId', ParseUUIDPipe) review: string,
    @Body() dto: ResolveCreditReviewDto,
  ) {
    return this.controls.resolve(org, actor, review, dto);
  }

  @Post('wallets/:userId/release-frozen')
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Release this organization’s held service earnings after account reinstatement',
  })
  release(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() actor: string,
    @Param('userId', ParseUUIDPipe) user: string,
    @Body() dto: CreditAmountDto,
  ) {
    return this.controls.releaseFrozen(org, actor, user, dto);
  }

  @Post('wallets/:userId/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Globally freeze or restore wallet operations with an audit reason' })
  changeStatus(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() actor: string,
    @Param('userId', ParseUUIDPipe) user: string,
    @Body() dto: ChangeWalletStatusDto,
  ) {
    return this.controls.changeWalletStatus(org, actor, user, dto);
  }

  @Get('wallets/:userId/transactions')
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Local member credit history and freeze controls' })
  walletHistory(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() actor: string,
    @Param('userId', ParseUUIDPipe) user: string,
    @Query() query: WalletTransactionsQueryDto,
  ) {
    return this.controls.walletHistory(org, actor, user, query.page, query.limit);
  }

  @Get('requests/:requestId/credit-funding')
  @ApiOperation({
    summary:
      'Verified service credit total and recorded voluntary funding (staff, or the member helped)',
  })
  fundingSummary(
    @Param('id', ParseUUIDPipe) org: string,
    @CurrentUserId() actor: string,
    @Param('requestId', ParseUUIDPipe) request: string,
  ) {
    return this.controls.fundingSummary(org, actor, request);
  }
}
