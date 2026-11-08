import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { UserRole } from '@ktb/shared-types';
import { AuthGuard, AuthenticatedUserPayload as AuthenticatedUser } from './guards/auth.guard';
import { StaffCodeService } from './staff-code.service';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';

class VerifyStaffCodeDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

class SetStaffEmailDto {
  /** null or empty clears the address. */
  @IsOptional()
  @ValidateIf((dto: SetStaffEmailDto) => Boolean(dto.email))
  @IsEmail()
  @MaxLength(254)
  email?: string | null;
}

const codeLimit = { default: { limit: 10, ttl: 60_000 } };

type AuthedRequest = Request & { user?: AuthenticatedUser };

@ApiTags('Authentication & Identity')
@ApiBearerAuth('JWT-auth')
@Controller()
export class StaffCodeController {
  constructor(private readonly staffCodes: StaffCodeService) {}

  @Get('auth/staff-code')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Whether this sign-in still needs the staff email code' })
  status(@Req() req: AuthedRequest) {
    return this.staffCodes.status(req.user!.id, req.user!.sessionId);
  }

  @Post('auth/staff-code/request')
  @UseGuards(AuthGuard)
  @Throttle(codeLimit)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email a 6-digit staff sign-in code to the address on file' })
  request(@Req() req: AuthedRequest) {
    return this.staffCodes.request(req.user!.id, req.user!.sessionId, req.ip);
  }

  @Post('auth/staff-code/verify')
  @UseGuards(AuthGuard)
  @Throttle(codeLimit)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check the emailed staff code and unlock staff powers for this sign-in' })
  verify(@Req() req: AuthedRequest, @Body() dto: VerifyStaffCodeDto) {
    return this.staffCodes.verify(req.user!.id, req.user!.sessionId, dto.code, req.ip);
  }

  @Put('admin/users/:userId/email')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Set or clear the email a person uses for staff sign-in codes' })
  setEmail(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetStaffEmailDto,
  ) {
    return this.staffCodes.setEmail(req.user!.id, userId, dto.email ?? null, req.ip);
  }
}
