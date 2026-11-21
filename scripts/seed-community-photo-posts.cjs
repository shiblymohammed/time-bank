const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Client } = require('../apps/api/node_modules/pg');

const qaRoot = path.join(__dirname, '../node_modules/.cache/shop-wallet-preview');
const state = require(path.join(qaRoot, 'state.json'));
const fixture = require(path.join(qaRoot, 'fixture.json'));
assert.match(state.database, /^ktb_interface_qa_[a-f0-9]{32}$/);
assert.ok(Number.isInteger(state.port) && state.port > 1024 && state.port <= 65535);

const posts = [
  {
    id: 'ccdeaf3d-cfac-412e-9a7a-b86d253dbc01',
    event: 'fe244640-b30e-49fb-908c-d5694c4ee501',
    image: 'library',
    author: fixture.people.coordinator.membership,
    title: 'Library volunteering drive',
    body: 'Help sort donated books and set up the reading corner. First-time volunteers are welcome.',
    venue: 'Kottakkal Community Library',
    days: 4,
    startHour: 9,
    durationHours: 3,
  },
  {
    id: 'ccdeaf3d-cfac-412e-9a7a-b86d253dbc02',
    event: 'fe244640-b30e-49fb-908c-d5694c4ee502',
    image: 'cleanup',
    author: fixture.people.volunteer.membership,
    title: 'Meet your neighbours at the park clean-up',
    body: 'We’ll clear litter from the walking path and tidy the planting beds. Bring a water bottle and closed shoes.',
    venue: 'Changuvetty Community Park',
    days: 5,
    startHour: 8,
    durationHours: 2,
  },
  {
    id: 'ccdeaf3d-cfac-412e-9a7a-b86d253dbc03',
    image: 'mentoring',
    author: fixture.people.volunteer.membership,
    title: 'Small steps with smartphone skills',
    body: 'At our last drop-in, neighbours practised video calls and sharing photos. Everyone left with one new thing they could do on their own.',
  },
];

async function seed() {
  const db = new Client({
    host: '127.0.0.1', port: state.port, user: 'ktb_interface_qa', database: state.database,
  });
  await db.connect();
  try {
    await db.query('BEGIN');
    const organization = await db.query('SELECT code FROM organizations WHERE id=$1', [fixture.org]);
    assert.equal(organization.rows[0]?.code, 'KOTTAKKAL');
    for (const [index, post] of posts.entries()) {
      if (post.event) {
        await db.query(
          `WITH schedule AS (
             SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date + $6::int
               + make_time($7::int,0,0)) AT TIME ZONE 'Asia/Kolkata' AS starts_at
           )
           INSERT INTO community_events(id,organization_id,organizer_id,title,description,venue,starts_at,ends_at,capacity)
           SELECT $1,$2,$3,$4,$5,$8,starts_at,starts_at+make_interval(hours=>$9::int),18 FROM schedule
           ON CONFLICT (id) DO NOTHING`,
          [post.event, fixture.org, fixture.people.coordinator.membership, post.title,
            post.body, post.days, post.startHour, post.venue, post.durationHours],
        );
      }
      await db.query(
        `INSERT INTO community_posts(id,organization_id,author_membership_id,post_type,body,status,published_at,event_id)
         VALUES ($1,$2,$3,$4,$5,'PUBLISHED',now()-make_interval(mins=>$6::int),$7)
         ON CONFLICT (id) DO NOTHING`,
        [post.id, fixture.org, post.author, post.event ? 'OPPORTUNITY' : 'STORY',
          `${post.title}\n${post.body}`, index, post.event ?? null],
      );
      const jpeg = readFileSync(path.join(__dirname, 'fixtures/community', `${post.image}.jpg`));
      await db.query(
        `INSERT INTO community_post_photos(post_id,jpeg)
         SELECT id,$3 FROM community_posts WHERE id=$1 AND organization_id=$2 AND status='PUBLISHED'
         ON CONFLICT (post_id) DO NOTHING`,
        [post.id, fixture.org, jpeg],
      );
    }
    const { rows } = await db.query(
      `SELECT p.id,p.post_type,e.venue,octet_length(ph.jpeg) AS photo_bytes
       FROM community_posts p
       JOIN community_post_photos ph ON ph.post_id=p.id
       LEFT JOIN community_events e ON e.organization_id=p.organization_id AND e.id=p.event_id
       WHERE p.organization_id=$1 AND p.status='PUBLISHED' AND p.id=ANY($2::uuid[])
       ORDER BY p.published_at DESC`,
      [fixture.org, posts.map((post) => post.id)],
    );
    assert.equal(rows.length, posts.length);
    assert.equal(rows.filter((post) => post.venue).length, 2);
    await db.query('COMMIT');
    console.table(rows);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
