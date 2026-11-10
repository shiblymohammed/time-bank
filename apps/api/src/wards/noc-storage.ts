import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';

/** A signed NOC photo or scan: at most 5 MB. */
export const NOC_MAX_BYTES = 5 * 1024 * 1024;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * What the file really is, from its first bytes. The name and the type the phone sends are not
 * trusted, so a renamed program can never be stored as a "photo".
 */
export function detectDocumentType(
  bytes: Buffer,
): { contentType: string; extension: 'pdf' | 'jpg' | 'png' } | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-')
    return { contentType: 'application/pdf', extension: 'pdf' };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { contentType: 'image/jpeg', extension: 'jpg' };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG))
    return { contentType: 'image/png', extension: 'png' };
  return null;
}

/**
 * Private files on the API server (owner's decision, 10 November 2026). Nothing here is served
 * directly: files are read only through the API, which checks who is asking. UPLOADS_DIR must be
 * set in production, on a disk that is backed up.
 */
@Injectable()
export class DocumentStorage {
  constructor(private readonly config: ConfigService) {}

  private root(): string {
    const configured = this.config.get<string>('UPLOADS_DIR');
    if (!configured && this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException(
        'File uploads are not set up on this server. Ask the administrator to set UPLOADS_DIR.',
      );
    }
    return path.resolve(configured || path.join(process.cwd(), 'var', 'uploads'));
  }

  /** Keys are made by the server only: <organization id>/<document id>.<pdf|jpg|png>. */
  private file(key: string): string {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(key)) {
      throw new Error('Unexpected storage key');
    }
    const root = this.root();
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep)) throw new Error('Unexpected storage key');
    return file;
  }

  async save(key: string, bytes: Buffer): Promise<void> {
    const file = this.file(key);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, bytes, { mode: 0o600, flag: 'wx' });
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.file(key));
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.file(key), { force: true });
  }
}
