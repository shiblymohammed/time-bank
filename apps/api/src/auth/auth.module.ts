import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtpChallenge } from './entities/otp-challenge.entity';
import { AuthenticationSession } from './entities/authentication-session.entity';
import { AuthGuard } from './guards/auth.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([OtpChallenge, AuthenticationSession]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_TOKEN_EXPIRY') ?? '15m') as any,
        },
      }),
    }),
  ],
  providers: [AuthGuard],
  exports: [JwtModule, AuthGuard],
})
export class AuthModule {}
