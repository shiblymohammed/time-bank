import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DeclineVolunteerOfferDto {
  @ApiPropertyOptional({ example: 'Busy with other personal commitment' })
  @IsString()
  @IsOptional()
  declineReason?: string;
}
