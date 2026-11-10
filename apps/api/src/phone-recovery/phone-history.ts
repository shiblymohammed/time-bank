import { EntityManager } from 'typeorm';

/**
 * What other parts of the API need to know about moved numbers. Plain queries, so sign-in and
 * closures can ask without depending on the recovery module.
 */

/**
 * How long a number stays unusable after an account moves off it. It keeps a move undoable, and
 * stops the real owner of a wrongly moved number silently getting a new empty account. Indian
 * operators must wait at least this long before reissuing a number, so a stranger holding it inside
 * the window should be rare.
 */
export const NUMBER_HOLD_DAYS = 90;

/** A nominee named this soon after a move gets a second look, as one named close to a death does. */
export const NOMINEE_REVIEW_AFTER_MOVE_DAYS = 30;

export const OPEN_RECOVERY_STATUSES = ['OPENED', 'CONFIRMED'];

export const HELD_NUMBER_MESSAGE =
  'This number cannot be used right now. Contact your community coordinator.';

/** The same lock sign-in holds while it looks a number up or creates its account. */
export function lockNumber(manager: EntityManager, phone: string): Promise<unknown> {
  return manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`identity:${phone}`]);
}

export async function isNumberHeld(
  manager: EntityManager,
  phone: string,
  now = new Date(),
): Promise<boolean> {
  const rows: unknown[] = await manager.query(
    `SELECT 1 FROM phone_recovery_cases
     WHERE old_phone = $1 AND status = 'COMPLETED'
       AND decided_at > $2::timestamptz - make_interval(days => $3)
     LIMIT 1`,
    [phone, now, NUMBER_HOLD_DAYS],
  );
  return (rows?.length ?? 0) > 0;
}

/**
 * True if an account moved on or off this number since the given date. A nominee is named by their
 * number, so after that it no longer says for sure who the nominee is.
 */
export async function numberMovedSince(
  manager: EntityManager,
  phone: string,
  since: Date,
): Promise<boolean> {
  const rows: unknown[] = await manager.query(
    `SELECT 1 FROM phone_recovery_cases
     WHERE (old_phone = $1 OR new_phone = $1)
       AND status IN ('COMPLETED', 'REVERSED') AND decided_at >= $2
     LIMIT 1`,
    [phone, since],
  );
  return rows.length > 0;
}

export async function hasOpenRecovery(manager: EntityManager, userId: string): Promise<boolean> {
  const rows: unknown[] = await manager.query(
    `SELECT 1 FROM phone_recovery_cases
     WHERE subject_user_id = $1 AND status = ANY($2) LIMIT 1`,
    [userId, OPEN_RECOVERY_STATUSES],
  );
  return rows.length > 0;
}

/** True if this nominee was named soon after the member's account moved to a new number. */
export async function namedSoonAfterMove(
  manager: EntityManager,
  userId: string,
  namedAt: Date,
): Promise<boolean> {
  const rows: unknown[] = await manager.query(
    `SELECT 1 FROM phone_recovery_cases
     WHERE subject_user_id = $1 AND status IN ('COMPLETED', 'REVERSED')
       AND decided_at <= $2
       AND decided_at + make_interval(days => $3) > $2
     LIMIT 1`,
    [userId, namedAt, NOMINEE_REVIEW_AFTER_MOVE_DAYS],
  );
  return rows.length > 0;
}

/** Nothing further can be decided about someone whose account has closed. */
export async function endOpenRecoveries(
  manager: EntityManager,
  userId: string,
  actorId: string,
): Promise<void> {
  const open: { id: string }[] = await manager.query(
    `SELECT id FROM phone_recovery_cases
     WHERE subject_user_id = $1 AND status = ANY($2) FOR UPDATE`,
    [userId, OPEN_RECOVERY_STATUSES],
  );
  for (const { id } of open) {
    await manager.query(
      `UPDATE phone_recovery_cases
       SET status = 'REFUSED', decided_by_user_id = $2, decided_at = now(), updated_at = now()
       WHERE id = $1`,
      [id, actorId],
    );
    await manager.query(
      `INSERT INTO phone_recovery_events (case_id, actor_user_id, type, notes)
       VALUES ($1, $2, 'REFUSED', 'The account has closed')`,
      [id, actorId],
    );
  }
}
