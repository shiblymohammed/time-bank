import { BadRequestException } from '@nestjs/common';

/** Reports use India time, so a visit on the night of the 31st stays in that month. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

export interface ReportPeriod {
  /** First day, in India time. */
  from: string;
  /** Last day, in India time. */
  to: string;
  label: string;
  /** Set when the period is one whole month. */
  month: string | null;
  startsAt: Date;
  /** The moment after the last day ends. */
  endsBefore: Date;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const istDay = (now: Date) => new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const startOfDay = (day: string) => new Date(`${day}T00:00:00+05:30`);
const nextDay = (day: string) => new Date(startOfDay(day).getTime() + DAY_MS);

/** Refuses dates like 2026-02-31, which the pattern check lets through. */
function realDay(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new BadRequestException('That date does not exist');
  }
  return day;
}

export function monthPeriod(month: string): ReportPeriod {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  const last = new Date(Date.UTC(year, index + 1, 0)).toISOString().slice(0, 10);
  const first = `${month}-01`;
  return {
    from: first,
    to: last,
    label: `${MONTHS[index]} ${year}`,
    month,
    startsAt: startOfDay(first),
    endsBefore: nextDay(last),
  };
}

export const currentMonth = (now: Date) => istDay(now).slice(0, 7);

export function previousMonth(now: Date): string {
  const [year, month] = currentMonth(now).split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

export function hasEnded(month: string, now: Date): boolean {
  return monthPeriod(month).endsBefore.getTime() <= now.getTime();
}

/** A month, a date range, or this month when nothing is chosen. */
export function resolvePeriod(
  query: { month?: string | undefined; from?: string | undefined; to?: string | undefined },
  now: Date,
): ReportPeriod {
  if (query.month && (query.from || query.to)) {
    throw new BadRequestException('Choose a month or a date range, not both');
  }
  if (Boolean(query.from) !== Boolean(query.to)) {
    throw new BadRequestException('Choose both a start date and an end date');
  }
  const today = istDay(now);
  if (query.from && query.to) {
    const from = realDay(query.from);
    const to = realDay(query.to);
    if (from > to) throw new BadRequestException('The start date must not be after the end date');
    if (from > today) throw new BadRequestException('That period has not started yet');
    const days = (startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS + 1;
    if (days > MAX_RANGE_DAYS) throw new BadRequestException('Choose a period of one year or less');
    return {
      from,
      to,
      label: `${from} to ${to}`,
      month: null,
      startsAt: startOfDay(from),
      endsBefore: nextDay(to),
    };
  }
  const month = query.month ?? currentMonth(now);
  if (`${month}-01` > today) throw new BadRequestException('That period has not started yet');
  return monthPeriod(month);
}
