import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';
import { MembershipStatus, UserRole } from '@ktb/shared-types';

export class MembershipQueryDto {
  @ApiPropertyOptional({
    enum: MembershipStatus,
    example: MembershipStatus.APPLIED,
    description:
      'Filter memberships by status (APPLIED, PENDING_REVIEW, APPROVED, REJECTED, SUSPENDED)',
  })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @ApiPropertyOptional({ enum: UserRole, description: 'Filter by active role' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Search membership number or phone' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    example: 50,
    default: 50,
    description: 'Number of records to return (max 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 0, default: 0, description: 'Offset for pagination' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
