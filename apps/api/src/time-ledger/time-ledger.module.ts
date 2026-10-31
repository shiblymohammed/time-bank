import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TimeCreditLedgerEntry } from './entities/time-credit-ledger-entry.entity';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { TimeLedgerService } from './time-ledger.service';
import { TimeLedgerController } from './time-ledger.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TimeCreditLedgerEntry, UniversalTimeWallet])],
  controllers: [TimeLedgerController],
  providers: [TimeLedgerService],
  exports: [TimeLedgerService],
})
export class TimeLedgerModule {}
