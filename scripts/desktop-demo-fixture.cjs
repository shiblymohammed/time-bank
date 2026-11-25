const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function desktopConfig(requireApi) {
  const settings = requireApi('dotenv').parse(readFileSync(path.join(__dirname, '../.env')));
  const databaseUrl = settings.DATABASE_URL;
  const database = new URL(databaseUrl);
  const apiPort = Number(settings.API_PORT ?? 3001);
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !['127.0.0.1', 'localhost'].includes(database.hostname) ||
    database.pathname !== '/ktb_dev' ||
    database.search ||
    database.hash ||
    settings.NODE_ENV !== 'development' ||
    settings.APP_ENV === 'production' ||
    settings.AUTH_ALLOW_MOCK_OTP !== 'true' ||
    settings.SMS_PROVIDER !== 'local-mock' ||
    (settings.STAFF_SECOND_FACTOR !== 'off' && settings.EMAIL_PROVIDER !== 'local-mock') ||
    !Number.isInteger(apiPort) ||
    apiPort < 1024 ||
    apiPort > 65535
  ) {
    throw new Error('Desktop demo requires the local ktb_dev database and mock OTP configuration.');
  }
  return { databaseUrl, api: `http://127.0.0.1:${apiPort}/api` };
}

async function desktopFixture(db, api) {
  const ready = await fetch(`${api}/health/ready`, { signal: AbortSignal.timeout(5000) });
  if (!ready.ok) throw new Error('Start the Desktop API and PostgreSQL before seeding.');
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('timebank-desktop-demo'))");
    const [organization] = await tx.query(
      `INSERT INTO organizations(code,name,district)
       VALUES('LOCAL_QA','Local QA Municipality','Malappuram')
       ON CONFLICT (code) DO UPDATE SET code=EXCLUDED.code RETURNING id`,
    );
    const org = organization.id;
    const people = {};
    for (const [key, suffix, role, name] of [
      ['coordinator', '101', 'COORDINATOR', 'Anjali Menon'],
      ['beneficiary', '102', 'BENEFICIARY', 'Leela Krishnan'],
      ['volunteer', '103', 'VOLUNTEER', 'Sandeep Varma'],
      ['caregiver', '104', 'CAREGIVER', 'Maya Joseph'],
      ['applicant', '105', null, 'Nabeel Rahman'],
      ['admin', '106', 'SUPER_ADMIN', 'Devika Nair'],
      ['merchant', '154', 'MERCHANT', 'Ravi Pillai'],
    ]) {
      const phone = `+919000000${suffix}`;
      const email =
        role && ['COORDINATOR', 'SUPER_ADMIN'].includes(role)
          ? `${key}@local-timebank.example.test`
          : null;
      const [user] = await tx.query(
        `INSERT INTO users(phone_e164,primary_org_id,email,full_name) VALUES($1,$2,$3,$4)
         ON CONFLICT (phone_e164) DO UPDATE SET primary_org_id=$2,
           email=COALESCE(users.email,EXCLUDED.email),full_name=COALESCE(users.full_name,EXCLUDED.full_name)
         WHERE users.primary_org_id=$2 OR users.primary_org_id IS NULL RETURNING id`,
        [phone, org, email, name],
      );
      if (!user) throw new Error(`Demo phone ${phone} belongs to a different organization.`);
      const [membership] = await tx.query(
        `INSERT INTO organization_memberships(organization_id,user_id,status,membership_number,approved_at)
         VALUES($1,$2,$3::varchar,$4,CASE WHEN $3::varchar='APPROVED' THEN now() END)
         ON CONFLICT(organization_id,user_id) DO UPDATE SET
           membership_number=COALESCE(organization_memberships.membership_number,EXCLUDED.membership_number)
         RETURNING id,status`,
        [org, user.id, role ? 'APPROVED' : 'APPLIED', role ? `QA-${suffix}` : null],
      );
      if (role && membership.status !== 'APPROVED')
        throw new Error(`Expected an approved QA membership for ${phone}.`);
      if (role)
        await tx.query(
          'INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [membership.id, role, user.id],
        );
      people[key] = { user: user.id, membership: membership.id, phone };
    }
    await tx.query(
      `INSERT INTO beneficiary_eligibilities(organization_id,membership_id,review_due_at,approved_by_user_id,monthly_request_quota)
       SELECT $1,$2,now()+interval '1 year',$3,50
       WHERE NOT EXISTS(SELECT 1 FROM beneficiary_eligibilities WHERE organization_id=$1 AND membership_id=$2)`,
      [org, people.beneficiary.membership, people.coordinator.user],
    );
    await tx.query(
      `INSERT INTO caregiver_authorizations(organization_id,beneficiary_membership_id,caregiver_membership_id,
         status,approved_by_user_id)
       SELECT $1,$2,$3,'APPROVED',$4 WHERE NOT EXISTS(
         SELECT 1 FROM caregiver_authorizations
         WHERE organization_id=$1 AND beneficiary_membership_id=$2 AND caregiver_membership_id=$3)`,
      [org, people.beneficiary.membership, people.caregiver.membership, people.coordinator.user],
    );
    for (const name of ['caregiver', 'volunteer']) {
      await tx.query(
        `INSERT INTO verified_identities(user_id,verification_status)
         SELECT $1,'VERIFIED' WHERE NOT EXISTS (SELECT 1 FROM verified_identities WHERE user_id=$1)`,
        [people[name].user],
      );
    }
    const [pool] = await tx.query(
      `INSERT INTO community_credit_pools(organization_id,name,description,created_by_user_id)
       SELECT $1,'Community Essentials','Fictional community credit pool for the Desktop demo',$2
       WHERE NOT EXISTS(SELECT 1 FROM community_credit_pools WHERE organization_id=$1 AND name='Community Essentials')
       RETURNING id`,
      [org, people.admin.user],
    );
    const [existing] = pool
      ? []
      : await tx.query(
          "SELECT id FROM community_credit_pools WHERE organization_id=$1 AND name='Community Essentials'",
          [org],
        );
    return { org, people, pool: (pool ?? existing).id };
  });
}

