// Read-only assertions after integration_test/live_api_test.dart completes.
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
  await db.query('BEGIN READ ONLY');
  const checks = [];
  const check = (name, value) => {
    assert.ok(value, name);
    checks.push(name);
  };
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  const requests = await rows('SELECT id FROM service_requests WHERE organization_id=$1', [
    fixture.org,
  ]);
  check('native flow created two actual requests', requests.length === 2);
  const assignments = await rows(
    'SELECT status,accepted_at,reschedule_id FROM volunteer_assignments WHERE organization_id=$1 AND volunteer_membership_id=$2',
    [fixture.org, fixture.people.volunteer.membership],
  );
  check(
    'old native commitments remain cancelled',
    assignments.filter((a) => a.status === 'CANCELLED').length === 2,
  );
  check(
    'reconfirmed commitment was accepted then withdrawn',
    assignments.some((a) => a.status === 'WITHDRAWN' && a.accepted_at && a.reschedule_id),
  );
  check(
    'second request offer was declined',
    assignments.some((a) => a.status === 'DECLINED'),
  );
  const changes = await rows('SELECT id FROM request_reschedules WHERE organization_id=$1', [
    fixture.org,
  ]);
  check('both native reschedules persisted', changes.length === 2);
  const [availability] = await rows(
    'SELECT max_travel_radius_km FROM volunteer_availabilities WHERE membership_id=$1',
    [fixture.people.volunteer.membership],
  );
  check(
    'availability radius persisted as numeric 3.5',
    Number(availability?.max_travel_radius_km) === 3.5,
  );
  const [applicant] = await rows('SELECT status FROM organization_memberships WHERE id=$1', [
    fixture.people.applicant.membership,
  ]);
  check('pending applicant remains unapproved', applicant?.status === 'APPLIED');
  const documents = await rows(
    "SELECT id FROM membership_documents WHERE membership_id=$1 AND storage_key='qa/fictional-reference.pdf' AND document_type='ADDRESS_PROOF' AND review_status='PENDING'",
    [fixture.people.applicant.membership],
  );
  check('native document submission remains pending review', documents.length >= 2);
  await db.query('ROLLBACK');
  fs.writeFileSync(
    'node_modules/.cache/interface-qa/native-verification.json',
    JSON.stringify({ passed: checks.length, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.end());
