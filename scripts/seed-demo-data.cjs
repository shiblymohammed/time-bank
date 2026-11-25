// Fills the disposable interface-QA database with realistic sample activity.
// Members and services go in directly; requests, assignments and confirmations go
// through the running API so statuses, ledgers and wallets follow the real rules.
// Usage (after start-interface-qa.ps1, which turns on mock OTP with its fixed code):
//   node scripts/seed-demo-data.cjs
// To populate the Desktop checkout's local ktb_dev database and API:
//   node scripts/seed-demo-data.cjs --desktop
// For an existing complete QA setup, DEMO_ACTIVITY_ONLY=true adds the optional
// contribution, donation and post examples without replaying the base fixtures.
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const { DataSource } = req('typeorm');
const desktop = process.argv.includes('--desktop');
const { desktopConfig, desktopFixture, seedDesktopScreens } = require('./desktop-demo-fixture.cjs');

// Override only for another disposable local QA run, never for a deployed database.
const qaRoot = path.resolve(
  process.env.DEMO_ARTIFACT_DIR ?? path.resolve(__dirname, '../node_modules/.cache/interface-qa'),
);
const state = desktop ? desktopConfig(req) : require(path.join(qaRoot, 'state.json'));
const API = desktop
  ? state.api
  : (process.env.SEED_API_URL ?? `http://127.0.0.1:${state.apiPort ?? 3001}/api`);
const OTP = desktop ? '123456' : process.env.SEED_OTP ?? '123456';
const ORGANIZATION_CODE = desktop ? 'LOCAL_QA' : process.env.DEMO_ORGANIZATION_CODE ?? 'KOTTAKKAL';
if (!desktop && !/^ktb_interface_qa_[a-z0-9_]+$/.test(state.database))
  throw new Error('Seeding is only allowed on the disposable interface-QA database');
if (!desktop && API !== `http://127.0.0.1:${state.apiPort ?? 3001}/api`)
  throw new Error('The seed API must match the loopback address recorded for the QA run');

const db = new DataSource({
  type: 'postgres',
  url: desktop ? state.databaseUrl : `postgresql://ktb_interface_qa@127.0.0.1:${state.port}/${state.database}`,
  connectTimeoutMS: 4000,
});
let org;
const tokens = {};

async function call(method, route, token, body, retries = 2) {
  const res = await fetch(API + route, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    if (res.status === 429 && desktop && retries > 0) {
      // Keep the API's configured limits in effect during bulk demo sign-ins.
      await new Promise((resolve) => setTimeout(resolve, 61000));
      return call(method, route, token, body, retries - 1);
    }
    const message = Array.isArray(data.message) ? data.message.join('; ') : data.message;
    throw new Error(`${method} ${route} → ${res.status} ${message}`);
  }
  return data;
}

async function login(phone) {
  if (tokens[phone]) return tokens[phone];
  const challenge = await call('POST', '/auth/otp/request', null, { phone });
  if (desktop && challenge.devOtp !== OTP) throw new Error('The Desktop API must use local mock OTP.');
  const session = await call('POST', '/auth/otp/verify', null, {
    phone,
    code: OTP,
    organizationCode: ORGANIZATION_CODE,
  });
  return (tokens[phone] = session.accessToken);
}

async function staffLogin(phone) {
  const token = await login(phone);
  const staffCode = await call('GET', '/auth/staff-code', token);
  if (staffCode.required && !staffCode.verified) {
    await call('POST', '/auth/staff-code/request', token);
    await call('POST', '/auth/staff-code/verify', token, { code: OTP });
  }
  return token;
}

