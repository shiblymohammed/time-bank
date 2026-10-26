import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ServiceProposalStatus } from '@ktb/shared-types';

export class ReviewOrgProposalDto {
  @ApiProperty({ enum: [ServiceProposalStatus.APPROVED, ServiceProposalStatus.REJECTED] })
  @IsEnum(ServiceProposalStatus)
  @IsNotEmpty()
  status!: ServiceProposalStatus.APPROVED | ServiceProposalStatus.REJECTED;

  @ApiPropertyOptional({ example: 'Service duplicate of existing COMMUNITY_CLEANLINESS category' })
  @IsString()
  @IsOptional()
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Resulting global service definition ID if approved' })
  @IsUUID()
  @IsOptional()
  resultingGlobalServiceId?: string;
}
