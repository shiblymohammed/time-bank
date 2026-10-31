import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class AssignVolunteerZoneDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Volunteer membership ID',
  })
  @IsUUID()
  @IsNotEmpty()
  membershipId!: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Mark as primary operational zone',
  })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}
