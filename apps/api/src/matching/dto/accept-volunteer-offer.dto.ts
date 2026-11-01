import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AcceptVolunteerOfferDto {
  @ApiPropertyOptional({
    description: 'Client operation ID for offline retry idempotency (NFR-11)',
  })
  @IsUUID()
  @IsOptional()
  clientOperationId?: string;
}
