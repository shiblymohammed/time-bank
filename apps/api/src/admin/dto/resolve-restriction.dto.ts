import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ResolveRestrictionDto {
  @ApiProperty({
    example: 'Identity document re-verified and cleared by Super Admin',
    description: 'Administrative resolution notes detailing why the restriction is removed',
  })
  @IsNotEmpty()
  @IsString()
  resolutionNotes!: string;
}
