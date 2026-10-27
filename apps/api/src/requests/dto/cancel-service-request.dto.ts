import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CancelServiceRequestDto {
  @ApiProperty({ example: 'BENEFICIARY_UNWELL', description: 'Cancellation reason code' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 50)
  reasonCode!: string;

  @ApiProperty({ example: 'Doctor appointment was moved to next week' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 500)
  notes!: string;
}
