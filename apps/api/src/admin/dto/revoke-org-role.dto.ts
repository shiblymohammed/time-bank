import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RevokeOrgRoleDto {
  @ApiPropertyOptional({
    example: 'Transferred out of coordinator office',
    description: 'Administrative reason for revoking the role grant',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
