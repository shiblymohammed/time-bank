import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class DisputeServiceCompletionDto {
  @ApiProperty({ example: 'The volunteer did not come' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 500)
  reason!: string;
}
