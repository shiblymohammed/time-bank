import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@ktb/shared-types';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EvaluatedMembershipContext } from '../authorization/authorization.service';
import {
  GenerateSponsorReportDto,
  ReportDownloadQueryDto,
  ReportPeriodQueryDto,
} from './dto/report.dto';
import { SponsorReport, SponsorReportSource } from './entities/sponsor-report.entity';
import { sponsorDocument, staffDocument, summaryDocument } from './report-document';
import { sponsorFigures, staffFigures, summaryFigures } from './report-figures';
import { renderReport, ReportFile, ReportFormat } from './report-files';
import { hasEnded, monthPeriod, previousMonth, ReportPeriod, resolvePeriod } from './report-period';

type Community = { id: string; name: string; code: string };

/**
 * Staff reports are worked out when opened. Sponsor reports are saved, so what a sponsor was sent
 * can always be produced again. Municipality Admins read their own community, Super Admins any
 * community or the summary. Coordinators read neither, and sponsors have no account at all.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  private now(): Date {
    return new Date(Date.now());
  }

  private assertCanRead(context: EvaluatedMembershipContext): void {
    if (context.isSuperAdmin) return;
    if (!context.roles.includes(UserRole.MUNICIPALITY_ADMIN)) {
      throw new ForbiddenException('Only a Municipality Admin or Super Admin can read reports');
    }
  }

  private async community(m: EntityManager, id: string): Promise<Community> {
    const [found]: Community[] = await m.query(
      'SELECT id,name,code FROM organizations WHERE id=$1',
      [id],
    );
    if (!found) throw new NotFoundException('Community not found');
    return found;
  }

  /** All the figures come from one view of the data, even while people keep working. */
  private read<T>(work: (m: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction('REPEATABLE READ', work);
  }

  private periodOf(query: ReportPeriodQueryDto): ReportPeriod {
    return resolvePeriod(query, this.now());
  }

  async staffReport(
    orgId: string,
    context: EvaluatedMembershipContext,
    query: ReportPeriodQueryDto,
  ) {
    this.assertCanRead(context);
    const period = this.periodOf(query);
    return this.read(async (m) => staffFigures(m, await this.community(m, orgId), period));
  }

  async staffDownload(
    orgId: string,
    context: EvaluatedMembershipContext,
    query: ReportDownloadQueryDto,
    ip?: string,
  ): Promise<ReportFile> {
    this.assertCanRead(context);
    const { format, ...chosen } = query;
    const period = this.periodOf(chosen);
    const figures = await this.read(async (m) =>
      staffFigures(m, await this.community(m, orgId), period),
    );
    const file = await renderReport(staffDocument(figures, this.now()), format);
    await this.logDownload(context.userId, orgId, 'STAFF', period.label, format, null, ip);
    return file;
  }

  async summary(query: ReportPeriodQueryDto) {
    const period = this.periodOf(query);
    return this.read((m) => summaryFigures(m, period));
  }

  async summaryDownload(
    userId: string,
    query: ReportDownloadQueryDto,
    ip?: string,
  ): Promise<ReportFile> {
    const { format, ...chosen } = query;
    const period = this.periodOf(chosen);
    const figures = await this.read((m) => summaryFigures(m, period));
    const file = await renderReport(summaryDocument(figures, this.now()), format);
    await this.logDownload(userId, null, 'SUMMARY', period.label, format, null, ip);
    return file;
  }

  async listSponsorReports(orgId: string, context: EvaluatedMembershipContext) {
    this.assertCanRead(context);
    const reports = await this.dataSource.getRepository(SponsorReport).find({
      where: { organizationId: orgId },
      order: { periodMonth: 'DESC', version: 'DESC' },
      take: 60,
    });
    return reports.map((report) => ({
      id: report.id,
      month: report.periodMonth,
      label: report.figures.period.label,
      version: report.version,
      source: report.source,
      generatedAt: report.generatedAt,
      figures: report.figures,
    }));
  }

  /** Staff asking for a month again makes a new version. Earlier versions stay as they were sent. */
  async generateSponsorReport(
    orgId: string,
    context: EvaluatedMembershipContext,
    dto: GenerateSponsorReportDto,
    ip?: string,
  ) {
    this.assertCanRead(context);
    if (!hasEnded(dto.month, this.now())) {
      throw new BadRequestException('A sponsor report can only cover a month that has ended');
    }
    const saved = await this.save(orgId, dto.month, 'STAFF', context.userId, ip);
    return {
      id: saved?.id,
      month: saved?.periodMonth,
      version: saved?.version,
      generatedAt: saved?.generatedAt,
    };
  }

  async sponsorDownload(
    orgId: string,
    reportId: string,
    context: EvaluatedMembershipContext,
    format: 'pdf' | 'csv',
    ip?: string,
  ): Promise<ReportFile> {
    this.assertCanRead(context);
    const report = await this.dataSource
      .getRepository(SponsorReport)
      .findOne({ where: { id: reportId, organizationId: orgId } });
    if (!report) throw new NotFoundException('Report not found');
    const file = await renderReport(sponsorDocument(report.figures, report), format);
    await this.logDownload(
      context.userId,
      orgId,
      'SPONSOR',
      report.figures.period.label,
      format,
      report,
      ip,
    );
    return file;
  }

  /**
   * Saves last month's report for each active community that has none yet. Safe to run often and
   * from several servers: a community with a saved month is left alone.
   */
  async saveMonthlyReports(): Promise<number> {
    const month = previousMonth(this.now());
    const period = monthPeriod(month);
    const due: { id: string }[] = await this.dataSource.query(
      `SELECT o.id FROM organizations o
       WHERE o.status='ACTIVE' AND o.created_at<$1
         AND NOT EXISTS (SELECT 1 FROM sponsor_reports s
           WHERE s.organization_id=o.id AND s.period_month=$2)`,
      [period.endsBefore, month],
    );
    let saved = 0;
    for (const { id } of due) {
      try {
        if (await this.save(id, month, 'MONTHLY_JOB', null)) saved += 1;
      } catch (error) {
        // One community's failure must not stop the others. The next run tries it again.
        this.logger.error(`Could not save the sponsor report for ${id}`, error);
      }
    }
    return saved;
  }

  private async save(
    orgId: string,
    month: string,
    source: SponsorReportSource,
    userId: string | null,
    ip?: string,
  ): Promise<SponsorReport | null> {
    // The lock serializes versions, while repeatable read keeps all figure queries
    // on one snapshot. A waiter may have acquired its snapshot before the previous
    // version committed, so retry only that version collision or serialization failure.
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.dataSource.transaction('REPEATABLE READ', async (m) => {
          await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
            `sponsor-report:${orgId}:${month}`,
          ]);
          const [row]: { latest: number }[] = await m.query(
            `SELECT COALESCE(max(version),0)::int AS latest FROM sponsor_reports
         WHERE organization_id=$1 AND period_month=$2`,
            [orgId, month],
          );
          const latest = row?.latest ?? 0;
          if (source === 'MONTHLY_JOB' && latest > 0) return null;
          const community = await this.community(m, orgId);
          const repository = m.getRepository(SponsorReport);
          const report = await repository.save(
            repository.create({
              organizationId: orgId,
              periodMonth: month,
              version: latest + 1,
              figures: await sponsorFigures(m, community, monthPeriod(month)),
              source,
              generatedByUserId: userId,
            }),
          );
          await this.audit.logEvent(
            {
              eventType: 'SPONSOR_REPORT_SAVED',
              actorId: userId,
              targetId: report.id,
              targetType: 'sponsor_report',
              organizationId: orgId,
              payload: { month, version: report.version, source },
              ipAddress: ip,
            },
            m,
          );
          return report;
        });
      } catch (error) {
        const failure =
          (error as { driverError?: { code?: string; constraint?: string } }).driverError ??
          (error as { code?: string; constraint?: string });
        const retryable =
          failure?.code === '40001' ||
          (failure?.code === '23505' && failure.constraint === 'uq_sponsor_reports_version');
        if (!retryable || attempt >= 4) throw error;
      }
    }
  }

  private async logDownload(
    actorId: string,
    orgId: string | null,
    kind: 'STAFF' | 'SUMMARY' | 'SPONSOR',
    period: string,
    format: ReportFormat,
    report: SponsorReport | null,
    ip?: string,
  ): Promise<void> {
    await this.audit.logEvent({
      eventType: 'REPORT_DOWNLOADED',
      actorId,
      targetId: report?.id ?? null,
      targetType: report ? 'sponsor_report' : 'report',
      organizationId: orgId,
      payload: { kind, period, format, ...(report ? { version: report.version } : {}) },
      ipAddress: ip,
    });
  }
}
