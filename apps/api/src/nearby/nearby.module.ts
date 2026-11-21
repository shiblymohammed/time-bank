import { Module } from '@nestjs/common';
import { NearbyController } from './nearby.controller';
import { NearbyService } from './nearby.service';
import { NearbySessionGuard } from './nearby-session.guard';
import { NearbyRequestsService } from './nearby-requests.service';
import { NearbyRequestsController } from './nearby-requests.controller';
@Module({
  controllers: [NearbyController, NearbyRequestsController],
  providers: [NearbyService, NearbySessionGuard, NearbyRequestsService],
})
export class NearbyModule {}
