import { IsEnum, IsUUID, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountClosureType } from '@ktb/shared-types';

export class RequestClosureDto {
  @ApiProperty({ enum: AccountClosureType }) @IsEnum(AccountClosureType) closureType!: AccountClosureType;
  @ApiPropertyOptional({ description: 'For DUPLICATE: the primary account UUID that should survive' })
  @IsUUID() @IsOptional() duplicatePrimaryUserId?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(500) @IsOptional() notes?: string;
}
