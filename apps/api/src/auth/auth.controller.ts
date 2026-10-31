import { Controller, Post, Get, Body, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthGuard } from './guards/auth.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Authentication & Identity')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request mobile OTP verification code',
    description:
      'Dispatches a 6-digit verification code to the given E.164 phone number. Rate-limited to 1 request per 60 seconds.',
  })
  @ApiResponse({ status: 200, description: 'OTP challenge generated and dispatched' })
  @ApiResponse({ status: 429, description: 'Cooldown period active; please wait' })
  async requestOtp(@Body() dto: RequestOtpDto, @Req() req: Request) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.authService.requestOtp(dto, ip);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify mobile OTP code and authenticate',
    description:
      'Validates OTP. If first-time user, atomically provisions global identity and universal wallet. Returns JWT access token & 30-day refresh token.',
  })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP challenge' })
  @ApiResponse({ status: 401, description: 'Incorrect verification code' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.authService.verifyOtp(dto, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh expired access token',
    description: 'Validates active refresh token and returns a new 15-minute access token.',
  })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid or revoked refresh token' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.authService.refreshToken(dto, ip);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out and revoke refresh token session',
    description: 'Revokes the active refresh token session in the database.',
  })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  async logout(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ip = req.ip ?? req.socket.remoteAddress;
    // Extract optional user id from request if user is authenticated
    const userId = (req as any).user?.id ?? (req as any).userId;
    return this.authService.logout(dto, userId, ip);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user profile, wallet balance, and memberships',
    description:
      'Returns the authenticated user global identity, KYC verification status, universal time wallet balance, and list of organization memberships with roles.',
  })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUserId() userId: string) {
    return this.authService.getMe(userId);
  }
}
