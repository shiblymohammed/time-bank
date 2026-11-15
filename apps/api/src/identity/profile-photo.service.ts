import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { DocumentStorage } from '../wards/noc-storage';
import { User } from './entities/user.entity';

export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Decode and re-encode: never save original uploads or EXIF/GPS metadata. */
export async function prepareProfilePhoto(
  bytes: Buffer,
  forCommunityPost = false,
): Promise<Buffer> {
  if (!bytes.length) throw new BadRequestException('Choose a photo to upload');
  if (bytes.length > PROFILE_PHOTO_MAX_BYTES) {
    throw new PayloadTooLargeException('Choose a photo smaller than 5 MB');
  }
  try {
    const image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) {
      throw new Error('Unsupported photo');
    }
    return await image
      .rotate()
      .resize(forCommunityPost ? 1440 : 512, forCommunityPost ? 1440 : 512, {
        fit: forCommunityPost ? 'inside' : 'cover',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new BadRequestException(
      'Choose a valid, non-animated JPG, PNG or WebP photo (up to 25 megapixels)',
    );
  }
}

@Injectable()
export class ProfilePhotoService {
  private readonly logger = new Logger(ProfilePhotoService.name);
  constructor(
    private readonly data: DataSource,
    private readonly storage: DocumentStorage,
    private readonly audit: AuditService,
  ) {}

  private key(userId: string, photoId: string): string {
    return `${userId}/${photoId}.jpg`;
  }

  private async cleanup(key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch {
      this.logger.warn('An unused profile photo could not be removed from private storage');
    }
  }

  async upload(userId: string, file: { buffer: Buffer } | undefined, ipAddress?: string) {
    if (!file?.buffer) throw new BadRequestException('Choose a photo to upload');
    const bytes = await prepareProfilePhoto(file.buffer);
    const photoId = randomUUID();
    const key = this.key(userId, photoId);
    let previous: string | null | undefined;
    try {
      await this.storage.save(key, bytes);
      await this.data.transaction(async (manager) => {
        const users = manager.getRepository(User);
        const user = await users.findOne({
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('User not found');
        previous = user.profilePhotoId;
        await users.update(userId, { profilePhotoId: photoId });
        await this.audit.logEvent(
          {
            eventType: 'PROFILE_PHOTO_UPDATED',
            actorId: userId,
            targetId: userId,
            targetType: 'USER',
            ipAddress,
            payload: { sizeBytes: bytes.length },
          },
          manager,
        );
      });
    } catch (error) {
      await this.cleanup(key);
      throw error;
    }
    if (previous) await this.cleanup(this.key(userId, previous));
    return { profilePhotoVersion: photoId };
  }

  async read(userId: string): Promise<Buffer> {
    const user = await this.data.getRepository(User).findOne({ where: { id: userId } });
    if (!user?.profilePhotoId) throw new NotFoundException('No profile photo has been added');
    return this.readVersion(userId, user.profilePhotoId);
  }

  async readVersion(userId: string, photoId: string): Promise<Buffer> {
    try {
      return await this.storage.read(this.key(userId, photoId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new NotFoundException('Photo is no longer available');
      throw error;
    }
  }

  async remove(userId: string, ipAddress?: string) {
    let previous: string | null | undefined;
    await this.data.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('User not found');
      previous = user.profilePhotoId;
      if (!previous) return;
      await users.update(userId, { profilePhotoId: null });
      await this.audit.logEvent(
        {
          eventType: 'PROFILE_PHOTO_REMOVED',
          actorId: userId,
          targetId: userId,
          targetType: 'USER',
          ipAddress,
        },
        manager,
      );
    });
    if (previous) await this.cleanup(this.key(userId, previous));
    return { profilePhotoVersion: null };
  }
}
