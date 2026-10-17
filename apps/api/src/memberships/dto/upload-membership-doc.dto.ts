import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UploadMembershipDocDto {
  @ApiProperty({
    example: 'RESIDENCE_PROOF',
    description: 'Document type (e.g. RESIDENCE_PROOF, ELECTRICITY_BILL, LOCAL_WARD_LETTER)',
  })
  @IsNotEmpty()
  @IsString()
  documentType!: string;

  @ApiProperty({
    example: 'uploads/memberships/doc-12345.pdf',
    description: 'Storage key or path where the document was saved',
  })
  @IsNotEmpty()
  @IsString()
  storageKey!: string;
}
