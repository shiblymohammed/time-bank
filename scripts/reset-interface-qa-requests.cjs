// Reset only request fixtures in the disposable local QA database before a native rerun.
const { Client } = require('../apps/api/node_modules/pg');
const state = require('../node_modules/.cache/interface-qa/state.json');
if (!/^ktb_interface_qa_[a-z0-9_]+$/.test(state.database))
  throw Error('Disposable interface QA database required');
const db = new Client({
  host: '127.0.0.1',
  port: state.port,
  user: 'ktb_interface_qa',
  database: state.database,
});
(async () => {
  await db.connect();
  await db.query('TRUNCATE service_requests CASCADE');
  // Truncating requests also removes their credit ledger rows; keep wallets consistent.
  await db.query('UPDATE universal_time_wallets SET balance_credits=0, frozen_credits=0');
  console.log('Cleared only disposable QA requests, their matching records and earned credits.');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.end());
