import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RevokeRoleDto {
  @ApiPropertyOptional({
    example: 'Volunteer requested pause on coordinator responsibilities',
    description: 'Administrative or operational reason for revoking the role',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
