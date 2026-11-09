import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { ReportDocument } from './report-document';
import { toCsv, toPdf, toXlsx } from './report-files';
import { currentMonth, hasEnded, monthPeriod, previousMonth, resolvePeriod } from './report-period';
import {
  cleanText,
  followCount,
  HIDDEN,
  hideSmallCounts,
  hideSmallPeople,
  SMALL,
  tidyWard,
} from './report-privacy';

describe('small counts', () => {
  it('leaves large counts alone', () => {
    expect(hideSmallCounts([5, 9, 100])).toEqual([5, 9, 100]);
  });

  it('hides a small count and the next smallest, so neither follows from the total', () => {
    expect(hideSmallCounts([100, 3, 20, 40])).toEqual([100, SMALL, HIDDEN, 40]);
  });

  it('needs no second hiding when two are already small', () => {
    expect(hideSmallCounts([1, 2, 50])).toEqual([SMALL, SMALL, 50]);
  });

  it('hides a zero beside other figures, but not a breakdown of all zeros', () => {
    expect(hideSmallCounts([0, 7])).toEqual([SMALL, HIDDEN]);
    expect(hideSmallCounts([0, 0])).toEqual([0, 0]);
  });

  it('copes with a single row and with nothing', () => {
    expect(hideSmallCounts([2])).toEqual([SMALL]);
    expect(hideSmallCounts([])).toEqual([]);
  });

  it('holds back what goes with a hidden count', () => {
    expect(followCount(SMALL, 12.5)).toBe(HIDDEN);
    expect(followCount(HIDDEN, 12.5)).toBe(HIDDEN);
    expect(followCount(8, 12.5)).toBe(12.5);
  });

  it('never gives an exact small count of people', () => {
    expect(hideSmallPeople(0)).toBe(0);
    expect(hideSmallPeople(4)).toBe(SMALL);
    expect(hideSmallPeople(5)).toBe(5);
  });
});

describe('ward numbers', () => {
  it.each([
    ['12', 'Ward 12'],
    [' 012 ', 'Ward 12'],
    ['ward 7', 'Ward 7'],
    ['Ward No. 7', 'Ward 7'],
    ['WARD NO 7a', 'Ward 7A'],
    ['#3', 'Ward 3'],
  ])('reads %s as a ward', (raw, ward) => {
    expect(tidyWard(raw)).toBe(ward);
  });

  it.each([null, '', 'Near the mosque', 'Fathima, house 12', '12345', '9000000000'])(
    'puts %s under Other, since it could name someone',
    (raw) => {
      expect(tidyWard(raw)).toBe('Other');
    },
  );
});

describe('spreadsheet formulas', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)'])('makes %s plain text', (value) => {
    expect(cleanText(value)).toBe(`'${value}`);
  });

  it('catches a formula hidden behind a line break or spaces', () => {
    expect(cleanText('\r\n  =1+1')).toBe("'=1+1");
  });

  it('leaves ordinary text alone', () => {
    expect(cleanText('Home visit')).toBe('Home visit');
  });
});

describe('report periods', () => {
  const now = new Date('2026-11-09T06:00:00Z');

  it('sets a month by India time', () => {
    const period = monthPeriod('2026-10');
    expect(period.startsAt.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(period.endsBefore.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(period.label).toBe('October 2026');
    expect(monthPeriod('2028-02').to).toBe('2028-02-29');
  });

  it('finds this month and last month in India, across a new year', () => {
    expect(currentMonth(new Date('2026-12-31T19:00:00Z'))).toBe('2027-01');
    expect(previousMonth(new Date('2026-12-31T19:00:00Z'))).toBe('2026-12');
    expect(previousMonth(new Date('2027-01-15T00:00:00Z'))).toBe('2026-12');
  });

  it('says a month has ended only once India has left it', () => {
    expect(hasEnded('2026-10', new Date('2026-10-31T18:29:59Z'))).toBe(false);
    expect(hasEnded('2026-10', new Date('2026-10-31T18:30:00Z'))).toBe(true);
  });

  it('uses this month when nothing is chosen', () => {
    expect(resolvePeriod({}, now).month).toBe('2026-11');
  });

  it('takes a date range, including its last day', () => {
    const period = resolvePeriod({ from: '2026-10-01', to: '2026-10-02' }, now);
    expect(period.month).toBeNull();
    expect(period.endsBefore.toISOString()).toBe('2026-10-02T18:30:00.000Z');
  });

  it.each([
    [{ month: '2026-10', from: '2026-10-01', to: '2026-10-02' }, 'not both'],
    [{ from: '2026-10-01' }, 'both a start date'],
    [{ from: '2026-10-05', to: '2026-10-01' }, 'must not be after'],
    [{ from: '2026-02-31', to: '2026-03-01' }, 'does not exist'],
    [{ from: '2026-12-01', to: '2026-12-02' }, 'not started'],
    [{ month: '2026-12' }, 'not started'],
    [{ from: '2024-01-01', to: '2026-01-01' }, 'one year'],
  ])('refuses %j', (query, message) => {
    expect(() => resolvePeriod(query, now)).toThrow(BadRequestException);
    expect(() => resolvePeriod(query, now)).toThrow(message);
  });
});

describe('report files', () => {
  const doc: ReportDocument = {
    title: 'Community report',
    details: [
      ['Community', '=HYPERLINK("http://bad","Kottakkal, town")'],
      ['Period', 'October 2026'],
    ],
    sections: [
      {
        title: 'Help by service',
        columns: ['Service', 'Visits', 'Hours'],
        rows: [
          ['@Home visit', 12, 7.5],
          ['Rides', '<5', 'hidden'],
        ],
      },
      { title: 'Help by ward', columns: ['Ward', 'Visits', 'Hours'], rows: [] },
    ],
    notes: ['Counts only.'],
    stem: 'test',
  };

  it('writes a CSV that Excel opens as UTF-8 and cannot run', () => {
    const text = toCsv(doc).toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain(`"'=HYPERLINK(""http://bad"",""Kottakkal, town"")"`);
    expect(text).toContain(`'@Home visit,12,7.5`);
    expect(text).toContain('Rides,<5,hidden');
  });

  it('writes an Excel file with real numbers and no formulas', async () => {
    const book = new Workbook();
    await book.xlsx.load((await toXlsx(doc)) as never);
    const values: unknown[] = [];
    book.getWorksheet('Report')?.eachRow((row) => {
      row.eachCell((cell) => values.push(cell.value));
    });
    expect(values).toContain(12);
    expect(values).toContain('<5');
    expect(values).toContain(`'@Home visit`);
    expect(values.some((value) => typeof value === 'object')).toBe(false);
  });

  it('writes a PDF, even with text the built-in font cannot draw', async () => {
    const pdf = await toPdf({
      ...doc,
      details: [['Community', 'കോട്ടക്കൽ']],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('runs a long PDF onto further pages', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => [`Service ${i}`, i, i]);
    const pdf = await toPdf({
      ...doc,
      sections: [{ title: 'Long', columns: ['Service', 'Visits', 'Hours'], rows }],
    });
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
  });
});
