import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CreditDonation } from './entities/credit-donation.entity';
import { CommunityCreditPool } from './entities/community-credit-pool.entity';
import { DonationsService } from './donations.service';
import { DonationsController } from './donations.controller';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([CreditDonation, CommunityCreditPool]), AuthorizationModule],
  controllers: [DonationsController],
  providers: [DonationsService],
  exports: [DonationsService],
})
export class DonationsModule {}
