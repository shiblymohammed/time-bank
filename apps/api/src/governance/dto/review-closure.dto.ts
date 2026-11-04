import { IsEnum, IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountClosureStatus } from '@ktb/shared-types';

export class ReviewClosureDto {
  @ApiProperty({ enum: [AccountClosureStatus.APPROVED, AccountClosureStatus.REJECTED] })
  @IsEnum([AccountClosureStatus.APPROVED, AccountClosureStatus.REJECTED])
  status!: AccountClosureStatus.APPROVED | AccountClosureStatus.REJECTED;

  @ApiPropertyOptional() @IsString() @MaxLength(500) @IsOptional() rejectionReason?: string;
}