async function seedDesktopScreens(db, { org, people }) {
  const { coordinator, volunteer, beneficiary } = people;
  const media = ['library', 'cleanup', 'mentoring'].map((name) =>
    readFileSync(path.join(__dirname, 'fixtures/community', `${name}.jpg`)),
  );
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('timebank-desktop-demo'))");
    const photos = [
      {
        title: 'Library volunteering drive',
        body: 'Help sort donated books and prepare the reading corner. First-time volunteers are welcome.',
        venue: 'Community Library',
        lead: coordinator,
        days: 4,
      },
      {
        title: 'Neighbourhood park clean-up',
        body: 'Help clear the walking path and tend the planting beds. Bring water and closed shoes.',
        venue: 'Community Park',
        lead: coordinator,
        days: 7,
      },
      {
        title: 'Small steps with smartphone skills',
        body: 'Neighbours practised video calls and sharing photos at our last drop-in session.',
        lead: volunteer,
      },
    ];
    for (const [index, photo] of photos.entries()) {
      let event;
      if (photo.venue) {
        const [existing] = await tx.query(
          'SELECT id FROM community_events WHERE organization_id=$1 AND organizer_id=$2 AND title=$3',
          [org, photo.lead.membership, photo.title],
        );
        [event] = existing
          ? [existing]
          : await tx.query(
              `INSERT INTO community_events(organization_id,organizer_id,title,description,venue,starts_at,ends_at,capacity)
           VALUES($1,$2,$3,$4,$5,now()+make_interval(days=>$6),now()+make_interval(days=>$6,hours=>2),24)
           RETURNING id`,
              [org, photo.lead.membership, photo.title, photo.body, photo.venue, photo.days],
            );
        await tx.query(
          'INSERT INTO community_event_photos(event_id,jpeg,sha256) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [event.id, media[index], hash(media[index])],
        );
        await tx.query(
          'INSERT INTO community_event_attendance(organization_id,event_id,membership_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [org, event.id, volunteer.membership],
        );
      }
      const body = `${photo.title}\n${photo.body}`;
      const [existing] = await tx.query(
        'SELECT id FROM community_posts WHERE organization_id=$1 AND author_membership_id=$2 AND body=$3',
        [org, photo.lead.membership, body],
      );
      const [post] = existing
        ? [existing]
        : await tx.query(
            `INSERT INTO community_posts(organization_id,author_membership_id,body,post_type,status,published_at,event_id)
         VALUES($1,$2,$3,$4,'PUBLISHED',now(),$5) RETURNING id`,
            [org, photo.lead.membership, body, event ? 'OPPORTUNITY' : 'STORY', event?.id ?? null],
          );
      await tx.query(
        'INSERT INTO community_post_photos(post_id,jpeg) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [post.id, media[index]],
      );
      if (!event)
        await tx.query(
          `INSERT INTO community_post_reports(post_id,reporter_membership_id,reason,details)
         VALUES($1,$2,'OTHER','Fictional report to demonstrate the moderation queue.') ON CONFLICT DO NOTHING`,
          [post.id, beneficiary.membership],
        );
    }
    for (const [number, name] of [
      ['7', 'Library Ward'],
      ['12', 'Market Ward'],
      ['18', 'Garden Ward'],
    ]) {
      await tx.query(
        `INSERT INTO wards(organization_id,ward_number,name,representative_title,representative_name,office_address,created_by_user_id)
         VALUES($1,$2,$3,'COUNCILLOR','Demo Ward Representative','Community Centre',$4)
         ON CONFLICT(organization_id,ward_number) DO NOTHING`,
        [org, number, name, coordinator.user],
      );
    }
    const [request] = await tx.query(
      `SELECT id FROM service_requests WHERE organization_id=$1 AND beneficiary_notes='Weekly vegetables and rice'
       ORDER BY created_at DESC LIMIT 1`,
      [org],
    );
    if (request)
      await tx.query(
        'INSERT INTO service_request_photos(request_id,jpeg,sha256) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [request.id, media[2], hash(media[2])],
      );
    if (request)
      await tx.query(
        `INSERT INTO safety_alerts(organization_id,service_request_id,raised_by_user_id,raised_by_role,action,notes,client_operation_id)
       SELECT $1,r.id,m.user_id,'BENEFICIARY','PAUSE','Fictional past safety alert for staff review.','desktop-demo-safety'
       FROM service_requests r JOIN organization_memberships m ON m.id=r.beneficiary_membership_id
       WHERE r.organization_id=$1 AND r.id=$2 ON CONFLICT DO NOTHING`,
        [org, request.id],
      );
    const [merchant] = await tx.query(
      `INSERT INTO organization_merchants(organization_id,owner_user_id,name,address,phone,status,decided_by,decided_at)
       VALUES($1,$2,'Community Reading Room','Library Road, Local QA Municipality',$3,'APPROVED',$4,now())
       ON CONFLICT (organization_id,owner_user_id) DO UPDATE SET owner_user_id=EXCLUDED.owner_user_id
       RETURNING id`,
      [org, people.merchant.user, people.merchant.phone, people.admin.user],
    );
    await tx.query(
      `INSERT INTO merchant_offers(organization_id,merchant_id,title,description,terms,coins,
       starts_at,ends_at,redemption_limit,status,proposed_by,decided_by,decided_at,client_operation_id)
       VALUES($1,$2,'Reading room day pass','Spend a day in the community reading room.',
       'One pass per member during demo hours.',15,now()-interval '1 day',now()+interval '45 days',
       40,'APPROVED',$3,$4,now(),'f1bc2c60-8a63-4864-99f7-b9382f8db5be') ON CONFLICT DO NOTHING`,
      [org, merchant.id, people.merchant.user, people.admin.user],
    );
    const [help] = await tx.query(
      `INSERT INTO instant_help_sessions(organization_id,user_id,membership_id,start_key,start_fingerprint,
        description,location_label,status,started_at,finished_at,reported_minutes,completion_notes)
       VALUES($1,$2,$3,'desktop-demo-help',$4,'Helped prepare the community reading corner',
         'Community Library','PENDING',now()-interval '1 hour',now()-interval '25 minutes',35,'Sorted books and labelled shelves.')
       ON CONFLICT(user_id,start_key) DO UPDATE SET start_key=EXCLUDED.start_key RETURNING id`,
      [org, volunteer.user, volunteer.membership, hash('desktop-demo-help')],
    );
    await tx.query(
      'INSERT INTO instant_help_photos(session_id,photo) SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM instant_help_photos WHERE session_id=$1)',
      [help.id, media[0]],
    );
    await tx.query(
      `INSERT INTO complaints(organization_id,reference,raised_by_user_id,subject,level,description)
       VALUES($1,'DEMO-COMPLAINT-01',$2,'SERVICE_OR_MEMBER','COORDINATOR','Fictional follow-up about a visit time.')
       ON CONFLICT(reference) DO NOTHING`,
      [org, beneficiary.user],
    );
    await tx.query(
      `INSERT INTO restriction_cases(organization_id,reference,subject_user_id,subject_membership_id,
        restriction_type,level,reason,recommended_by_user_id)
       VALUES($1,'DEMO-RESTRICTION-01',$2,$3,'TEMPORARY_SUSPENSION','MUNICIPALITY_ADMIN',
         'Fictional recommendation awaiting review.',$4) ON CONFLICT(reference) DO NOTHING`,
      [org, volunteer.user, volunteer.membership, coordinator.user],
    );
    await tx.query(
      `INSERT INTO account_closures(organization_id,reference,kind,subject_user_id,subject_membership_id,
        primary_user_id,level,reason,reported_by_user_id)
       VALUES($1,'DEMO-CLOSURE-01','DUPLICATE',$2,$3,$4,'MUNICIPALITY_ADMIN',
         'Fictional duplicate account report awaiting review.',$5) ON CONFLICT(reference) DO NOTHING`,
      [org, people.applicant.user, people.applicant.membership, beneficiary.user, coordinator.user],
    );
    await tx.query(
      `INSERT INTO phone_recovery_cases(organization_id,reference,subject_user_id,subject_membership_id,
        old_phone,new_phone,level,document_type,document_last4,document_result,reason,opened_by_user_id)
       VALUES($1,'DEMO-RECOVERY-01',$2,$3,$4,'+919000000905','MUNICIPALITY_ADMIN','VOTER_ID','0021',
         'NONE_ON_RECORD','Fictional lost SIM recovery request.',$5) ON CONFLICT DO NOTHING`,
      [org, beneficiary.user, beneficiary.membership, beneficiary.phone, coordinator.user],
    );
  });
  console.log(
    'Added photographed community posts and events, a request photo, wards and review cases.',
  );
}

module.exports = { desktopConfig, desktopFixture, seedDesktopScreens };
