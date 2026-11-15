import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthGuard, reachableWhileRestricted } from '../auth/guards/auth.guard';
import { DocumentStorage } from '../wards/noc-storage';
import { ProfilePhotoController } from './profile-photo.controller';
import {
  prepareProfilePhoto,
  PROFILE_PHOTO_MAX_BYTES,
  ProfilePhotoService,
} from './profile-photo.service';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';

describe('Optional profile photos', () => {
  let photo: Buffer;
  let app: INestApplication;
  let service: ProfilePhotoService;
  const users = new Map<string, { id: string; profilePhotoId: string | null }>();
  const files = new Map<string, Buffer>();
  const repository = {
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null),
    update: jest.fn(async (id: string, change: { profilePhotoId: string | null }) =>
      Object.assign(users.get(id)!, change),
    ),
  };
  const manager = { getRepository: () => repository };
  const data = {
    getRepository: () => repository,
    transaction: async (action: (m: typeof manager) => Promise<void>) => {
      const before = new Map([...users].map(([id, user]) => [id, { ...user }]));
      try {
        return await action(manager);
      } catch (error) {
        users.clear();
        for (const [id, user] of before) users.set(id, user);
        throw error;
      }
    },
  };
  const storage = {
    save: jest.fn(async (key: string, bytes: Buffer) => {
      files.set(key, bytes);
    }),
    read: jest.fn(async (key: string) => {
      if (!files.has(key)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
      return files.get(key)!;
    }),
    remove: jest.fn(async (key: string) => {
      files.delete(key);
    }),
  };
  const audit = {
    logEvent: jest.fn<Promise<object>, [{ eventType: string }, unknown?]>(async () => ({})),
  };

  beforeAll(async () => {
    photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#8433de' } })
      .withMetadata({ exif: { IFD0: { Artist: 'Private camera metadata' } } })
      .jpeg()
      .toBuffer();
    const module = await Test.createTestingModule({
      controllers: [ProfilePhotoController],
      providers: [
        ProfilePhotoService,
        { provide: DataSource, useValue: data },
        { provide: DocumentStorage, useValue: storage },
        { provide: AuditService, useValue: audit },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          const id = req.headers.authorization?.replace('Bearer ', '');
          if (![owner, other].includes(id)) throw new UnauthorizedException();
          req.user = { id };
          return true;
        },
      })
      .compile();
    service = module.get(ProfilePhotoService);
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    users.clear();
    files.clear();
    users.set(owner, { id: owner, profilePhotoId: null });
    users.set(other, { id: other, profilePhotoId: null });
  });

  it('resizes real photos and removes embedded metadata', async () => {
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const result = await prepareProfilePhoto(photo);
    const metadata = await sharp(result).metadata();
    expect(metadata).toEqual(expect.objectContaining({ format: 'jpeg', width: 512, height: 512 }));
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });
  it.each(['png', 'webp'] as const)('accepts %s and normalizes to JPEG', async (format) => {
    const bytes = await sharp(photo).toFormat(format).toBuffer();
    expect((await sharp(await prepareProfilePhoto(bytes)).metadata()).format).toBe('jpeg');
  });
  it.each([
    Buffer.from('%PDF-not-a-photo'),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
    Buffer.from([255, 216, 255, 1, 2]),
    Buffer.alloc(0),
  ])('rejects documents, vector images and corrupt or empty uploads', async (bytes) => {
    await expect(service.upload(owner, { buffer: bytes })).rejects.toThrow();
    expect(storage.save).not.toHaveBeenCalled();
  });
  it('rejects oversized uploads before decoding', async () => {
    await expect(
      prepareProfilePhoto(Buffer.alloc(PROFILE_PHOTO_MAX_BYTES + 1)),
    ).rejects.toMatchObject({ status: 413 });
  });
  it('limits decoded image dimensions', async () => {
    const huge = await sharp({
      create: { width: 6000, height: 5000, channels: 3, background: 'white' },
    })
      .jpeg()
      .toBuffer();
    await expect(prepareProfilePhoto(huge)).rejects.toMatchObject({ status: 400 });
  });
  it('replaces the photo under a row lock and removes the superseded file', async () => {
    const first = await service.upload(owner, { buffer: photo });
    const second = await service.upload(owner, { buffer: photo });
    expect(second.profilePhotoVersion).not.toBe(first.profilePhotoVersion);
    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(files.size).toBe(1);
    expect(users.get(other)?.profilePhotoId).toBeNull();
    expect(await service.read(owner)).toEqual(files.values().next().value);
  });
  it('keeps the previous photo and cleans the new file if the transaction fails', async () => {
    const first = await service.upload(owner, { buffer: photo });
    audit.logEvent.mockRejectedValueOnce(new Error('Audit unavailable') as never);
    await expect(service.upload(owner, { buffer: photo })).rejects.toThrow('Audit unavailable');
    expect(users.get(owner)?.profilePhotoId).toBe(first.profilePhotoVersion);
    expect(files.size).toBe(1);
  });
  it('removal is idempotent and clears stored files', async () => {
    await service.upload(owner, { buffer: photo });
    await service.remove(owner);
    await service.remove(owner);
    expect(users.get(owner)?.profilePhotoId).toBeNull();
    expect(files.size).toBe(0);
    expect(
      audit.logEvent.mock.calls.filter(
        (args) => (args[0] as { eventType: string }).eventType === 'PROFILE_PHOTO_REMOVED',
      ),
    ).toHaveLength(1);
    await expect(service.read(owner)).rejects.toMatchObject({ status: 404 });
  });

  const route = '/api/auth/me/photo';
  it('requires authentication for read, write and delete', async () => {
    await request(app.getHttpServer()).get(route).expect(401);
    await request(app.getHttpServer()).put(route).attach('file', photo, 'photo.jpg').expect(401);
    await request(app.getHttpServer()).delete(route).expect(401);
  });
  it('allows a signed-in applicant without a membership to add, read, replace and remove', async () => {
    const first = await request(app.getHttpServer())
      .put(route)
      .auth(owner, { type: 'bearer' })
      .attach('file', photo, '../../renamed.exe')
      .expect(200);
    expect(first.body.profilePhotoVersion).toMatch(/^[0-9a-f-]{36}$/);
    const read = await request(app.getHttpServer())
      .get(route)
      .auth(owner, { type: 'bearer' })
      .expect(200)
      .expect('Content-Type', 'image/jpeg')
      .expect('Cache-Control', 'private, no-store')
      .expect('X-Content-Type-Options', 'nosniff');
    expect((await sharp(read.body).metadata()).width).toBe(512);
    await request(app.getHttpServer()).get(route).auth(other, { type: 'bearer' }).expect(404);
    await request(app.getHttpServer()).delete(route).auth(other, { type: 'bearer' }).expect(200);
    expect(users.get(owner)?.profilePhotoId).toBe(first.body.profilePhotoVersion);
    await request(app.getHttpServer())
      .put(route)
      .auth(owner, { type: 'bearer' })
      .attach('file', photo, 'new.jpg')
      .expect(200);
    await request(app.getHttpServer()).delete(route).auth(owner, { type: 'bearer' }).expect(200);
    await request(app.getHttpServer()).get(route).auth(owner, { type: 'bearer' }).expect(404);
  });
  it('enforces multipart limits and rejects missing or invalid files', async () => {
    await request(app.getHttpServer()).put(route).auth(owner, { type: 'bearer' }).expect(400);
    await request(app.getHttpServer())
      .put(route)
      .auth(owner, { type: 'bearer' })
      .attach('file', Buffer.from('not an image'), 'photo.png')
      .expect(400);
    await request(app.getHttpServer())
      .put(route)
      .auth(owner, { type: 'bearer' })
      .attach('file', Buffer.alloc(PROFILE_PHOTO_MAX_BYTES + 1), 'huge.jpg')
      .expect(413);
    expect(files.size).toBe(0);
  });
  it.each(['GET', 'PUT', 'DELETE'])('does not extend restricted-account access (%s)', (method) => {
    expect(reachableWhileRestricted(method, route)).toBe(false);
  });
});
