import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TimeCreditLedgerEntry } from './entities/time-credit-ledger-entry.entity';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { TimeLedgerService } from './time-ledger.service';
import { TimeLedgerController } from './time-ledger.controller';
import { CreditControlsController } from './credit-controls.controller';
import { CreditControlsService } from './credit-controls.service';

@Module({
  imports: [TypeOrmModule.forFeature([TimeCreditLedgerEntry, UniversalTimeWallet])],
  controllers: [TimeLedgerController, CreditControlsController],
  providers: [TimeLedgerService, CreditControlsService],
  exports: [TimeLedgerService],
})
export class TimeLedgerModule {}
