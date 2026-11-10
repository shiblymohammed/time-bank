import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { IdentityDocumentType } from '@ktb/shared-types';

export class OpenPhoneRecoveryDto {
  @ApiProperty({ description: 'The member number or current phone number of someone in this community' })
  @IsString()
  @Length(3, 50)
  member!: string;

  @ApiProperty({ description: 'The number to move the account to' })
  @IsString()
  @Length(8, 20)
  newPhone!: string;

  @ApiProperty({ enum: IdentityDocumentType, description: 'The ID document seen in person' })
  @IsEnum(IdentityDocumentType)
  documentType!: IdentityDocumentType;

  @ApiProperty({ description: 'Its number. Compared with the one on record, and never kept.' })
  @IsString()
  @Length(4, 40)
  documentNumber!: string;

  @ApiProperty({ description: 'What was checked and how. Staff only.' })
  @IsString()
  @Length(10, 4000)
  reason!: string;

  @ApiPropertyOptional({ description: 'The same value on a retry finds the case already opened' })
  @IsOptional()
  @IsString()
  @Length(8, 100)
  clientOperationId?: string;
}

export class ConfirmPhoneRecoveryDto {
  @ApiPropertyOptional({ description: 'The code sent to the new number (development only)' })
  @IsOptional()
  @IsString()
  @Length(4, 10)
  code?: string;

  @ApiPropertyOptional({ description: 'A fresh Firebase phone ID token for the new number' })
  @IsOptional()
  @IsString()
  @Length(20, 4096)
  idToken?: string;
}
