import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LoyaltyCoinWallet } from './entities/loyalty-coin-wallet.entity';
import { LoyaltyCoinLedger } from './entities/loyalty-coin-ledger.entity';
import { OrganizationMerchant } from './entities/organization-merchant.entity';
import { MerchantOffer } from './entities/merchant-offer.entity';
import { LoyaltyRedemption } from './entities/loyalty-redemption.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';

import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LoyaltyCoinWallet,
      LoyaltyCoinLedger,
      OrganizationMerchant,
      MerchantOffer,
      LoyaltyRedemption,
      OrganizationMembership,
    ]),
    AuditModule,
    AuthorizationModule,
  ],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
