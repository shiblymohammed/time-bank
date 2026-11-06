import { MigrationInterface, QueryRunner } from 'typeorm';

/** Phones that accept push messages, and a transactional outbox of messages to send. */
export class PushNotifications1729118400011 implements MigrationInterface {
  name = 'PushNotifications1729118400011';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE push_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(4096) NOT NULL UNIQUE,
        platform VARCHAR(10) NOT NULL CHECK (platform IN ('ANDROID','IOS')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_push_devices_user ON push_devices(user_id);

      CREATE TABLE notification_outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(120) NOT NULL,
        body VARCHAR(300) NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','SENT','NO_DEVICE','EXPIRED','FAILED')),
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        last_error VARCHAR(300),
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_notification_outbox_due ON notification_outbox(next_attempt_at)
        WHERE status = 'PENDING';
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE notification_outbox;
      DROP TABLE push_devices;
    `);
  }
}
