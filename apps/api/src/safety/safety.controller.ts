import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { HandleSafetyAlertDto, RaiseSafetyAlertDto, RespondToRestartDto } from './dto/safety.dto';
import { SafetyService } from './safety.service';

const ipOf = (req: Request) => req.ip ?? req.socket.remoteAddress;

@ApiTags('Safety alerts')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, OrganizationAccessGuard)
@Controller('organizations/:id')
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post('requests/:requestId/safety-alerts')
  // Never let a rate limit stand between someone and an alert.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Volunteer, beneficiary or caregiver raises a safety alert during a visit',
    description: 'Pauses or ends the visit. The other person is not told who raised it, or why.',
  })
  @ApiResponse({ status: 201, description: 'Alert raised; staff notified' })
  @ApiResponse({ status: 409, description: 'No visit is under way' })
  raise(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: RaiseSafetyAlertDto,
    @Req() req: Request,
  ) {
    const context = (req as any).organizationMembership;
    return this.safety.raiseAlert(orgId, requestId, context.userId, context, dto, ipOf(req));
  }

  @Post('requests/:requestId/safety-restart')
  @ApiOperation({
    summary: 'Restart a paused visit once allowed (volunteer), or end it (either person)',
  })
  @ApiResponse({ status: 201, description: 'Visit restarted or ended' })
  @ApiResponse({ status: 409, description: 'Not paused, or a coordinator has not allowed it yet' })
  respond(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: RespondToRestartDto,
    @Req() req: Request,
  ) {
    const context = (req as any).organizationMembership;
    return this.safety.respondToRestart(
      orgId,
      requestId,
      context.userId,
      context,
      dto.restart,
      ipOf(req),
    );
  }

  @Get('safety-alerts')
  @ApiOperation({ summary: 'Coordinator list of safety alerts, newest first' })
  @ApiQuery({ name: 'open', required: false, description: 'false includes closed alerts' })
  list(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Query('open') open: string | undefined,
    @Req() req: Request,
  ) {
    return this.safety.listAlerts(orgId, (req as any).organizationMembership, open !== 'false');
  }

  @Post('safety-alerts/:alertId/acknowledge')
  @ApiOperation({ summary: 'Coordinator marks an alert as being handled' })
  acknowledge(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Req() req: Request,
  ) {
    return this.safety.acknowledge(orgId, alertId, (req as any).organizationMembership, ipOf(req));
  }

  @Post('safety-alerts/:alertId/allow-restart')
  @ApiOperation({ summary: 'Coordinator allows a paused visit to restart (BR-10)' })
  allowRestart(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() dto: HandleSafetyAlertDto,
    @Req() req: Request,
  ) {
    return this.safety.allowRestart(
      orgId,
      alertId,
      (req as any).organizationMembership,
      dto.notes,
      ipOf(req),
    );
  }

  @Post('safety-alerts/:alertId/end-visit')
  @ApiOperation({ summary: 'Coordinator ends a paused visit and closes its alerts' })
  endVisit(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() dto: HandleSafetyAlertDto,
    @Req() req: Request,
  ) {
    return this.safety.endVisit(
      orgId,
      alertId,
      (req as any).organizationMembership,
      dto.notes,
      ipOf(req),
    );
  }

  @Post('safety-alerts/:alertId/close')
  @ApiOperation({ summary: 'Coordinator closes the alerts on a visit that has ended' })
  close(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() dto: HandleSafetyAlertDto,
    @Req() req: Request,
  ) {
    return this.safety.closeAlert(
      orgId,
      alertId,
      (req as any).organizationMembership,
      dto.notes,
      ipOf(req),
    );
  }
}
