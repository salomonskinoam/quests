#!/usr/bin/env bash
# quests plugin: runs one hook of the live quests code, the checkout of the quests server that serves this repo
# (QUESTS_CHECKOUT in ~/.config/quests/<instance>.env), so the copy of the plugin Claude Code caches holds no code
# that can go stale. QUESTS_HOME in ~/.config/quests/user.env is the checkout whose resolver picks the server;
# without it, the checkout is where the quests marketplace was added from (claude plugin marketplace add <checkout>).
# A repo opts in by its quests.json at the root (a worktree carries its own); without one, no hook runs.
# Usage (from hooks.json): run.sh <hook script name>. quests/INTERFACE.md.
set -u
[ -f "${CLAUDE_PROJECT_DIR:-}/quests.json" ] || exit 0
# Without python3 no hook can work. Say so once and let the chat go on: a hook must never hold a chat.
command -v python3 >/dev/null || { echo "quests: python3 is not on the PATH; the quests hooks are skipped" >&2; exit 0; }
QUESTS_HOME="$(sed -n 's/^QUESTS_HOME=//p' "$HOME/.config/quests/user.env" 2>/dev/null | tr -d '\r')"
[ -n "$QUESTS_HOME" ] || QUESTS_HOME="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get("quests", {}).get("installLocation", "").replace(chr(92), "/"))' "$HOME/.claude/plugins/known_marketplaces.json" 2>/dev/null)"
[ -n "$QUESTS_HOME" ] || { echo "quests: cannot find the quests checkout: set QUESTS_HOME in ~/.config/quests/user.env (quests/INTERFACE.md)" >&2; exit 2; }
env="$(python3 -I "$QUESTS_HOME/quests/lib/quests_env.py" --shell)" || exit 2
eval "$env"
exec "$QUESTS_CHECKOUT/quests/hooks/$1"
