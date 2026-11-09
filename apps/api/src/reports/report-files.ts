import { Workbook } from 'exceljs';
import PDFDocument from 'pdfkit';
import { Cell, ReportDocument } from './report-document';
import { cleanText } from './report-privacy';

export type ReportFormat = 'pdf' | 'xlsx' | 'csv';
export interface ReportFile {
  bytes: Buffer;
  contentType: string;
  fileName: string;
}

const cell = (value: Cell) => (typeof value === 'number' ? value : cleanText(value));

function csvCell(value: Cell): string {
  const text = String(cell(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(doc: ReportDocument): Buffer {
  const line = (cells: Cell[]) => cells.map(csvCell).join(',');
  const lines = [line([doc.title]), ...doc.details.map((detail) => line(detail)), ''];
  for (const section of doc.sections) {
    lines.push(line([section.title]), line(section.columns));
    lines.push(...section.rows.map(line), '');
  }
  lines.push(...doc.notes.map((note) => line([note])));
  // The byte order mark tells Excel this is UTF-8.
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

export async function toXlsx(doc: ReportDocument): Promise<Buffer> {
  const book = new Workbook();
  const sheet = book.addWorksheet('Report');
  sheet.addRow([cell(doc.title)]).font = { bold: true, size: 14 };
  for (const detail of doc.details) sheet.addRow(detail.map(cell));
  sheet.addRow([]);
  for (const section of doc.sections) {
    sheet.addRow([cell(section.title)]).font = { bold: true, size: 12 };
    sheet.addRow(section.columns.map(cell)).font = { bold: true };
    for (const row of section.rows) sheet.addRow(row.map(cell));
    sheet.addRow([]);
  }
  for (const note of doc.notes) sheet.addRow([cell(note)]);
  sheet.columns.forEach((column, index) => {
    column.width = index === 0 ? 40 : 14;
  });
  return Buffer.from(await book.xlsx.writeBuffer());
}

/** The built-in PDF font covers Latin text only. Malayalam needs an embedded font (Milestone 9). */
const latin = (value: Cell) => String(cell(value)).replace(/[^\x20-\x7E -ÿ]/g, '?');

export function toPdf(doc: ReportDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 50, info: { Title: latin(doc.title) } });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const left = pdf.page.margins.left;
    const width = pdf.page.width - left - pdf.page.margins.right;
    const bottom = () => pdf.page.height - pdf.page.margins.bottom;
    const room = (height: number) => {
      if (pdf.y + height > bottom()) pdf.addPage();
    };

    pdf.font('Helvetica-Bold').fontSize(18).text(latin(doc.title));
    pdf.moveDown(0.3);
    for (const [label, value] of doc.details) {
      pdf
        .font('Helvetica')
        .fontSize(10)
        .text(`${latin(label)}: ${latin(value)}`);
    }
    pdf.moveDown();

    for (const section of doc.sections) {
      room(60);
      pdf.font('Helvetica-Bold').fontSize(12).text(latin(section.title), left);
      pdf.moveDown(0.3);
      // The first column takes what the number columns leave over.
      const numberWidth = Math.min(70, (width * 0.6) / Math.max(section.columns.length - 1, 1));
      const firstWidth = width - numberWidth * (section.columns.length - 1);
      const drawRow = (cells: Cell[], font: string) => {
        pdf.font(font).fontSize(9);
        const text = cells.map(latin);
        const height = text.reduce((tallest, value, index) => {
          const columnWidth = index === 0 ? firstWidth : numberWidth;
          return Math.max(tallest, pdf.heightOfString(value, { width: columnWidth - 6 }));
        }, 0);
        room(height + 6);
        const top = pdf.y;
        text.forEach((value, index) => {
          const x = index === 0 ? left : left + firstWidth + numberWidth * (index - 1);
          pdf.text(value, x, top, {
            width: (index === 0 ? firstWidth : numberWidth) - 6,
            align: index === 0 ? 'left' : 'right',
          });
        });
        pdf.y = top + height + 3;
        pdf
          .moveTo(left, pdf.y)
          .lineTo(left + width, pdf.y)
          .strokeColor('#dddddd')
          .lineWidth(0.5)
          .stroke();
        pdf.y += 3;
      };
      drawRow(section.columns, 'Helvetica-Bold');
      if (section.rows.length === 0) drawRow(['Nothing in this period'], 'Helvetica');
      for (const row of section.rows) drawRow(row, 'Helvetica');
      pdf.x = left;
      pdf.moveDown();
    }

    room(60);
    pdf.font('Helvetica').fontSize(8).fillColor('#555555');
    for (const note of doc.notes) pdf.text(latin(note), left, undefined, { width });
    pdf.end();
  });
}

const CONTENT_TYPES: Record<ReportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

export async function renderReport(doc: ReportDocument, format: ReportFormat): Promise<ReportFile> {
  const bytes =
    format === 'pdf' ? await toPdf(doc) : format === 'xlsx' ? await toXlsx(doc) : toCsv(doc);
  return { bytes, contentType: CONTENT_TYPES[format], fileName: `${doc.stem}.${format}` };
}
