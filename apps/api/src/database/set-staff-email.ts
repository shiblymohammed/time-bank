import { AppDataSource } from './data-source';

/**
 * Sets the email a staff member receives sign-in codes at, straight in the database. This is for
 * the first Super Admin, who cannot use the panel before an address is on file. Everyone after that
 * is set from the panel by a Super Admin.
 *
 *   node apps/api/dist/database/set-staff-email.js +919000000106 admin@example.org
 */
async function main(): Promise<void> {
  const [phone, rawEmail] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if (
    !phone ||
    !email ||
    !/^\+\d{8,15}$/.test(phone) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error('Usage: set-staff-email.js <phone in +91... form> <email>');
  }
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (m) => {
      const [user] = await m.query('SELECT id FROM users WHERE phone_e164 = $1', [phone]);
      if (!user) throw new Error(`No account uses ${phone}. Sign in once with that phone first.`);
      const [taken] = await m.query('SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2', [
        email,
        user.id,
      ]);
      if (taken) throw new Error('Another account already uses this email.');
      await m.query('UPDATE users SET email = $2 WHERE id = $1', [user.id, email]);
      await m.query(
        'UPDATE authentication_sessions SET staff_verified_at = NULL WHERE user_id = $1',
        [user.id],
      );
      await m.query(
        `INSERT INTO audit_events (event_type, actor_id, target_id, target_type, payload)
         VALUES ('STAFF_EMAIL_SET', NULL, $1, 'USER', $2)`,
        [user.id, JSON.stringify({ source: 'server-script' })],
      );
    });
    console.warn(`[KTB] Staff email set for ${phone}.`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('[KTB] Could not set staff email:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
