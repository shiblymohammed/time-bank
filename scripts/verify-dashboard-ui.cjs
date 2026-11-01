const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Client } = require('../apps/api/node_modules/pg');
const state = require('../node_modules/.cache/interface-qa/state.json');
const fixture = require('../node_modules/.cache/interface-qa/fixture.json');
if (!/^ktb_interface_qa_[a-z0-9_]+$/.test(state.database))
  throw Error('Disposable QA database required');
const db = new Client({
  host: '127.0.0.1',
  port: state.port,
  user: 'ktb_interface_qa',
  database: state.database,
});
(async () => {
  await db.connect();
  const checks = [];
  const check = (name, value) => {
    assert.ok(value, name);
    checks.push(name);
  };
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const [organization] = await query(
    "SELECT o.status,b.app_display_name,b.version FROM organizations o JOIN organization_branding b ON b.organization_id=o.id WHERE o.code='QA_LIVE_WEB'",
  );
  check('organization status persisted', organization?.status === 'SUSPENDED');
  check(
    'branding update persisted',
    organization?.app_display_name === 'QA Updated App' && organization.version === 2,
  );
  const members = await query(
    'SELECT organization_id,status,membership_number FROM organization_memberships WHERE user_id=$1',
    [fixture.people.applicant.user],
  );
  check(
    'first tenant application approved with a real number',
    members.some(
      (m) => m.organization_id === fixture.org && m.status === 'APPROVED' && m.membership_number,
    ),
  );
  check(
    'second tenant membership remains independently rejected',
    members.some((m) => m.organization_id === fixture.orgB && m.status === 'REJECTED'),
  );
  const documents = await query(
    'SELECT review_status FROM membership_documents WHERE membership_id=$1',
    [fixture.people.applicant.membership],
  );
  check(
    'document review persisted',
    documents.some((d) => d.review_status === 'APPROVED'),
  );
  const roles = await query(
    'SELECT role,status FROM membership_role_grants WHERE membership_id=$1',
    [fixture.people.applicant.membership],
  );
  check(
    'approved initial role remains active',
    roles.some((r) => r.role === 'VOLUNTEER' && r.status === 'ACTIVE'),
  );
  check(
    'temporary test role was revoked',
    roles.some((r) => r.role === 'CAREGIVER' && r.status === 'REVOKED') &&
      !roles.some((r) => r.role === 'CAREGIVER' && r.status === 'ACTIVE'),
  );
  const restrictions = await query(
    'SELECT status,resolution_notes FROM global_account_restrictions WHERE user_id=$1 AND reason_code=$2',
    [fixture.people.applicant.user, 'QA_INTERFACE_TEST'],
  );
  check(
    'test restriction resolved with notes',
    restrictions.some((r) => r.status === 'RESOLVED' && r.resolution_notes),
  );
  const [user] = await query('SELECT status FROM users WHERE id=$1', [
    fixture.people.applicant.user,
  ]);
  check('fictional account restored to active', user.status === 'ACTIVE');
  const events = await query('SELECT DISTINCT event_type FROM audit_events');
  const eventTypes = new Set(events.map((e) => e.event_type));
  check(
    'all administrative changes have real audit records',
    [
      'ORGANIZATION_CREATED',
      'ORGANIZATION_BRANDING_UPDATED',
      'ORGANIZATION_STATUS_CHANGED',
      'MEMBERSHIP_APPROVED',
      'MEMBERSHIP_REJECTED',
      'MEMBERSHIP_DOCUMENT_REVIEWED',
      'MEMBERSHIP_ROLE_GRANTED',
      'MEMBERSHIP_ROLE_REVOKED',
      'GLOBAL_RESTRICTION_IMPOSED',
      'GLOBAL_RESTRICTION_RESOLVED',
    ].every((type) => eventTypes.has(type)),
  );
  const result = { passed: checks.length, checks };
  fs.writeFileSync(
    'node_modules/.cache/interface-qa/admin-ui-results.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
