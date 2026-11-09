import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ClosureEvidenceType, ClosureKind } from '@ktb/shared-types';

export class ReportClosureDto {
  @ApiProperty({ enum: ClosureKind })
  @IsEnum(ClosureKind)
  kind!: ClosureKind;

  @ApiProperty({ description: 'The member number or phone number of someone in this community' })
  @IsString()
  @Length(3, 50)
  member!: string;

  @ApiProperty({ description: 'What is known and how. Staff only.' })
  @IsString()
  @Length(10, 4000)
  reason!: string;

  @ApiPropertyOptional({ description: 'For a death' })
  @IsOptional()
  @IsDateString()
  dateOfDeath?: string;

  @ApiPropertyOptional({ enum: ClosureEvidenceType, description: 'For a death: what you saw' })
  @IsOptional()
  @IsEnum(ClosureEvidenceType)
  evidenceType?: ClosureEvidenceType;

  @ApiPropertyOptional({ description: 'For a death: last 4 characters of its number. No document is kept.' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{4}$/, { message: 'Enter the last 4 characters of the document number' })
  evidenceLast4?: string;

  @ApiPropertyOptional({ description: 'For a duplicate: the phone or member number of the account that stays' })
  @IsOptional()
  @IsString()
  @Length(3, 50)
  primaryMember?: string;

  @ApiPropertyOptional({ description: 'The same value on a retry finds the report already made' })
  @IsOptional()
  @IsString()
  @Length(8, 100)
  clientOperationId?: string;
}

export class ApproveClosureDto {
  @ApiProperty({ description: 'The reason. Staff only.' })
  @IsString()
  @Length(3, 2000)
  notes!: string;

  @ApiPropertyOptional({ description: 'For a duplicate: what the person is told when they sign in' })
  @IsOptional()
  @IsString()
  @Length(10, 1000)
  memberMessage?: string;
}

export class RecommendTransferDto {
  @ApiProperty({ description: 'The phone or member number of the account that receives the credits' })
  @IsString()
  @Length(3, 50)
  receiver!: string;

  @ApiProperty({ description: 'How the nominee was verified. Staff only.' })
  @IsString()
  @Length(3, 2000)
  notes!: string;
}

class PhoneProofDto {
  @ApiPropertyOptional({ description: 'The code sent to this member’s phone (development only)' })
  @IsOptional()
  @IsString()
  @Length(4, 10)
  code?: string;

  @ApiPropertyOptional({ description: 'A fresh Firebase phone ID token for this member’s phone' })
  @IsOptional()
  @IsString()
  @Length(20, 4096)
  idToken?: string;
}

export class SetNomineeDto extends PhoneProofDto {
  @ApiProperty()
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiProperty()
  @IsString()
  @Length(8, 20)
  phone!: string;
}

export class RemoveNomineeDto extends PhoneProofDto {}
