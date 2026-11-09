import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { SafetyAlertAction } from '@ktb/shared-types';

export class RaiseSafetyAlertDto {
  @ApiProperty({ enum: SafetyAlertAction, description: 'Pause the visit, or end it now' })
  @IsEnum(SafetyAlertAction)
  action!: SafetyAlertAction;

  @ApiPropertyOptional({ description: 'Only staff can read this' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'The same value on a retry finds the alert already raised' })
  @IsOptional()
  @IsString()
  @Length(8, 100)
  clientOperationId?: string;
}

export class RespondToRestartDto {
  @ApiProperty({ description: 'true restarts the visit; false ends it' })
  @IsBoolean()
  restart!: boolean;
}

export class HandleSafetyAlertDto {
  @ApiProperty({ description: 'What was checked or decided. Kept with the alert.' })
  @IsString()
  @Length(3, 1000)
  notes!: string;
}
