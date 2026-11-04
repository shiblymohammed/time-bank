import { IsString, MaxLength, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SafetyAlertRaisedBy } from '@ktb/shared-types';

export class RaiseSafetyAlertDto {
  @ApiProperty() @IsUUID() serviceRequestId!: string;
  @ApiProperty({ enum: SafetyAlertRaisedBy }) @IsEnum(SafetyAlertRaisedBy) raisedByRole!: SafetyAlertRaisedBy;
  @ApiProperty() @IsString() @MaxLength(1000) description!: string;
}
