import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CreditDonation } from './entities/credit-donation.entity';
import { CommunityCreditPool } from './entities/community-credit-pool.entity';
import { DonationsService } from './donations.service';
import { DonationsController } from './donations.controller';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([CreditDonation, CommunityCreditPool]), AuthorizationModule, AuthModule],
  controllers: [DonationsController],
  providers: [DonationsService],
  exports: [DonationsService],
})
export class DonationsModule {}
