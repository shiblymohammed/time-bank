import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '@ktb/shared-types';

export class ApproveMembershipDto {
  @ApiPropertyOptional({
    enum: UserRole,
    example: UserRole.VOLUNTEER,
    default: UserRole.VOLUNTEER,
    description: 'Initial approved operational role granted upon admission',
  })
  @IsOptional()
  @IsEnum(UserRole)
  initialRole?: UserRole;

  @ApiPropertyOptional({
    example: 'Aadhaar residence verified by Ward Coordinator',
    description: 'Coordinator notes on approval decision',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
