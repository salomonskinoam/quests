#!/usr/bin/env bash
# quests priority queue: Stop hook, wired by the quests plugin (hooks.json).
# Every reply must end with the queue's closing line, and a reply to the user's message must have a Summary line
# (requirements 107, 112, 113). The hook only guards that they exist; the chat writes what the Summary holds. A failing reply goes back to the chat once.
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
in="$(cat)"
[ "$(python3 -I "$HERE/jget.py" stop_hook_active <<<"$in")" = "true" ] && exit 0  # the second try passes
# A hook that cannot read the reply must never hold a chat: no reply text means nothing to check.
reply="$(python3 -I "$HERE/jget.py" last_assistant_message <<<"$in")"
[ -n "$reply" ] || exit 0
eval "$(python3 -I "$HERE/../lib/quests_env.py" --shell)" || exit 2
# Claude Code hands the reply to the hook; the transcript may not hold it yet when the hook runs.
# Bold labels count ("**Done:** ..."; Noam, 6 Nov: "bolden and put in separate lines the required from me and running").
last="$(sed '/^[[:space:]]*$/d' <<<"$reply" | tail -n 1 | sed 's/\*\*//g')"
closing=""
grep -Eiq '^(waiting for|question|blocker|done)\b[ :]*.+' <<<"$last" || closing="Your reply has no queue closing line. Its last line was: ${last:0:200}"
# A turn woken by an agent, a notification or a listener writes a Summary only when it brings something new
# (requirement 113); the chat decides, the hook checks only turns that answer the user.
summary=""
tp="$(python3 -I "$HERE/jget.py" transcript_path <<<"$in")"
[ -n "$tp" ] && [ "$(python3 -I "$HERE/woken_by.py" "$tp")" = event ] ||
grep -Eq '^[[:space:]]*(\*\*)?Summary:?(\*\*)?:?[[:space:]]*$' <<<"$reply" || summary="Your reply has no \"**Summary**\" line."
[ -z "$closing" ] && [ -z "$summary" ] && exit 0
[ -n "$closing" ] && echo "$closing" >&2
[ -n "$summary" ] && echo "$summary" >&2
# shellcheck source=rules.sh
. "$HERE/rules.sh"
{ ending_rule; wake_rule; queue_rule; echo "Do not write the reply again. Write only what is missing, once: the ending (the Summary part when it was missing, then the closing lines and the queue line)."; } >&2
# The event log (requirement 120): which reply went back, and why.
python3 -I "$HERE/log_event.py" hook stop.sentBack "$(python3 -I "$HERE/jget.py" session_id <<<"$in")" "$(python3 -I "$HERE/jget.py" --object closing "$closing" summary "$summary")"
exit 2
