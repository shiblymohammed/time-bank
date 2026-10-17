import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    requestOtp: jest.fn().mockResolvedValue({
      success: true,
      message: 'OTP sent',
      expiresInSeconds: 600,
    }),
    verifyOtp: jest.fn().mockResolvedValue({
      accessToken: 'jwt-access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
      user: { id: 'u-1', phoneE164: '+919876543210' },
    }),
    refreshToken: jest.fn().mockResolvedValue({
      accessToken: 'new-jwt-access-token',
      expiresIn: 900,
    }),
    logout: jest.fn().mockResolvedValue({
      success: true,
      message: 'Logged out',
    }),
    getMe: jest.fn().mockResolvedValue({
      id: 'u-1',
      phoneE164: '+919876543210',
      memberships: [],
    }),
  };

  const mockReq = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    user: { id: 'u-1' },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: AuthGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call requestOtp', async () => {
    const dto = { phone: '+919876543210' };
    const res = await controller.requestOtp(dto, mockReq);

    expect(mockAuthService.requestOtp).toHaveBeenCalledWith(dto, '127.0.0.1');
    expect(res.success).toBe(true);
  });

  it('should call verifyOtp', async () => {
    const dto = { phone: '+919876543210', code: '123456' };
    const res = await controller.verifyOtp(dto, mockReq);

    expect(mockAuthService.verifyOtp).toHaveBeenCalledWith(dto, '127.0.0.1');
    expect(res.accessToken).toBe('jwt-access-token');
  });

  it('should call refresh', async () => {
    const dto = { refreshToken: 'valid-refresh-token' };
    const res = await controller.refresh(dto, mockReq);

    expect(mockAuthService.refreshToken).toHaveBeenCalledWith(dto, '127.0.0.1');
    expect(res.accessToken).toBe('new-jwt-access-token');
  });

  it('should call logout', async () => {
    const dto = { refreshToken: 'valid-refresh-token' };
    const res = await controller.logout(dto, mockReq);

    expect(mockAuthService.logout).toHaveBeenCalledWith(dto, 'u-1', '127.0.0.1');
    expect(res.success).toBe(true);
  });

  it('should call getMe', async () => {
    const res = await controller.getMe('u-1');

    expect(mockAuthService.getMe).toHaveBeenCalledWith('u-1');
    expect(res.id).toBe('u-1');
  });
});
