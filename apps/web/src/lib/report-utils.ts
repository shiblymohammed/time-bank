/** A figure from the API: a number, or "<5" or "hidden" when it is held back. */
export type Shown = number | string;

export type ReportPeriodChoice = {
  mode: 'month' | 'range';
  month: string;
  from: string;
  to: string;
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The month it is in India, whatever the browser's own time zone. */
export const currentIndiaMonth = (now: Date) =>
  new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);

export function previousIndiaMonth(now: Date): string {
  const [year, month] = currentIndiaMonth(now).split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

/** The query for a chosen period, or null while a date range is unfinished. */
export function periodQuery(choice: ReportPeriodChoice): string | null {
  if (choice.mode === 'month') {
    return choice.month ? `month=${encodeURIComponent(choice.month)}` : null;
  }
  if (!choice.from || !choice.to) return null;
  return `from=${encodeURIComponent(choice.from)}&to=${encodeURIComponent(choice.to)}`;
}

export const shown = (value: Shown) =>
  typeof value === 'number' ? value.toLocaleString('en-IN') : value;
