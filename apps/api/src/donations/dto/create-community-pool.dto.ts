import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCommunityPoolDto {
  @ApiProperty({ example: 'Ward 4 elder care pool' })
  @Transform(trimmed)
  @IsString()
  @Length(3, 120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimmed)
  @IsString()
  @Length(1, 500)
  @IsOptional()
  description?: string;
}
