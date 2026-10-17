import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { UserRole } from '@ktb/shared-types';

export class GrantOrgRoleDto {
  @ApiProperty({
    description: 'Target global user ID to receive the organization role',
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @IsNotEmpty()
  @IsUUID()
  userId!: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.MUNICIPALITY_ADMIN,
    description: 'Administrative or operational role to assign within the organization',
  })
  @IsNotEmpty()
  @IsEnum(UserRole)
  role!: UserRole;
}
