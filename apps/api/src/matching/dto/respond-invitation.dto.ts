import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for declining a team invitation (FR-TEAM-02, D#65).
 * Accepting requires no body — the invitation ID in the URL is sufficient.
 */
export class RespondInvitationDto {
  @ApiPropertyOptional({ description: 'Reason for declining the invitation' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  declineReason?: string;
}
