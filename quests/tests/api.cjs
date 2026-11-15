// Call the running page's API as the user, for checks: node quests/tests/api.cjs <METHOD> <path> [json body]
// Signs in as the user of the server of this folder (or QUESTS_INSTANCE), see env.cjs.

const [method, route, body] = process.argv.slice(2);
const { base, token, databasePath, chrome } = require('./env.cjs');

fetch(`${base}${route}`, {
  method,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body,
}).then(async (r) => {
  console.log(await r.text());
  process.exit(r.ok ? 0 : 1);
});
