// Fills the disposable interface-QA database with realistic sample activity.
// Members and services go in directly; requests, assignments and confirmations go
// through the running API so statuses, ledgers and wallets follow the real rules.
// Usage (after start-interface-qa.ps1, which turns on mock OTP with its fixed code):
//   node scripts/seed-demo-data.cjs
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const { DataSource } = req('typeorm');

const qaRoot = path.resolve(__dirname, '../node_modules/.cache/interface-qa');
const state = require(path.join(qaRoot, 'state.json'));
const fixture = require(path.join(qaRoot, 'fixture.json'));
const API = process.env.SEED_API_URL ?? `http://127.0.0.1:${state.apiPort ?? 3001}/api`;
const OTP = process.env.SEED_OTP ?? '123456';
if (!/^ktb_interface_qa_[a-z0-9_]+$/.test(state.database))
  throw new Error('Seeding is only allowed on the disposable interface-QA database');

const db = new DataSource({
  type: 'postgres',
  url: `postgresql://ktb_interface_qa@127.0.0.1:${state.port}/${state.database}`,
});
const org = fixture.org;
const tokens = {};

async function call(method, route, token, body) {
  const res = await fetch(API + route, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = Array.isArray(data.message) ? data.message.join('; ') : data.message;
    throw new Error(`${method} ${route} → ${res.status} ${message}`);
  }
  return data;
}

async function login(phone) {
  if (tokens[phone]) return tokens[phone];
  await call('POST', '/auth/otp/request', null, { phone });
  const session = await call('POST', '/auth/otp/verify', null, { phone, code: OTP });
  return (tokens[phone] = session.accessToken);
}

