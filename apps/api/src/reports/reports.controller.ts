import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ktb/shared-types';
import { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { EvaluatedMembershipContext } from '../authorization/authorization.service';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { Roles } from '../authorization/decorators/roles.decorator';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import {
  GenerateSponsorReportDto,
  ReportDownloadQueryDto,
  ReportPeriodQueryDto,
  SponsorDownloadQueryDto,
} from './dto/report.dto';
import { ReportFile } from './report-files';
import { ReportsService } from './reports.service';

const ipOf = (req: Request) => req.ip ?? req.socket.remoteAddress;
const contextOf = (req: Request): EvaluatedMembershipContext => (req as any).organizationMembership;
const asFile = (file: ReportFile) =>
  new StreamableFile(file.bytes, {
    type: file.contentType,
    disposition: `attachment; filename="${file.fileName}"`,
    length: file.bytes.length,
  });

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, OrganizationAccessGuard)
@Controller('organizations/:id/reports')
export class CommunityReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: "A community's figures for a month or date range" })
  read(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Query() query: ReportPeriodQueryDto,
    @Req() req: Request,
  ) {
    return this.reports.staffReport(orgId, contextOf(req), query);
  }

  @Get('download')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'The same figures as a PDF, Excel or CSV file' })
  async download(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Query() query: ReportDownloadQueryDto,
    @Req() req: Request,
  ) {
    return asFile(await this.reports.staffDownload(orgId, contextOf(req), query, ipOf(req)));
  }

  @Get('sponsor')
  @ApiOperation({ summary: 'Saved sponsor reports, newest first' })
  sponsorReports(@Param('id', ParseUUIDPipe) orgId: string, @Req() req: Request) {
    return this.reports.listSponsorReports(orgId, contextOf(req));
  }

  @Post('sponsor')
  @ApiOperation({ summary: 'Save a new version of a finished month' })
  generate(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Body() dto: GenerateSponsorReportDto,
    @Req() req: Request,
  ) {
    return this.reports.generateSponsorReport(orgId, contextOf(req), dto, ipOf(req));
  }

  @Get('sponsor/:reportId/download')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A saved sponsor report as a PDF or CSV file' })
  async sponsorDownload(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Query() query: SponsorDownloadQueryDto,
    @Req() req: Request,
  ) {
    return asFile(
      await this.reports.sponsorDownload(orgId, reportId, contextOf(req), query.format, ipOf(req)),
    );
  }
}

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/reports')
export class CentralReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'A summary across all communities' })
  read(@Query() query: ReportPeriodQueryDto) {
    return this.reports.summary(query);
  }

  @Get('download')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'The summary as a PDF, Excel or CSV file' })
  async download(
    @Query() query: ReportDownloadQueryDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return asFile(await this.reports.summaryDownload(userId, query, ipOf(req)));
  }
}
