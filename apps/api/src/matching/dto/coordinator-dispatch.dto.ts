import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CoordinatorDispatchDto {
  @ApiProperty({ description: 'Organization membership UUID of volunteer to dispatch' })
  @IsUUID()
  @IsNotEmpty()
  volunteerMembershipId!: string;

  @ApiPropertyOptional({ example: 'Confirmed availability via direct telephone call' })
  @IsString()
  @IsOptional()
  dispatchNotes?: string;
}
