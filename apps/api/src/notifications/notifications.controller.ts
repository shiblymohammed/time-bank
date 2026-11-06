import { Body, Controller, Delete, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { RegisterPushDeviceDto, RemovePushDeviceDto } from './dto/push-device.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('notifications/devices')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register this phone for push messages' })
  async register(@Body() dto: RegisterPushDeviceDto, @CurrentUserId() userId: string) {
    await this.notifications.registerDevice(userId, dto.token, dto.platform);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop push messages to this phone, used when signing out' })
  async remove(@Body() dto: RemovePushDeviceDto, @CurrentUserId() userId: string) {
    await this.notifications.removeDevice(userId, dto.token);
  }
}
