import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserRole } from '@ktb/shared-types';

export class GrantRoleDto {
  @ApiProperty({
    enum: UserRole,
    example: UserRole.COORDINATOR,
    description: 'Operational role to assign to the approved member',
  })
  @IsNotEmpty()
  @IsEnum(UserRole)
  role!: UserRole;
}
