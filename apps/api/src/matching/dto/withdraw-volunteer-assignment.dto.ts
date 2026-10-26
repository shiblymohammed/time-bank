import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class WithdrawVolunteerAssignmentDto {
  @ApiProperty({ example: 'Sudden transport failure' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 500)
  withdrawalReason!: string;
}
