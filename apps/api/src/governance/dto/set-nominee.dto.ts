import { IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetNomineeDto {
  @ApiProperty() @IsString() @MaxLength(200) nomineeName!: string;
  @ApiProperty() @IsString() @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Must be a valid E.164 phone number' }) nomineePhone!: string;
}