const id = async (sql, args = []) => (await db.query(sql, args))[0].id;
const at = (days, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const SERVICES = [
  ['ELDER_CARE', 'Elder care', 'വയോജന പരിചരണം', [
    ['HOSPITAL_ESCORT', 'Hospital visit escort', 'ആശുപത്രി സന്ദർശനം', 'Go with a member to the doctor, pharmacy or lab.'],
    ['COMPANIONSHIP', 'Companionship visit', 'കൂട്ടിരിപ്പ്', 'Spend time talking, reading or walking with a member.'],
    ['MEDICINE_PICKUP', 'Medicine pickup', 'മരുന്ന് വാങ്ങൽ', 'Collect prescribed medicines and deliver them home.'],
  ]],
  ['HOUSEHOLD', 'Household help', 'വീട്ടുജോലി സഹായം', [
    ['GROCERY_SHOPPING', 'Grocery shopping', 'പലചരക്ക് വാങ്ങൽ', 'Buy and deliver groceries from a list.'],
    ['MINOR_REPAIRS', 'Minor home repairs', 'ചെറിയ അറ്റകുറ്റപ്പണികൾ', 'Fix taps, fans, switches and small fittings.'],
    ['GARDENING', 'Gardening help', 'തോട്ടപ്പണി', 'Weeding, planting and watering the kitchen garden.'],
  ]],
  ['LEARNING', 'Learning & digital help', 'പഠനവും ഡിജിറ്റൽ സഹായവും', [
    ['TUTORING', 'School tutoring', 'ട്യൂഷൻ', 'Help a student with homework or exam revision.'],
    ['PHONE_HELP', 'Smartphone & online help', 'ഫോൺ സഹായം', 'Video calls, UPI, online forms and app setup.'],
  ]],
];

const WARDS = [
  ['Near Arya Vaidya Sala, Kottakkal', '7', 'Opposite the main gate'],
  ['Changuvetty Junction, Kottakkal', '12', 'Behind the bus stop'],
  ['Puthur Road, Kottakkal', '3', 'Green gate next to the mosque'],
  ['Indianoor, Kottakkal', '18', 'Near the LP school'],
  ['Edarikode Road, Kottakkal', '22', 'Two houses after the temple'],
  ['Kavathikalam, Kottakkal', '9', 'Near the ration shop'],
];

(async () => {
  await db.initialize();
  console.log('Adding communities, services and members…');
  await db.query("UPDATE organizations SET name='Kottakkal Municipality', district='Malappuram' WHERE id=$1", [org]);
  await db.query("UPDATE organizations SET name='Malappuram Municipality', district='Malappuram' WHERE id=$1", [fixture.orgB]);

  const catalogue = {};
  let order = 1;
  for (const [code, en, ml, services] of SERVICES) {
    const category = await id(
      'INSERT INTO service_categories(code,name_en,name_ml,display_order) VALUES($1,$2,$3,$4) RETURNING id',
      [code, en, ml, order++],
    );
    for (const [sCode, sEn, sMl, desc] of services) {
      const global = await id(
        'INSERT INTO global_service_definitions(category_id,code,name_en,name_ml,description_en) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [category, sCode, sEn, sMl, desc],
      );
      catalogue[sCode] = await id(
        'INSERT INTO organization_service_catalog(organization_id,global_service_id) VALUES($1,$2) RETURNING id',
        [org, global],
      );
    }
  }

  const { coordinator, admin } = fixture.people;
  const addMember = async (phone, number, role, { verified = false, beneficiary = false } = {}) => {
    const user = await id('INSERT INTO users(phone_e164,primary_org_id) VALUES($1,$2) RETURNING id', [phone, org]);
    const membership = await id(
      "INSERT INTO organization_memberships(organization_id,user_id,status,membership_number) VALUES($1,$2,'APPROVED',$3) RETURNING id",
      [org, user, number],
    );
    await db.query('INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,$2,$3)', [membership, role, coordinator.user]);
    if (verified)
      await db.query("INSERT INTO verified_identities(user_id,verification_status) VALUES($1,'VERIFIED')", [user]);
    if (beneficiary)
      await db.query(
        "INSERT INTO beneficiary_eligibilities(organization_id,membership_id,review_due_at,approved_by_user_id,monthly_request_quota) VALUES($1,$2,NOW()+interval '1 year',$3,50)",
        [org, membership, coordinator.user],
      );
    return { user, membership, phone };
  };

  const volunteers = [{ ...fixture.people.volunteer }];
  for (let i = 1; i <= 8; i++)
    volunteers.push(await addMember(`+9190000002${String(i).padStart(2, '0')}`, `KTB-V-${100 + i}`, 'VOLUNTEER', { verified: true }));
  const beneficiaries = [{ ...fixture.people.beneficiary }];
  for (let i = 1; i <= 6; i++)
    beneficiaries.push(await addMember(`+9190000003${String(i).padStart(2, '0')}`, `KTB-B-${200 + i}`, 'BENEFICIARY', { beneficiary: true }));
  for (let i = 1; i <= 4; i++) {
    const user = await id('INSERT INTO users(phone_e164,primary_org_id) VALUES($1,$2) RETURNING id', [`+9190000004${String(i).padStart(2, '0')}`, org]);
    await db.query("INSERT INTO organization_memberships(organization_id,user_id,status) VALUES($1,$2,'APPLIED')", [org, user]);
  }
  for (const [i, v] of volunteers.entries()) {
    const [addr, ward] = WARDS[i % WARDS.length];
    await db.query(
      'INSERT INTO volunteer_availabilities(organization_id,membership_id,is_available_immediate,max_travel_radius_km,preferred_ward_numbers,residential_address_text,residential_ward_number,residential_postal_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [org, v.membership, i % 3 !== 2, [3, 5, 8, 10][i % 4], JSON.stringify([ward, WARDS[(i + 1) % WARDS.length][1]]), addr, ward, '676503'],
    );
  }

  const coordToken = await login(coordinator.phone);
  const svc = Object.keys(catalogue);
  let n = 0;
  const results = { open: 0, matched: 0, inProgress: 0, awaiting: 0, completed: 0, cancelled: 0, failed: 0 };

  const create = async (beneficiary, startIso, service, minutes, notes, urgency = 'SCHEDULED') => {
    const [addr, ward, landmark] = WARDS[n++ % WARDS.length];
    return call('POST', `/organizations/${org}/requests`, await login(beneficiary.phone), {
      serviceCatalogId: catalogue[service],
      idempotencyKey: crypto.randomUUID(),
      urgency,
      scheduledStartTime: startIso,
      expectedDurationMinutes: minutes,
      locationAddressText: addr,
      locationWardNumber: ward,
      locationLandmark: landmark,
      locationPostalCode: '676503',
      beneficiaryNotes: notes,
    });
  };
  const dispatch = async (request, volunteer) => {
    const a = await call('POST', `/organizations/${org}/requests/${request.id}/dispatch`, coordToken, {
      volunteerMembershipId: volunteer.membership,
      dispatchNotes: 'Assigned by the ward coordinator',
    });
    return a.assignment ?? a;
  };
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      results.failed++;
      console.warn(`  ✗ ${label}: ${error.message}`);
    }
  };
  const vol = (i) => volunteers[i % volunteers.length];
  const ben = (i) => beneficiaries[i % beneficiaries.length];

  console.log('Creating completed help with confirmed time credits…');
  const done = [
    ['HOSPITAL_ESCORT', 120, 'Eye check-up at Taluk hospital', 'Waited with her at the OP counter and the pharmacy.'],
    ['GROCERY_SHOPPING', 60, 'Weekly vegetables and rice', 'Bought everything on the list from the market.'],
    ['COMPANIONSHIP', 90, 'Would love someone to read the newspaper with', 'Read the paper and went for a short walk.'],
    ['MINOR_REPAIRS', 45, 'Kitchen tap is leaking', 'Replaced the washer; no more leak.'],
    ['TUTORING', 60, 'Grandson needs help with class 8 maths', 'Covered fractions and two practice tests.'],
    ['PHONE_HELP', 30, 'Set up WhatsApp video calls to my daughter', 'Set up video calls and tested one with her daughter.'],
    ['MEDICINE_PICKUP', 30, 'Monthly BP medicines from Jan Aushadhi', 'Collected and delivered the medicines.'],
    ['GARDENING', 90, 'Plant the new vegetable seedlings', 'Planted tomato and chilli seedlings and watered them.'],
    ['HOSPITAL_ESCORT', 150, 'Physiotherapy session at the Ayurveda hospital', 'Escorted there and back by autorickshaw.'],
    ['GROCERY_SHOPPING', 45, 'Milk, bread and fish', 'Delivered before noon.'],
  ];
  for (const [i, [service, minutes, note, finishNote]] of done.entries()) {
    await step(`completed ${service}`, async () => {
      const start = new Date(Date.now() - (i + 1) * 15 * 60_000 - 10 * 60_000).toISOString();
      const r = await create(ben(i), start, service, minutes, note);
      const a = await dispatch(r, vol(i));
      const vt = await login(vol(i).phone);
      await call('POST', `/organizations/${org}/assignments/${a.id}/start`, vt);
      await call('POST', `/organizations/${org}/assignments/${a.id}/finish`, vt, { minutes, notes: finishNote });
      await call('POST', `/organizations/${org}/requests/${r.id}/assignments/${a.id}/confirm`, await login(ben(i).phone), {});
      // Spread the history over the past weeks (display only; ledger amounts are unchanged).
      const past = at(-(i * 2 + 1), 9 + (i % 7));
      await db.query('UPDATE service_requests SET scheduled_start_time=$2 WHERE id=$1', [r.id, past]).catch(() => {});
      results.completed++;
    });
  }

  console.log('Creating help waiting for confirmation and help in progress…');
  for (const [i, [service, minutes, note]] of [
    ['COMPANIONSHIP', 60, 'Afternoon chat and tea'],
    ['MINOR_REPAIRS', 60, 'Ceiling fan is making noise'],
    ['PHONE_HELP', 45, 'Help paying the electricity bill online'],
  ].entries())
    await step(`awaiting ${service}`, async () => {
      const r = await create(ben(i + 1), new Date(Date.now() - 20 * 60_000).toISOString(), service, minutes, note);
      const a = await dispatch(r, vol(i + 3));
      const vt = await login(vol(i + 3).phone);
      await call('POST', `/organizations/${org}/assignments/${a.id}/start`, vt);
      await call('POST', `/organizations/${org}/assignments/${a.id}/finish`, vt, { minutes, notes: 'Done — please confirm.' });
      results.awaiting++;
    });
  for (const [i, [service, minutes, note]] of [
    ['HOSPITAL_ESCORT', 120, 'Dialysis appointment, needs help with the wheelchair'],
    ['GARDENING', 60, 'Clear the weeds around the coconut trees'],
  ].entries())
    await step(`in progress ${service}`, async () => {
      const r = await create(ben(i + 2), new Date(Date.now() + 5 * 60_000).toISOString(), service, minutes, note);
      const a = await dispatch(r, vol(i + 6));
      await call('POST', `/organizations/${org}/assignments/${a.id}/start`, await login(vol(i + 6).phone));
      results.inProgress++;
    });

  console.log('Creating upcoming matched and open requests…');
  for (const [i, [service, days, hour, minutes, note]] of [
    ['HOSPITAL_ESCORT', 1, 9, 120, 'Diabetes check-up at Kottakkal Almas hospital'],
    ['GROCERY_SHOPPING', 1, 17, 60, 'Onam provisions list ready'],
    ['TUTORING', 2, 16, 60, 'Class 10 English grammar revision'],
    ['COMPANIONSHIP', 3, 11, 90, 'Lives alone; would enjoy a visit'],
    ['MEDICINE_PICKUP', 2, 10, 30, 'Insulin from the medical store'],
  ].entries())
    await step(`matched ${service}`, async () => {
      const r = await create(ben(i), at(days, hour), service, minutes, note);
      await dispatch(r, vol(i));
      results.matched++;
    });
  for (const [i, [service, days, hour, minutes, note, urgency]] of [
    ['MINOR_REPAIRS', 2, 10, 60, 'Bathroom door latch is broken'],
    ['PHONE_HELP', 3, 15, 45, 'Apply for the pension mustering online'],
    ['GARDENING', 4, 8, 120, 'Prepare the plot for banana saplings'],
    ['HOSPITAL_ESCORT', 5, 9, 180, 'Cataract surgery follow-up in Malappuram'],
    ['GROCERY_SHOPPING', 1, 11, 45, 'Out of rice and cooking oil', 'IMMEDIATE'],
    ['TUTORING', 6, 17, 90, 'Plus one physics doubts'],
    ['COMPANIONSHIP', 4, 16, 60, 'Evening walk to the temple'],
    ['MEDICINE_PICKUP', 3, 12, 30, 'Ayurvedic medicines from Arya Vaidya Sala'],
  ].entries())
    await step(`open ${service}`, async () => {
      await create(ben(i + 1), urgency === 'IMMEDIATE' ? new Date(Date.now() + 30 * 60_000).toISOString() : at(days, hour), service, minutes, note, urgency);
      results.open++;
    });

  console.log('Creating cancelled requests…');
  for (const [i, [service, reason, notes]] of [
    ['HOSPITAL_ESCORT', 'BENEFICIARY_UNWELL', 'Doctor appointment was moved to next week'],
    ['GARDENING', 'NO_LONGER_NEEDED', 'My son is visiting and will do it'],
  ].entries())
    await step(`cancel ${service}`, async () => {
      const r = await create(ben(i + 3), at(i + 2, 14), service, 60, 'Planned help');
      await call('POST', `/organizations/${org}/requests/${r.id}/cancel`, await login(ben(i + 3).phone), { reasonCode: reason, notes });
      results.cancelled++;
    });

  console.log('\nSeed summary:', results);
  console.log('Volunteers: +919000000103 and +9190000002 01–08 · Beneficiaries: +919000000102 and +9190000003 01–06');
  console.log('Pending applicants: +9190000004 01–04');
})()
  .finally(() => db.destroy())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
