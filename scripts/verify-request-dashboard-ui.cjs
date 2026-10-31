// Read-only verification after the browser workflow in docs/COORDINATOR_REQUESTS.md.
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
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const rows = await query(
    'SELECT * FROM service_requests WHERE organization_id=$1 AND beneficiary_notes=$2',
    [fixture.org, 'Local request workflow QA'],
  );
  check('browser created exactly one request', rows.length === 1);
  const request = rows[0];
  check(
    'coordinator created on behalf of the selected beneficiary',
    request.created_by_user_id === fixture.people.coordinator.user &&
      request.beneficiary_membership_id === fixture.people.beneficiary.membership &&
      request.creation_channel === 'COORDINATOR_ON_BEHALF',
  );
  check(
    'India noon persisted as 06:30 UTC',
    request.scheduled_start_time.toISOString() === '2030-01-01T06:30:00.000Z',
  );
  check(
    'manual address and ward persisted',
    request.location_address_text === 'Fictional QA community centre' &&
      request.location_ward_number === '1',
  );
  check(
    'search expanded to tier two',
    request.matching_tier === 2 && Number(request.matching_radius_km) === 7,
  );
  const history = await query('SELECT * FROM request_reschedules WHERE service_request_id=$1', [
    request.id,
  ]);
  check(
    'single reschedule retained both times and reason',
    history.length === 1 &&
      history[0].previous_start_time.toISOString() === '2030-01-01T04:30:00.000Z' &&
      history[0].reason === 'Fictional QA time change',
  );
  const assignments = await query(
    'SELECT * FROM volunteer_assignments WHERE service_request_id=$1 ORDER BY offered_at',
    [request.id],
  );
  check(
    'old and new commitment IDs remain distinct',
    assignments.length === 2 && assignments[0].id !== assignments[1].id,
  );
  check(
    'old commitment was accepted before being cancelled',
    assignments[0].status === 'CANCELLED' &&
      assignments[0].accepted_at &&
      !assignments[0].reschedule_id,
  );
  check(
    'new commitment was accepted only after reconfirmation',
    assignments[1].accepted_at &&
      assignments[1].reschedule_id === history[0].id &&
      assignments[1].accepted_at >= history[0].created_at,
  );
  check(
    'final cancellation cleared remaining commitments',
    request.status === 'CANCELLED' && assignments.every((a) => a.status === 'CANCELLED'),
  );
  const cancellations = await query(
    'SELECT * FROM request_cancellations WHERE service_request_id=$1',
    [request.id],
  );
  check(
    'cancellation retained coordinator and explanation',
    cancellations.length === 1 &&
      cancellations[0].cancelled_by_user_id === fixture.people.coordinator.user &&
      cancellations[0].reason_code === 'QA_COMPLETE',
  );
  const events = await query(
    'SELECT event_type FROM audit_events WHERE organization_id=$1 AND (target_id=$2 OR target_id=ANY($3::uuid[]))',
    [fixture.org, request.id, assignments.map((a) => a.id)],
  );
  check(
    'creation, dispatch, reconfirmation and cancellation have audit records',
    [
      'SERVICE_REQUEST_CREATED',
      'COORDINATOR_DISPATCH_ASSIGNED',
      'SERVICE_REQUEST_RESCHEDULED',
      'SERVICE_REQUEST_CANCELLED',
    ].every((event) => events.some((row) => row.event_type === event)),
  );
  await db.query('ROLLBACK');
  fs.writeFileSync(
    'node_modules/.cache/interface-qa/request-ui-verification.json',
    JSON.stringify({ passed: checks.length, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.end());
