import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceRequestStatus, UrgencyType } from '@ktb/shared-types';

export class RequestQueryDto {
  @ApiPropertyOptional({ enum: ServiceRequestStatus })
  @IsEnum(ServiceRequestStatus)
  @IsOptional()
  status?: ServiceRequestStatus;

  @ApiPropertyOptional({ enum: UrgencyType })
  @IsEnum(UrgencyType)
  @IsOptional()
  urgency?: UrgencyType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  beneficiaryMembershipId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ward?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
