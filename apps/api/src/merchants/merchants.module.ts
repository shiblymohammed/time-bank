import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
@Module({
  imports: [AuthorizationModule, LoyaltyModule],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