const at = (days, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const SERVICES = [
  [
    'SKILL_SUPPORT',
    'Skill support',
    'കഴിവ് സഹായം',
    [
      [
        'DOCUMENT_HELP',
        'Forms & document help',
        'ഫോം സഹായം',
        'Help a member understand and complete everyday forms.',
      ],
      [
        'TRANSLATION_HELP',
        'Translation help',
        'വിവർത്തന സഹായം',
        'Help a member understand Malayalam or English information.',
      ],
    ],
  ],
  [
    'ELDER_CARE',
    'Elder care',
    'വയോജന പരിചരണം',
    [
      [
        'HOSPITAL_ESCORT',
        'Hospital visit escort',
        'ആശുപത്രി സന്ദർശനം',
        'Go with a member to the doctor, pharmacy or lab.',
      ],
      [
        'COMPANIONSHIP',
        'Companionship visit',
        'കൂട്ടിരിപ്പ്',
        'Spend time talking, reading or walking with a member.',
      ],
      [
        'MEDICINE_PICKUP',
        'Medicine pickup',
        'മരുന്ന് വാങ്ങൽ',
        'Collect prescribed medicines and deliver them home.',
      ],
    ],
  ],
  [
    'HOUSEHOLD',
    'Household help',
    'വീട്ടുജോലി സഹായം',
    [
      [
        'GROCERY_SHOPPING',
        'Grocery shopping',
        'പലചരക്ക് വാങ്ങൽ',
        'Buy and deliver groceries from a list.',
      ],
      [
        'MINOR_REPAIRS',
        'Minor home repairs',
        'ചെറിയ അറ്റകുറ്റപ്പണികൾ',
        'Fix taps, fans, switches and small fittings.',
      ],
      [
        'GARDENING',
        'Gardening help',
        'തോട്ടപ്പണി',
        'Weeding, planting and watering the kitchen garden.',
      ],
    ],
  ],
  [
    'LEARNING',
    'Learning & digital help',
    'പഠനവും ഡിജിറ്റൽ സഹായവും',
    [
      ['TUTORING', 'School tutoring', 'ട്യൂഷൻ', 'Help a student with homework or exam revision.'],
      [
        'PHONE_HELP',
        'Smartphone & online help',
        'ഫോൺ സഹായം',
        'Video calls, UPI, online forms and app setup.',
      ],
    ],
  ],
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
  const fixture = desktop ? await desktopFixture(db, API) : require(path.join(qaRoot, 'fixture.json'));
  org = fixture.org;
  const existing = await db.query(
    "SELECT (SELECT count(*) FROM service_requests WHERE organization_id=$1)::int AS requests, (SELECT count(*) FROM organization_service_catalog s JOIN global_service_definitions g ON g.id=s.global_service_id WHERE s.organization_id=$1 AND g.code='DOCUMENT_HELP')::int AS seeded_category, (SELECT count(*) FROM users WHERE primary_org_id=$1 AND phone_e164 LIKE '+9190000002%')::int AS seeded_volunteers, (SELECT count(*) FROM users WHERE primary_org_id=$1 AND phone_e164 LIKE '+9190000003%')::int AS seeded_recipients",
    [org],
  );
  const activityOnly = process.env.DEMO_ACTIVITY_ONLY === 'true';
  const resume = activityOnly || (desktop && existing[0].seeded_volunteers > 0) || process.env.DEMO_RESUME_PARTIAL === 'true';
  if (
    !resume &&
    (existing[0].requests ||
      existing[0].seeded_category ||
      existing[0].seeded_volunteers ||
      existing[0].seeded_recipients)
  )
    throw new Error(
      'This QA database contains a partial demo seed. Set DEMO_RESUME_PARTIAL=true only for the known local QA run.',
    );
  const catalogue = {};
  let staff = [],
    volunteers = [],
    beneficiaries = [],
    zones = [];
  const { coordinator, admin } = fixture.people;
  if (desktop) {
    const profile = await call('GET', '/auth/me', await login(coordinator.phone));
    if (profile.id !== coordinator.user) throw new Error('The running API uses a different database.');
  }
  if (resume) {
    if (!desktop) await db.query(
      "UPDATE organizations SET code=$2,name='Kottakkal Municipality',district='Malappuram' WHERE id=$1",
      [org, ORGANIZATION_CODE],
    );
    const rows = await db.query(
      `SELECT g.code,s.id catalog_id FROM organization_service_catalog s JOIN global_service_definitions g ON g.id=s.global_service_id WHERE s.organization_id=$1`,
      [org],
    );
    for (const r of rows) catalogue[r.code] = r.catalog_id;
    const members = await db.query(
      `SELECT u.phone_e164 phone,u.id user_id,m.id membership_id FROM users u JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=$1 WHERE u.primary_org_id=$1`,
      [org],
    );
    const byPhone = new Map(
      members.map((m) => [
        m.phone,
        { user: m.user_id, membership: m.membership_id, phone: m.phone },
      ]),
    );
    staff = ['+919000000151', '+919000000152', '+919000000153']
      .map((p) => byPhone.get(p))
      .filter(Boolean);
    volunteers = [
      fixture.people.volunteer,
      ...Array.from({ length: 19 }, (_, i) =>
        byPhone.get(`+9190000002${String(i + 1).padStart(2, '0')}`),
      ),
    ].filter(Boolean);
    beneficiaries = [
      fixture.people.beneficiary,
      ...Array.from({ length: 10 }, (_, i) =>
        byPhone.get(`+9190000003${String(i + 1).padStart(2, '0')}`),
      ),
    ].filter(Boolean);
    zones = (
      await db.query(
        'SELECT id FROM operational_zones WHERE organization_id=$1 AND is_active AND nearby_visible ORDER BY code',
        [org],
      )
    ).map((z) => z.id);
    if (
      staff.length !== 3 ||
      volunteers.length !== 20 ||
      beneficiaries.length !== 11 ||
      zones.length < 3
    ) {
      throw new Error(
        'Resume requires the full member, staff and Nearby setup from the first seed phase',
      );
    }
    console.log('Resuming the known partial Kottakkal demo seed…');
  } else await db.transaction(async (db) => {
    const id = async (sql, args = []) => {
      const [row] = await db.query(sql, args);
      if (!row) throw new Error('A demo account number is already in use outside this municipality.');
      return row.id;
    };
    console.log('Adding communities, services and members…');
    if (!desktop) await db.query(
      "UPDATE organizations SET code=$2,name='Kottakkal Municipality', district='Malappuram' WHERE id=$1",
      [org, ORGANIZATION_CODE],
    );

    let order = 1;
    for (const [code, en, ml, services] of SERVICES) {
      const category = await id(
        'INSERT INTO service_categories(code,name_en,name_ml,display_order) VALUES($1,$2,$3,$4) ON CONFLICT (code) DO UPDATE SET code=EXCLUDED.code RETURNING id',
        [code, en, ml, order++],
      );
      for (const [sCode, sEn, sMl, desc] of services) {
        const global = await id(
          'INSERT INTO global_service_definitions(category_id,code,name_en,name_ml,description_en) VALUES($1,$2,$3,$4,$5) ON CONFLICT (code) DO UPDATE SET code=EXCLUDED.code RETURNING id',
          [category, sCode, sEn, sMl, desc],
        );
        catalogue[sCode] = await id(
          'INSERT INTO organization_service_catalog(organization_id,global_service_id) VALUES($1,$2) RETURNING id',
          [org, global],
        );
      }
    }

    const addMember = async (
      phone,
      number,
      role,
      { verified = false, beneficiary = false, name = null, email = null } = {},
    ) => {
      const user = await id(
        'INSERT INTO users(phone_e164,primary_org_id,full_name,email) VALUES($1,$2,$3,$4) ON CONFLICT (phone_e164) DO UPDATE SET primary_org_id=$2 WHERE users.primary_org_id=$2 RETURNING id',
        [phone, org, name, email],
      );
      const membership = await id(
        "INSERT INTO organization_memberships(organization_id,user_id,status,membership_number) VALUES($1,$2,'APPROVED',$3) ON CONFLICT (organization_id,user_id) DO UPDATE SET membership_number=COALESCE(organization_memberships.membership_number,$3) RETURNING id",
        [org, user, number],
      );
      await db.query(
        'INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [membership, role, coordinator.user],
      );
      if (verified)
        await db.query(
          "INSERT INTO verified_identities(user_id,verification_status) VALUES($1,'VERIFIED') ON CONFLICT DO NOTHING",
          [user],
        );
      if (beneficiary)
        await db.query(
          "INSERT INTO beneficiary_eligibilities(organization_id,membership_id,review_due_at,approved_by_user_id,monthly_request_quota) VALUES($1,$2,NOW()+interval '1 year',$3,50) ON CONFLICT DO NOTHING",
          [org, membership, coordinator.user],
        );
      return { user, membership, phone };
    };

    const existingNames = [
      [fixture.people.coordinator.user, 'Anjali Menon'],
      [fixture.people.volunteer.user, 'Sandeep Varma'],
      [fixture.people.beneficiary.user, 'Leela Krishnan'],
      [fixture.people.caregiver.user, 'Maya Joseph'],
      [fixture.people.applicant.user, 'Nabeel Rahman'],
      [fixture.people.admin.user, 'Devika Nair'],
    ];
    for (const [user, name] of existingNames)
      await db.query('UPDATE users SET full_name=$2 WHERE id=$1', [user, name]);
    staff = [];
    staff.push(
      await addMember('+919000000151', 'KTB-C-151', 'COORDINATOR', {
        name: 'Fathima Basheer',
        email: 'fathima.coordinator@demo.kottakkal.test',
      }),
    );
    staff.push(
      await addMember('+919000000152', 'KTB-C-152', 'COORDINATOR', {
        name: 'Vivek Nambiar',
        email: 'vivek.coordinator@demo.kottakkal.test',
      }),
    );
    staff.push(
      await addMember('+919000000153', 'KTB-A-153', 'MUNICIPALITY_ADMIN', {
        name: 'Priya Nair',
        email: 'priya.admin@demo.kottakkal.test',
      }),
    );
    volunteers = [{ ...fixture.people.volunteer }];
    const volunteerNames = [
      'Asha Kumar',
      'Rahul Menon',
      'Farah Kareem',
      'Deepak Ravi',
      'Jithin Thomas',
      'Riya Suresh',
      'Nikhil Das',
      'Anoop Babu',
      'Sana Fathima',
      'Arjun Menon',
      'Neha Varma',
      'Shameer Ali',
      'Divya Raj',
      'Manu Thomas',
      'Hiba Basheer',
      'Vishnu Das',
      'Anila Joseph',
      'Riyas K',
      'Nandita P',
    ];
    for (let i = 1; i <= 19; i++)
      volunteers.push(
        await addMember(
          `+9190000002${String(i).padStart(2, '0')}`,
          `KTB-V-${100 + i}`,
          'VOLUNTEER',
          { verified: true, name: volunteerNames[i - 1] },
        ),
      );
    await db.query('UPDATE users SET email=$2 WHERE id=$1', [
      fixture.people.coordinator.user,
      'anjali.coordinator@demo.kottakkal.test',
    ]);
    await db.query('UPDATE users SET email=$2 WHERE id=$1', [
      fixture.people.admin.user,
      'devika.admin@demo.kottakkal.test',
    ]);
    const beneficiaryNames = [
      'Meera Pillai',
      'Padma Nair',
      'Ibrahim Kutty',
      'Roshni Mathew',
      'Sukumaran P',
      'Amina Basheer',
      'Lakshmi Amma',
      'Basheer K',
      'Mariam Ali',
      'Sreedevi Menon',
    ];
    beneficiaries = [{ ...fixture.people.beneficiary }];
    for (let i = 1; i <= 10; i++)
      beneficiaries.push(
        await addMember(
          `+9190000003${String(i).padStart(2, '0')}`,
          `KTB-B-${200 + i}`,
          'BENEFICIARY',
          { beneficiary: true, name: beneficiaryNames[i - 1] },
        ),
      );
    for (let i = 1; i <= 4; i++) {
      const applicantNames = ['Kavya Raj', 'Shanavas K', 'Nisha George', 'Arun Prasad'];
      const user = await id(
        'INSERT INTO users(phone_e164,primary_org_id,full_name) VALUES($1,$2,$3) RETURNING id',
        [`+9190000004${String(i).padStart(2, '0')}`, org, applicantNames[i - 1]],
      );
      await db.query(
        "INSERT INTO organization_memberships(organization_id,user_id,status) VALUES($1,$2,'APPLIED')",
        [org, user],
      );
    }
    for (const [i, v] of volunteers.entries()) {
      const [addr, ward] = WARDS[i % WARDS.length];
      await db.query(
        'INSERT INTO volunteer_availabilities(organization_id,membership_id,is_available_immediate,max_travel_radius_km,preferred_ward_numbers,residential_address_text,residential_ward_number,residential_postal_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          org,
          v.membership,
          i % 3 !== 2,
          [3, 5, 8, 10][i % 4],
          JSON.stringify([ward, WARDS[(i + 1) % WARDS.length][1]]),
          addr,
          ward,
          '676503',
        ],
      );
    }

    console.log('Setting up local recognition and ward areas…');
    await db.query(
      'INSERT INTO loyalty_policies(enabled,coins_per_hour,engagement_cap,campaign_cap_per_hour,milestones,created_by) SELECT true,20,100,10,$1::jsonb,$2 WHERE NOT EXISTS (SELECT 1 FROM loyalty_policies)',
      [
        JSON.stringify([
          { minutes: 120, name: 'Neighbourhood Helper', coins: 10 },
          { minutes: 300, name: 'Community Champion', coins: 25 },
          { minutes: 600, name: 'Timebank Star', coins: 50 },
        ]),
        coordinator.user,
      ],
    );
    await db.query(
      'INSERT INTO loyalty_programs(organization_id,enabled,leaderboard_enabled,updated_by) VALUES($1,true,true,$2)',
      [org, admin.user],
    );
    zones = [];
    for (const [code, name, wards, lat, lng] of [
      ['KOTTAKKAL_CENTRAL', 'Kottakkal Central', ['7', '12'], 10.998, 75.998],
      ['PUTHUR_INDIANOOR', 'Puthur & Indianoor', ['3', '18'], 11.006, 76.006],
      ['EDARIKODE_KAVATHIKALAM', 'Edarikode & Kavathikalam', ['22', '9'], 10.987, 75.987],
    ]) {
      const zone = await id(
        "INSERT INTO operational_zones(organization_id,code,name,description,ward_numbers,center_lat,center_lng,radius_km,is_active,nearby_visible,created_by_user_id) VALUES($1,$2,$3,'Approximate demo area; no household pin is shown',$4::jsonb,$5,$6,4,true,true,$7) RETURNING id",
        [org, code, name, JSON.stringify(wards), lat, lng, coordinator.user],
      );
      zones.push(zone);
    }
  });

  const coordToken = await staffLogin(coordinator.phone);
  await call('GET', `/organizations/${org}/community/nearby`, coordToken);
  let n = 0;
  const results = {
    open: 0,
    matched: 0,
    inProgress: 0,
    awaiting: 0,
    completed: 0,
    cancelled: 0,
    photos: 0,
    nearby: 0,
    posts: 0,
    donations: 0,
    failed: 0,
  };

  const create = async (beneficiary, startIso, service, minutes, notes, urgency = 'SCHEDULED') => {
    const [addr, ward, landmark] = WARDS[n++ % WARDS.length];
    if (!catalogue[service])
      throw new Error(`Demo service is missing from the catalogue: ${service}`);
    const key = crypto
      .createHash('sha256')
      .update(JSON.stringify(['kottakkal-demo', org, beneficiary.membership, service, notes]))
      .digest('hex');
    // Recover earlier demo records whose idempotency keys were random.
    const [existingRequest] = await db.query(
      `SELECT id,status FROM service_requests
       WHERE organization_id=$1 AND beneficiary_membership_id=$2
         AND (idempotency_key=$3 OR (service_catalog_id=$4 AND beneficiary_notes=$5))
       ORDER BY (idempotency_key=$3) DESC NULLS LAST,created_at,id LIMIT 1`,
      [org, beneficiary.membership, key, catalogue[service], notes],
    );
    if (existingRequest) return existingRequest;
    return call('POST', `/organizations/${org}/requests`, await login(beneficiary.phone), {
      serviceCatalogId: catalogue[service],
      idempotencyKey: key,
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
    const [existingAssignment] = await db.query(
      `SELECT id,status,confirmed_at,review_reason,review_resolved_at FROM volunteer_assignments
       WHERE service_request_id=$1 AND volunteer_membership_id=$2
         AND status IN ('ACCEPTED','IN_PROGRESS','COMPLETED')
       ORDER BY created_at DESC LIMIT 1`,
      [request.id, volunteer.membership],
    );
    if (existingAssignment) return existingAssignment;
    const a = await call(
      'POST',
      `/organizations/${org}/requests/${request.id}/dispatch`,
      coordToken,
      {
        volunteerMembershipId: volunteer.membership,
        dispatchNotes: 'Assigned by the ward coordinator',
      },
    );
    return a.assignment ?? a;
  };
  const soon = (minutes = 2) => new Date(Date.now() + minutes * 60_000).toISOString();
  const visit = async (request, volunteer, minutes, notes, beneficiary) => {
    const assignment = await dispatch(request, volunteer);
    const token = await login(volunteer.phone);
    const route = `/organizations/${org}/assignments/${assignment.id}`;
    if (assignment.status === 'ACCEPTED') await call('POST', `${route}/start`, token, {});
    if (minutes != null && assignment.status !== 'COMPLETED') {
      await call('POST', `${route}/finish`, token, { minutes, notes });
    }
    if (beneficiary && !assignment.confirmed_at) {
      const decisionRoute = `/organizations/${org}/requests/${request.id}/assignments/${assignment.id}`;
      const alreadyInReview = assignment.review_reason && !assignment.review_resolved_at;
      const confirmation = alreadyInReview
        ? { reviewRequired: true }
        : await call('POST', `${decisionRoute}/confirm`, await login(beneficiary.phone), {});
      const approved = confirmation.reviewRequired
        ? await call('POST', `${decisionRoute}/resolve`, coordToken, {
            decision: 'PAY',
            minutes,
            notes: 'Reviewed and approved this fictional demo visit.',
          })
        : confirmation;
      if (!approved.confirmedAt) throw new Error('The visit did not receive confirmed hours');
    }
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

  if (activityOnly || desktop) {
    for (const [volunteerIndex, recipientIndex, service, minutes, note, finishNote] of [
      [
        10,
        10,
        'DOCUMENT_HELP',
        120,
        'Sort handouts for the community reading group',
        'Sorted the handouts and made a short index.',
      ],
      [
        16,
        9,
        'PHONE_HELP',
        75,
        'Practice making a video call on a smartphone',
        'Practiced starting and answering a video call together.',
      ],
      [
        17,
        8,
        'GARDENING',
        120,
        'Prepare the shared courtyard planters',
        'Added soil and planted the seedlings.',
      ],
      [
        18,
        7,
        'TRANSLATION_HELP',
        90,
        'Translate a notice for the library book swap',
        'Reviewed the Malayalam and English versions together.',
      ],
      [
        19,
        6,
        'TUTORING',
        120,
        'Read and discuss short Malayalam stories',
        'Read two short stories and talked through the vocabulary.',
      ],
    ]) {
      await step(`extra contribution ${service}`, async () => {
        const recipient = ben(recipientIndex);
        const request = await create(recipient, soon(), service, minutes, note);
        await visit(request, vol(volunteerIndex), minutes, finishNote, recipient);
        results.completed++;
      });
    }

    for (const [donor, idempotencyKey, gift] of [
      [
        vol(10),
        'kottakkal-demo-library-gift-v1',
        {
          amount: 0.5,
          recipientOrganizationId: org,
          recipientMembershipNumber: 'KTB-V-117',
          note: 'For keeping the shared garden going.',
        },
      ],
      [
        vol(19),
        'kottakkal-demo-pool-gift-v1',
        {
          amount: 0.5,
          poolId: fixture.pool,
          note: 'A little time for neighbours who need a hand.',
        },
      ],
    ]) {
      await step(`demo donation ${idempotencyKey}`, async () => {
        await call('POST', `/organizations/${org}/donations`, await login(donor.phone), {
          ...gift,
          idempotencyKey,
        });
        results.donations++;
      });
    }
  }

  if (!activityOnly) {
    console.log('Creating completed help with confirmed time credits…');
    const done = [
      [
        'HOSPITAL_ESCORT',
        120,
        'Eye check-up at Taluk hospital',
        'Waited with her at the OP counter and the pharmacy.',
      ],
      [
        'GROCERY_SHOPPING',
        60,
        'Weekly vegetables and rice',
        'Bought everything on the list from the market.',
      ],
      [
        'COMPANIONSHIP',
        90,
        'Would love someone to read the newspaper with',
        'Read the paper and went for a short walk.',
      ],
      ['MINOR_REPAIRS', 45, 'Kitchen tap is leaking', 'Replaced the washer; no more leak.'],
      [
        'TUTORING',
        60,
        'Grandson needs help with class 8 maths',
        'Covered fractions and two practice tests.',
      ],
      [
        'PHONE_HELP',
        30,
        'Set up WhatsApp video calls to my daughter',
        'Set up video calls and tested one with her daughter.',
      ],
      [
        'MEDICINE_PICKUP',
        30,
        'Monthly BP medicines from Jan Aushadhi',
        'Collected and delivered the medicines.',
      ],
      [
        'GARDENING',
        90,
        'Plant the new vegetable seedlings',
        'Planted tomato and chilli seedlings and watered them.',
      ],
      [
        'HOSPITAL_ESCORT',
        150,
        'Physiotherapy session at the Ayurveda hospital',
        'Escorted there and back by autorickshaw.',
      ],
      ['GROCERY_SHOPPING', 45, 'Milk, bread and fish', 'Delivered before noon.'],
      [
        'DOCUMENT_HELP',
        120,
        'Organize forms for a community workshop',
        'Sorted the forms and explained the checklist.',
      ],
      [
        'TRANSLATION_HELP',
        90,
        'Translate a neighbourhood association leaflet',
        'Prepared a Malayalam draft and checked it together.',
      ],
      ['TUTORING', 120, 'Practice reading aloud', 'Worked through two short stories together.'],
      [
        'GARDENING',
        90,
        'Prepare pots for the shared garden',
        'Filled and labelled the pots for the next session.',
      ],
    ];
    for (const [i, [service, minutes, note, finishNote]] of done.entries()) {
      await step(`completed ${service}`, async () => {
        const r = await create(ben(i), soon(), service, minutes, note);
        await visit(r, vol(i < 10 ? i : i - 10), minutes, finishNote, ben(i));
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
        const r = await create(ben(i + 1), soon(), service, minutes, note);
        await visit(r, vol(i + 11), minutes, 'Finished and ready for confirmation.');
        results.awaiting++;
      });
    for (const [i, [service, minutes, note]] of [
      ['HOSPITAL_ESCORT', 120, 'Dialysis appointment, needs help with the wheelchair'],
      ['GARDENING', 60, 'Clear the weeds around the coconut trees'],
    ].entries())
      await step(`in progress ${service}`, async () => {
        const r = await create(ben(i + 2), soon(), service, minutes, note);
        await visit(r, vol(i + 14));
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
      ['DOCUMENT_HELP', 0, 12, 60, 'Help read the ward library registration form'],
      ['TRANSLATION_HELP', 0, 12, 45, 'Translate a notice for the reading group'],
    ].entries())
      await step(`open ${service}`, async () => {
        const start = days === 0 || urgency === 'IMMEDIATE' ? soon(30) : at(days, hour);
        await create(ben(i + 1), start, service, minutes, note, urgency);
        results.open++;
      });

    console.log('Creating cancelled requests…');
    for (const [i, [service, reason, notes]] of [
      ['HOSPITAL_ESCORT', 'BENEFICIARY_UNWELL', 'Doctor appointment was moved to next week'],
      ['GARDENING', 'NO_LONGER_NEEDED', 'My son is visiting and will do it'],
    ].entries())
      await step(`cancel ${service}`, async () => {
        const r = await create(ben(i + 3), at(i + 2, 14), service, 60, 'Planned help');
        if (r.status !== 'CANCELLED') {
          await call(
            'POST',
            `/organizations/${org}/requests/${r.id}/cancel`,
            await login(ben(i + 3).phone),
            { reasonCode: reason, notes },
          );
        }
        results.cancelled++;
      });

    console.log('Adding optional private profile photos and expiring Nearby availability…');
    const avatarDir = desktop
      ? path.resolve(__dirname, '../../time_bank_flutter/assets/avatars')
      : path.resolve(__dirname, '../apps/mobile/time_bank_flutter/assets/avatars');
    const avatarFiles = ['avatar_female.png', 'avatar.png'].map((name) => path.join(avatarDir, name));
    const avatarBytes = await Promise.all(avatarFiles.map((file) => fs.readFile(file)));
    const peopleWithPhotos = [
      coordinator,
      admin,
      ...staff,
      ...(desktop ? volunteers.slice(0, 4) : volunteers),
      ...(desktop ? beneficiaries.slice(0, 3) : beneficiaries),
    ];
    for (const [i, person] of peopleWithPhotos.entries()) {
      await step(`profile photo ${person.phone}`, async () => {
        const token = await login(person.phone);
        const headers = { authorization: `Bearer ${token}` };
        const existing = await fetch(`${API}/auth/me/photo`, { headers });
        await existing.arrayBuffer();
        if (existing.ok) {
          results.photos++;
          return;
        }
        const form = new FormData();
        form.append(
          'file',
          new Blob([avatarBytes[i % avatarBytes.length]], { type: 'image/png' }),
          `demo-avatar-${i + 1}.png`,
        );
        const response = await fetch(`${API}/auth/me/photo`, {
          method: 'PUT',
          headers,
          body: form,
        });
        if (!response.ok) throw new Error(`photo upload returned ${response.status}`);
        results.photos++;
      });
    }
    for (let i = 0; i < Math.min(5, volunteers.length); i++) {
      await step(`Nearby availability ${volunteers[i].phone}`, async () => {
        await call(
          'PUT',
          `/organizations/${org}/community/availability`,
          await login(volunteers[i].phone),
          {
            areaId: zones[i % zones.length],
            minutes: 60,
            consent: true,
          },
        );
        results.nearby++;
      });
    }
  }

  const community = `/organizations/${org}/community`;
  const [schema] = await db.query("SELECT to_regclass('community_posts') AS posts");
  if (schema.posts) {
    await call('GET', `${community}/feed`, coordToken);
    const posts = activityOnly
      ? [
          [
            'ANNOUNCEMENT',
            'The neighbourhood book swap is open this weekend. Bring a book, pick one to take home, or stay for the reading circle.',
            coordinator,
            true,
          ],
          [
            'OPPORTUNITY',
            'We have space for two more volunteers at the next shared garden session. Help label seedlings and water the planters.',
            staff[0],
            true,
          ],
          [
            'STORY',
            'We sorted the reading group handouts into a simple index. Next time, we can spend more of the session reading together.',
            vol(10),
            true,
          ],
          [
            'STORY',
            'Our book swap notice is ready in Malayalam and English. Thanks to everyone who helped review the wording.',
            vol(18),
            true,
          ],
        ]
      : [
          [
            'ANNOUNCEMENT',
            'Welcome to the Kottakkal Time Bank demo. Ask for help, offer your time, or see what is happening in the community.',
            coordinator,
            true,
          ],
          [
            'ANNOUNCEMENT',
            'Saturday library meetup at 10 am. Bring a book to swap or join the reading group. This is a demo announcement.',
            coordinator,
            true,
          ],
          [
            'OPPORTUNITY',
            'Help set up the neighbourhood reading corner. We could use a hand sorting books and making shelf labels.',
            staff[0],
            true,
          ],
          [
            'STORY',
            'We spent the afternoon planting seedlings for the shared garden. My favourite part was swapping tips for growing chillies.',
            volunteers[2],
            true,
          ],
          [
            'STORY',
            'I would like to share a few tips from our neighbourhood phone skills session.',
            volunteers[3],
            false,
          ],
        ];
    for (const [type, body, author, publish] of posts) {
      await step(`community ${type.toLowerCase()}`, async () => {
        const [existingPost] = await db.query(
          'SELECT id,status FROM community_posts WHERE organization_id=$1 AND author_membership_id=$2 AND post_type=$3 AND body=$4 LIMIT 1',
          [org, author.membership, type, body],
        );
        const post =
          existingPost ??
          (await call('POST', `${community}/posts`, await login(author.phone), {
            postType: type,
            body,
          }));
        if (publish && post.status === 'PENDING_REVIEW') {
          await call('POST', `${community}/posts/${post.id}/review`, coordToken, {
            status: 'PUBLISHED',
            note: 'Reviewed fictional demo content',
          });
        }
        if (publish) {
          await call(
            'POST',
            `${community}/posts/${post.id}/reaction`,
            await login(volunteers[1].phone),
            { reaction: 'THANKS' },
          );
        }
        results.posts++;
      });
    }
  } else {
    console.warn('Community posts skipped because the QA database has no Community Feed migration');
  }

  if (desktop) {
    await seedDesktopScreens(db, fixture);
    await step('saved sponsor report', async () => {
      const [period] = await db.query(
        "SELECT to_char((now() AT TIME ZONE 'Asia/Kolkata') - interval '1 month', 'YYYY-MM') AS month",
      );
      const [existingReport] = await db.query(
        'SELECT id FROM sponsor_reports WHERE organization_id=$1 AND period_month=$2 LIMIT 1',
        [org, period.month],
      );
      if (!existingReport) {
        const token = await staffLogin(admin.phone);
        await call('POST', `/organizations/${org}/reports/sponsor`, token, { month: period.month });
      }
    });
  }
  const [earnings] = await db.query(
    `SELECT count(*)::int AS visits, coalesce(sum(minutes),0)::int AS minutes,
            coalesce(sum(amount),0) AS credits
     FROM time_credit_ledger WHERE originating_org_id=$1 AND tx_type='SERVICE_EARNED'`,
    [org],
  );
  const [recognition] = await db.query(
    "SELECT count(*)::int AS achievements FROM loyalty_ledger WHERE organization_id=$1 AND tx_type='MILESTONE_EARNED'",
    [org],
  );
  console.log('Recorded time and recognition:', { ...earnings, ...recognition });
  console.log('\nSeed summary:', results);
  console.log(
    'Coordinator: +919000000101 · Staff: +919000000151, +919000000152 · Municipality admin: +919000000153',
  );
  console.log(
    'Volunteers: +919000000103 and +919000000201–219 · Recipients: +919000000102 and +919000000301–310',
  );
  console.log('Pending applicants: +9190000004 01–04');
  if (results.failed) process.exitCode = 1;
})()
  .finally(() => (db.isInitialized ? db.destroy() : undefined))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
