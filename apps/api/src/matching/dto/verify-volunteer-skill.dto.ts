import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { SkillVerificationStatus } from '@ktb/shared-types';

export class VerifyVolunteerSkillDto {
  @ApiProperty({ description: 'Organization membership UUID of volunteer' })
  @IsUUID()
  @IsNotEmpty()
  membershipId!: string;

  @ApiProperty({ example: 'FIRST_AID' })
  @IsString()
  @IsNotEmpty()
  skillCode!: string;

  @ApiProperty({ enum: SkillVerificationStatus, default: SkillVerificationStatus.VERIFIED })
  @IsEnum(SkillVerificationStatus)
  @IsNotEmpty()
  status!: SkillVerificationStatus;

  @ApiPropertyOptional({ example: 'Red Cross certified training verified' })
  @IsString()
  @IsOptional()
  verificationNotes?: string;

  @ApiPropertyOptional({ description: 'Optional verification document UUID' })
  @IsUUID()
  @IsOptional()
  documentId?: string;
}
