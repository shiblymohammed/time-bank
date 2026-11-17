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
const coordinate = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
export class StartInstantHelpDto {
  @Transform(trim) @IsString() @MinLength(8) @MaxLength(100) key!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) description!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(300) locationLabel!: string;
  @Transform(coordinate) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Transform(coordinate) @IsNumber() @Min(-180) @Max(180) longitude!: number;
}
export class FinishInstantHelpDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(2000) notes!: string;
}
export class ReviewInstantHelpDto {
  @IsIn(['APPROVE', 'REJECT', 'NEEDS_INFO']) decision!: 'APPROVE' | 'REJECT' | 'NEEDS_INFO';
  @IsInt() @Min(1) version!: number;
  @IsOptional() @IsInt() @Min(1) @Max(720) minutes?: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(2000) notes!: string;
}
