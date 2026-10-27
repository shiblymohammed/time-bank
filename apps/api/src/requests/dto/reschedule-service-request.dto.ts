import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsString, Length } from 'class-validator';

export class RescheduleServiceRequestDto {
  @ApiProperty({ example: '2026-10-22T14:30:00.000Z', description: 'New scheduled start time ISO string' })
  @IsISO8601()
  @IsNotEmpty()
  newStartTime!: string;

  @ApiProperty({ example: 'Rescheduled as beneficiary had an unexpected prior engagement' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 500)
  reason!: string;
}
