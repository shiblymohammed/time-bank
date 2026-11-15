import { Module } from '@nestjs/common';
import { NearbyController } from './nearby.controller';
import { NearbyService } from './nearby.service';
import { NearbySessionGuard } from './nearby-session.guard';
@Module({ controllers: [NearbyController], providers: [NearbyService, NearbySessionGuard] })
export class NearbyModule {}
