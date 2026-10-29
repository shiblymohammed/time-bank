// Destructive fixtures are restricted to a disposable loopback database named ktb_audit or ktb_test.
// Start the API against the same database with NODE_ENV=test before running this script.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('../apps/api/node_modules/pg');
const { CaregiverRelationshipType } = require('../packages/shared-types/dist');
const apiOrigin = process.env.AUDIT_API_URL || 'http://127.0.0.1:3001';
const databaseUrl = process.env.AUDIT_DATABASE_URL;
assert.ok(databaseUrl, 'AUDIT_DATABASE_URL is required');
const database = new URL(databaseUrl);
assert.ok(['/ktb_audit', '/ktb_test'].includes(database.pathname));
assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname));
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(apiOrigin).hostname));
const calls = [];
let admin;
async function call(method, path, body, session = admin, expected) {
  const response = await fetch(`${apiOrigin}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  calls.push({ method, path: path.split('?')[0], status: response.status });
  if (expected)
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
  else assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
async function login() {
  const phone = `+916${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  const otp = await call('POST', '/api/auth/otp/request', { phone }, null);
  assert.match(otp.devOtp, /^\d{6}$/, 'Audit API must run outside production');
  return call('POST', '/api/auth/otp/verify', { phone, code: otp.devOtp }, null);
}
async function main() {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await call('GET', '/api/health/live', undefined, null);
    await call('GET', '/api/health/ready', undefined, null);
    admin = await login();
    const seedOrg = randomUUID(),
      seedMembership = randomUUID();
    await db.query(
      `INSERT INTO organizations(id,code,name,district) VALUES($1,$2,'Audit seed','Test')`,
      [seedOrg, `AUDIT_${seedOrg.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO organization_memberships(id,organization_id,user_id,status) VALUES($1,$2,$3,'APPROVED')`,
      [seedMembership, seedOrg, admin.user.id],
    );
    await db.query(
      `INSERT INTO membership_role_grants(membership_id,role,status,granted_by) VALUES($1,'SUPER_ADMIN','ACTIVE',$2)`,
      [seedMembership, admin.user.id],
    );
    const refreshed = await call('POST', '/api/auth/refresh', { refreshToken: admin.refreshToken });
    admin.accessToken = refreshed.accessToken;
    await call('GET', '/api/auth/me');
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const org = (
      await call('POST', '/api/v1/organizations', {
        code: `AUDIT_${suffix}`,
        name: 'Audit municipality',
        type: 'MUNICIPALITY',
        district: 'Test',
      })
    ).data;
    const orgPath = `/api/v1/organizations/${org.id}`,
      base = `/api/organizations/${org.id}`;
    await call('GET', '/api/v1/organizations', undefined, null);
    await call('GET', orgPath, undefined, null);
    await call('PATCH', orgPath, { name: 'Audit municipality updated' });
    await call('GET', `${orgPath}/branding`, undefined, null);
    await call('PUT', `${orgPath}/branding`, {
      appDisplayName: 'Audit Time Bank',
      primaryColor: '#123456',
    });
    await call('POST', `${orgPath}/app-builds`, {
      applicationId: `in.audit.${suffix.toLowerCase()}`,
      platform: 'ANDROID',
      buildVersion: '1.0.0',
    });
    await call('GET', `${orgPath}/app-builds`, undefined, null);
    const ben = await login(),
      vol = await login(),
      caregiver = await login();
    const memberships = [];
    for (const [session, role] of [
      [ben, 'BENEFICIARY'],
      [vol, 'VOLUNTEER'],
      [caregiver, 'CAREGIVER'],
    ]) {
      let membership = await call(
        'POST',
        `${base}/memberships/apply`,
        { notes: 'Audit application' },
        session,
      );
      if (role === 'CAREGIVER') {
        await call('POST', `${base}/memberships/${membership.id}/reject`, {
          reason: 'Audit rejection',
        });
        membership = await call('POST', `${base}/memberships/apply`, {}, session);
      }
      await call('POST', `${base}/memberships/${membership.id}/approve`, { initialRole: role });
      memberships.push(membership.id);
    }
    const [benId, volId, caregiverId] = memberships;
    await call('GET', `${base}/memberships?limit=100&offset=0`);
    await call('GET', `${base}/memberships/${benId}`);
    const doc = await call(
      'POST',
      `${base}/memberships/${benId}/documents`,
      { documentType: 'RESIDENCE', storageKey: 'audit/reference-only' },
      ben,
    );
    await call('PATCH', `${base}/memberships/documents/${doc.id}/review`, {
      status: 'APPROVED',
      notes: 'Audit evidence',
    });
    const grant = await call('POST', `${base}/memberships/${volId}/roles`, { role: 'MERCHANT' });
    await call('DELETE', `${base}/memberships/${volId}/roles/${grant.id}`, {
      reason: 'Audit cleanup',
    });
    await call('POST', `${base}/memberships/${volId}/roles`, { role: 'SUPER_ADMIN' }, admin, 403);
    const appointment = await call('POST', `/api/admin/organizations/${org.id}/roles`, {
      userId: caregiver.user.id,
      role: 'COORDINATOR',
    });
    await call('DELETE', `/api/admin/organizations/${org.id}/roles/${appointment.id}`, {
      reason: 'Audit cleanup',
    });
    const category = await call('POST', '/api/catalogue/categories', {
      code: `AUDIT_${suffix}`,
      nameEn: 'Audit care',
      nameMl: 'സഹായം',
    });
    await call('PATCH', `/api/catalogue/categories/${category.id}`, {
      nameEn: 'Audit care updated',
    });
    await call('GET', '/api/catalogue/categories', undefined, null);
    const service = await call('POST', '/api/catalogue/global', {
      categoryId: category.id,
      code: `AUDIT_${suffix}`,
      nameEn: 'Audit assistance',
      nameMl: 'സഹായം',
      defaultMinVolunteers: 1,
      defaultPreferredVolunteers: 1,
    });
    await call('PATCH', `/api/catalogue/global/${service.id}`, {
      descriptionEn: 'Audit service description',
    });
    await call('GET', '/api/catalogue/global', undefined, null);
    await call('GET', `/api/catalogue/global/${service.id}`, undefined, null);
    const catalogue = await call('POST', `${base}/catalogue/configure`, {
      globalServiceId: service.id,
    });
    await call('GET', `${base}/catalogue`, undefined, ben);
    await call('GET', `${base}/catalogue/${catalogue.id}`, undefined, ben);
    const proposal = await call('POST', `${base}/catalogue/proposals`, {
      categoryId: category.id,
      proposedName: 'Audit proposal',
      description: 'Audit proposal description',
      justification: 'Audit proposal justification',
    });
    await call('GET', `${base}/catalogue/proposals`);
    await call('GET', '/api/catalogue/proposals');
    await call('PATCH', `/api/catalogue/proposals/${proposal.id}/review`, {
      status: 'REJECTED',
      rejectionReason: 'Audit cleanup',
    });
    await call('POST', `${base}/beneficiaries/eligibility`, {
      membershipId: benId,
      eligibilityType: 'ONGOING',
      reviewDueAt: new Date(Date.now() + 365 * 86400000).toISOString(),
      approvedAssistanceCategories: ['*'],
      monthlyRequestQuota: 100,
    });
    await call('GET', `${base}/beneficiaries/${benId}/eligibility`, undefined, ben);
    const authorization = await call(
      'POST',
      `${base}/caregivers/authorize`,
      {
        beneficiaryMembershipId: benId,
        caregiverMembershipId: caregiverId,
        relationshipType: Object.values(CaregiverRelationshipType)[0],
      },
      caregiver,
    );
    await call('PATCH', `${base}/caregivers/${authorization.id}/review`, { status: 'APPROVED' });
    await call('GET', `${base}/caregivers/mine`, undefined, caregiver);
    await call('GET', `${base}/beneficiaries/${benId}/caregivers`, undefined, ben);
    const zone = await call('POST', `${base}/zones`, {
      code: `AUDIT_${suffix}`,
      name: 'Audit ward',
      wardNumbers: ['14'],
    });
    await call('GET', `${base}/zones`);
    await call('GET', `${base}/zones/${zone.id}`);
    await call('PUT', `${base}/zones/${zone.id}`, { description: 'Audit zone update' });
    await call('POST', `${base}/zones/${zone.id}/volunteers`, { membershipId: volId });
    await call('GET', `${base}/volunteers/${volId}/zones`, undefined, vol);
    await call(
      'PUT',
      `${base}/volunteers/${volId}/availability`,
      { isAvailableImmediate: true, maxTravelRadiusKm: 3.5, preferredWardNumbers: ['14'] },
      vol,
    );
    await call('GET', `${base}/volunteers/${volId}/availability`, undefined, vol);
    await call('POST', `${base}/volunteers/skills/verify`, {
      membershipId: volId,
      skillCode: 'AUDIT',
      status: 'VERIFIED',
    });
    await call('GET', `${base}/volunteers/${volId}/skills`, undefined, vol);
    const requestBody = {
      serviceCatalogId: catalogue.id,
      urgency: 'SCHEDULED',
      scheduledStartTime: new Date(Date.now() + 86400000).toISOString(),
      locationAddressText: 'Audit service address',
      locationWardNumber: '14',
      locationPostalCode: '676503',
    };
    const req = await call('POST', `${base}/requests`, requestBody, ben);
    await call('GET', `${base}/requests?page=1&limit=20`, undefined, ben);
    await call('GET', `${base}/requests/${req.id}`, undefined, ben);
    const offers = await call('GET', `${base}/assignments/mine`, undefined, vol);
    const offer = offers.find((o) => o.serviceRequestId === req.id && o.status === 'OFFERED');
    assert.ok(offer, 'Matching must create a discoverable volunteer offer');
    await call(
      'POST',
      `${base}/assignments/${offer.id}/accept`,
      { clientOperationId: randomUUID() },
      vol,
    );
    await call(
      'POST',
      `${base}/assignments/${offer.id}/withdraw`,
      { withdrawalReason: 'Audit withdrawal' },
      vol,
    );
    await call(
      'POST',
      `${base}/requests/${req.id}/reschedule`,
      {
        newStartTime: new Date(Date.now() + 2 * 86400000).toISOString(),
        reason: 'Audit reschedule',
      },
      ben,
    );
    const newOffers = await call('GET', `${base}/assignments/mine`, undefined, vol);
    const nextOffer = newOffers.find(
      (o) => o.serviceRequestId === req.id && o.status === 'OFFERED',
    );
    assert.ok(nextOffer, 'Rescheduling must create a fresh offer');
    await call(
      'POST',
      `${base}/assignments/${nextOffer.id}/decline`,
      { declineReason: 'Audit decline' },
      vol,
    );
    await call('POST', `${base}/requests/${req.id}/expand-radius`, {});
    await call('POST', `${base}/requests/${req.id}/progression`, {});
    await call('POST', `${base}/requests/${req.id}/dispatch`, {
      volunteerMembershipId: volId,
      dispatchNotes: 'Audit assignment',
    });
    await call(
      'POST',
      `${base}/requests/${req.id}/cancel`,
      { reasonCode: 'AUDIT', notes: 'Audit cleanup' },
      ben,
    );
    await call('DELETE', `${base}/zones/${zone.id}/volunteers/${volId}`);
    await call('GET', '/api/admin/overview');
    const restriction = await call('POST', '/api/admin/restrictions', {
      userId: vol.user.id,
      restrictionType: 'TEMPORARY_SUSPENSION',
      reasonCode: 'AUDIT',
    });
    await call('GET', '/api/admin/restrictions');
    await call('GET', `${base}/volunteers/${volId}/availability`, undefined, vol, 403);
    await call('POST', `/api/admin/restrictions/${restriction.id}/resolve`, {
      resolutionNotes: 'Audit clearance',
    });
    await call('GET', '/api/admin/audit-logs?limit=100&offset=0');
    await call('PATCH', `/api/admin/organizations/${org.id}/status`, {
      status: 'SUSPENDED',
      reason: 'Audit lifecycle',
    });
    await call('PATCH', `/api/admin/organizations/${org.id}/status`, {
      status: 'ACTIVE',
      reason: 'Audit lifecycle',
    });
    await call('POST', '/api/auth/logout', { refreshToken: vol.refreshToken }, vol);
    await call('POST', '/api/auth/refresh', { refreshToken: vol.refreshToken }, null, 401);
    const document = await (await fetch(`${apiOrigin}/api/docs-json`)).json();
    const endpoints = Object.entries(document.paths).flatMap(([path, operations]) =>
      Object.keys(operations)
        .filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m))
        .map((method) => ({ method: method.toUpperCase(), path })),
    );
    const missing = endpoints.filter(
      (endpoint) =>
        !calls.some(
          (c) =>
            c.method === endpoint.method &&
            new RegExp(`^${endpoint.path.replace(/\{[^}]+\}/g, '[^/]+')}/?$`).test(c.path),
        ),
    );
    console.log(
      JSON.stringify(
        {
          requests: calls.length,
          endpoints: endpoints.length,
          covered: endpoints.length - missing.length,
          missing,
        },
        null,
        2,
      ),
    );
    assert.deepEqual(missing, [], 'Every documented endpoint must be exercised');
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
