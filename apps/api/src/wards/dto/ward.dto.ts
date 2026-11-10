import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';
import { WARD_REPRESENTATIVE_TITLES, WardRepresentativeTitle } from '../entities/ward.entity';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
/** An empty optional text clears it. */
const optional = ({ value }: { value: unknown }) => {
  const text = trimmed({ value });
  return text === '' ? null : text;
};

export class CreateWardDto {
  @ApiProperty({ example: '12' })
  @Transform(trimmed)
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 /-]{0,19}$/, {
    message: 'Ward number: up to 20 letters, digits, spaces, / or -',
  })
  wardNumber!: string;

  @ApiProperty({ example: 'Puthur' })
  @Transform(trimmed)
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ enum: WARD_REPRESENTATIVE_TITLES })
  @IsIn(WARD_REPRESENTATIVE_TITLES)
  representativeTitle!: WardRepresentativeTitle;

  @ApiProperty({ example: 'Fathima K' })
  @Transform(trimmed)
  @IsString()
  @Length(2, 120)
  representativeName!: string;

  @ApiPropertyOptional({ example: '+919400000000', description: 'Shown to staff only' })
  @Transform(optional)
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\+?[0-9 ]{6,20}$/, { message: 'Enter the phone number in digits' })
  representativePhone?: string | null;

  @ApiPropertyOptional({ example: 'Ward office, near the Puthur school' })
  @Transform(optional)
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(2, 300)
  officeAddress?: string | null;
}

export class UpdateWardDto extends PartialType(CreateWardDto) {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class ChooseWardDto {
  @ApiProperty()
  @IsUUID()
  wardId!: string;
}
