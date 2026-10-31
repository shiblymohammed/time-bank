const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const { DataSource } = req('typeorm');
const url = process.env.UI_QA_DATABASE_URL;
if (!url || !/^ktb_interface_qa_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))
  throw new Error('A disposable UI_QA_DATABASE_URL is required');
const db = new DataSource({
  type: 'postgres',
  url,
  entities: [path.resolve(__dirname, '../apps/api/dist/**/*.entity.js')],
  migrations: [path.resolve(__dirname, '../apps/api/dist/database/migrations/[0-9]*.js')],
  synchronize: false,
});
(async () => {
  await db.initialize();
  await db.runMigrations();
  const id = async (sql, args = []) => (await db.query(sql, args))[0].id;
  const org = await id(
    "INSERT INTO organizations(code,name,district) VALUES('INTERFACE_QA','Interface QA Municipality','Test District') RETURNING id",
  );
  const orgB = await id(
    "INSERT INTO organizations(code,name,district) VALUES('OTHER_QA','Other QA Municipality','Test District') RETURNING id",
  );
  const people = {};
  for (const [name, phone, role] of [
    ['coordinator', '+919000000101', 'COORDINATOR'],
    ['beneficiary', '+919000000102', 'BENEFICIARY'],
    ['volunteer', '+919000000103', 'VOLUNTEER'],
    ['caregiver', '+919000000104', 'CAREGIVER'],
    ['applicant', '+919000000105', null],
    ['admin', '+919000000106', 'SUPER_ADMIN'],
  ]) {
    const user = await id(
      'INSERT INTO users(phone_e164,primary_org_id) VALUES($1,$2) RETURNING id',
      [phone, org],
    );
    const membership = await id(
      'INSERT INTO organization_memberships(organization_id,user_id,status,membership_number) VALUES($1,$2,$3,$4) RETURNING id',
      [org, user, role ? 'APPROVED' : 'APPLIED', role ? `QA-${name.toUpperCase()}` : null],
    );
    if (role)
      await db.query(
        'INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,$2,$3)',
        [membership, role, user],
      );
    people[name] = { user, membership, phone };
  }
  await db.query(
    "INSERT INTO beneficiary_eligibilities(organization_id,membership_id,review_due_at,approved_by_user_id,monthly_request_quota) VALUES($1,$2,NOW()+interval '1 year',$3,50)",
    [org, people.beneficiary.membership, people.coordinator.user],
  );
  await db.query(
    "INSERT INTO caregiver_authorizations(organization_id,beneficiary_membership_id,caregiver_membership_id,status,approved_by_user_id) VALUES($1,$2,$3,'APPROVED',$4)",
    [org, people.beneficiary.membership, people.caregiver.membership, people.coordinator.user],
  );
  const secondVolunteer = await id(
    "INSERT INTO organization_memberships(organization_id,user_id,status,membership_number) VALUES($1,$2,'APPROVED','QA-OTHER-VOLUNTEER') RETURNING id",
    [orgB, people.volunteer.user],
  );
  await db.query(
    "INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,'VOLUNTEER',$2)",
    [secondVolunteer, people.admin.user],
  );
  await db.query(
    "INSERT INTO organization_memberships(organization_id,user_id,status) VALUES($1,$2,'APPLIED')",
    [orgB, people.applicant.user],
  );
  await db.query(
    "INSERT INTO membership_documents(membership_id,storage_key,document_type) VALUES($1,'qa/fictional-reference.pdf','ADDRESS_PROOF')",
    [people.applicant.membership],
  );
  const category = await id(
    "INSERT INTO service_categories(code,name_en,name_ml) VALUES('QA_HELP','QA Household Help','QA Help') RETURNING id",
  );
  const global = await id(
    "INSERT INTO global_service_definitions(category_id,code,name_en,name_ml) VALUES($1,'QA_HELP','QA Household Help','QA Help') RETURNING id",
    [category],
  );
  const catalogue = await id(
    'INSERT INTO organization_service_catalog(organization_id,global_service_id) VALUES($1,$2) RETURNING id',
    [org, global],
  );
  const availableGlobal = await id(
    "INSERT INTO global_service_definitions(category_id,code,name_en,name_ml) VALUES($1,'QA_COMPANION','QA Companion Help','QA Companion Help') RETURNING id",
    [category],
  );
  const inactiveGlobal = await id(
    "INSERT INTO global_service_definitions(category_id,code,name_en,name_ml,is_active) VALUES($1,'QA_RETIRED','QA Retired Help','QA Retired Help',false) RETURNING id",
    [category],
  );
  const data = { org, orgB, catalogue, people, availableGlobal, inactiveGlobal };
  require('node:fs').writeFileSync(
    path.resolve(__dirname, '../node_modules/.cache/interface-qa/fixture.json'),
    JSON.stringify(data, null, 2),
  );
  console.log('Five migrations applied; disposable interface fixtures created.');
})()
  .finally(() => db.destroy())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
