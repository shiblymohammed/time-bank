import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
// Multipart sends text; an empty field means "not shared".
const coordinate = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? undefined : Number(value)) : value;
export class StartInstantHelpDto {
  @Transform(trim) @IsString() @MinLength(8) @MaxLength(100) key!: string;
  // Everything below is optional so a volunteer can start with one tap.
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) locationLabel?: string;
  @IsOptional() @Transform(coordinate) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Transform(coordinate) @IsNumber() @Min(-180) @Max(180) longitude?: number;
}
export class FinishInstantHelpDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) notes?: string;
}
export class ReviewInstantHelpDto {
  @IsIn(['APPROVE', 'REJECT', 'NEEDS_INFO']) decision!: 'APPROVE' | 'REJECT' | 'NEEDS_INFO';
  @IsInt() @Min(1) version!: number;
  @IsOptional() @IsInt() @Min(1) @Max(720) minutes?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) notes?: string;
}
