import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { TimeLedgerService } from './time-ledger.service';
import { WalletTransactionsQueryDto } from './dto/wallet-transactions-query.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Time Wallet')
@ApiBearerAuth('JWT-auth')
@Controller('wallet')
export class TimeLedgerController {
  constructor(private readonly timeLedgerService: TimeLedgerService) {}

  @Get('transactions')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'My time credits and their history',
    description:
      'The universal wallet balance with each credit movement, newest first, and the community it came from.',
  })
  @ApiResponse({ status: 200, description: 'Wallet balance and transactions' })
  async listMyTransactions(
    @CurrentUserId() userId: string,
    @Query() query: WalletTransactionsQueryDto,
  ) {
    return this.timeLedgerService.listMyTransactions(userId, query.page, query.limit);
  }
}
