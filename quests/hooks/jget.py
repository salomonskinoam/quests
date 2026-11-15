"""quests hooks: print one value of the JSON on stdin, by a dotted key ("session_id", "quests.installLocation").
A missing key, a null or unreadable JSON prints nothing; true and false print as "true" and "false". Stands in for
jq, so the hooks need only bash and python3.  Usage: python3 -I jget.py <key> < file.json
     python3 -I jget.py --object k1 v1 k2 v2 ...   prints {"k1": "v1", "k2": "v2"}
"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8', newline='\n')  # the same bytes on Windows
if sys.argv[1] == '--object':
    print(json.dumps(dict(zip(sys.argv[2::2], sys.argv[3::2]))))
    sys.exit(0)
try:
    value = json.loads(sys.stdin.buffer.read().decode('utf-8'))
    for key in sys.argv[1].split('.'):
        value = value.get(key) if isinstance(value, dict) else None
except ValueError:
    value = None
if isinstance(value, bool):
    print('true' if value else 'false')
elif value is not None:
    print(value)
