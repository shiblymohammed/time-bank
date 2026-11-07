import { DataSource, Repository } from 'typeorm';
import { NotificationOutbox, NotificationStatus } from './entities/notification-outbox.entity';
import { PushDevice } from './entities/push-device.entity';
import { NotificationsService } from './notifications.service';
import { PushSender } from './push-sender.service';

describe('NotificationsService delivery', () => {
  const outbox = { update: jest.fn(), find: jest.fn() };
  const devices = { find: jest.fn() };
  const manager = {
    getRepository: (entity: unknown) => (entity === PushDevice ? devices : outbox),
    save: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: (work: (value: typeof manager) => unknown) => work(manager),
  } as unknown as DataSource;
  const sender = { configured: true, send: jest.fn() };
  const service = new NotificationsService(
    {} as Repository<PushDevice>,
    dataSource,
    sender as unknown as PushSender,
  );
  const message = (): NotificationOutbox =>
    ({
      userId: 'user-1',
      status: NotificationStatus.PENDING,
      attempts: 0,
      title: 'New help request',
      body: 'Open the app',
      data: {},
    }) as NotificationOutbox;

  beforeEach(() => {
    jest.clearAllMocks();
    sender.configured = true;
    devices.find.mockResolvedValue([{ token: 'token-1' }]);
    manager.query.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('sends nothing to a banned, restricted or signed-out account', async () => {
    const notification = message();
    outbox.find.mockResolvedValue([notification]);
    manager.query.mockResolvedValue([]);

    await service.deliverDue();

    expect(notification.status).toBe(NotificationStatus.NO_DEVICE);
    expect(sender.send).not.toHaveBeenCalled();
    expect(devices.find).not.toHaveBeenCalled();
  });

  it('marks a delivered message as sent', async () => {
    const notification = message();
    outbox.find.mockResolvedValue([notification]);
    sender.send.mockResolvedValue({ delivered: 1, staleTokens: [] });

    await expect(service.deliverDue()).resolves.toBe(1);

    expect(notification.status).toBe(NotificationStatus.SENT);
    expect(notification.sentAt).toBeInstanceOf(Date);
  });

  it('records when the person has no phone registered, without sending', async () => {
    const notification = message();
    outbox.find.mockResolvedValue([notification]);
    devices.find.mockResolvedValue([]);

    await service.deliverDue();

    expect(notification.status).toBe(NotificationStatus.NO_DEVICE);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('forgets a token Firebase no longer recognises', async () => {
    const notification = message();
    outbox.find.mockResolvedValue([notification]);
    sender.send.mockResolvedValue({ delivered: 0, staleTokens: ['token-1'] });

    await service.deliverDue();

    expect(manager.delete).toHaveBeenCalledTimes(1);
    expect(notification.status).toBe(NotificationStatus.NO_DEVICE);
  });

  it('retries a failed send later, then gives up after five attempts', async () => {
    const notification = message();
    outbox.find.mockResolvedValue([notification]);
    sender.send.mockRejectedValue(new Error('Firebase unavailable'));

    await service.deliverDue();
    expect(notification.status).toBe(NotificationStatus.PENDING);
    expect(notification.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(notification.lastError).toBe('Firebase unavailable');

    notification.attempts = 4;
    await service.deliverDue();
    expect(notification.status).toBe(NotificationStatus.FAILED);
  });

  it('only expires old messages when push is not configured', async () => {
    sender.configured = false;

    await expect(service.deliverDue()).resolves.toBe(0);

    expect(outbox.update).toHaveBeenCalledTimes(1);
    expect(outbox.find).not.toHaveBeenCalled();
  });
});
