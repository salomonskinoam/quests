// quests: prints the last N normalized messages of a chat as the page receives them (type, role, head of content).
//   node quests/tests/history-peek.cjs <sessionId> [n]

const [sessionId, nArg] = process.argv.slice(2);
const n = Number(nArg || 40);
const { base, token, databasePath, chrome } = require('./env.cjs');

(async () => {
  const response = await fetch(`${base}/api/providers/sessions/${encodeURIComponent(sessionId)}/messages?limit=${n}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await response.json();
  const messages = json?.data?.messages ?? json?.messages ?? [];
  for (const m of messages) {
    const head = String(m.content ?? m.displayText ?? '').replace(/\s+/g, ' ').slice(0, 70);
    console.log([m.timestamp?.slice(11, 19), m.type, m.role ?? '', m.isToolUse ? `tool:${m.toolName}` : '', m.isThinking ? 'thinking' : '', head].join(' | '));
  }
  console.log('total', messages.length, 'keys', Object.keys(json?.data ?? json).join(','));
})();
