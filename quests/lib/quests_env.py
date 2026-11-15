#!/usr/bin/env python3
"""quests: the environment of one quests server, for the hooks and scripts (the server's twin is
server/shared/quests-instance.ts). The contract: quests/INTERFACE.md.

~/.config/quests/user.env is the user's (TICKETS_REPO, QUESTS_USER, QUESTS_TZ). ~/.config/quests/<instance>.env is one
server's (QUESTS_INSTANCE, SERVER_PORT, DATABASE_PATH, QUESTS_UNIT_PREFIX, PROJECT_ROOTS, and it may override
TICKETS_REPO). The instance is $QUESTS_INSTANCE when set (the server, its chat services and listeners), else the one
whose PROJECT_ROOTS holds the folder (a chat started anywhere else), else the one with no PROJECT_ROOTS.

Every key has a default (defaults() below), so no file is needed: with none there is one server, "main", on port
3001, serving every repo, with no tickets repo.

  quests_env.py --shell [folder]    prints `export KEY=value` lines for bash: eval "$(quests_env.py --shell)"
  quests_env.py --test              the self-check
"""
import getpass
import os
import re
import shlex
import sys

CONFIG = os.path.expanduser('~/.config/quests')
CHECKOUT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__)))).replace(os.sep, '/')


def defaults(instance):
    """The value of every key no file sets. An empty QUESTS_TZ is the system's time zone, an empty TICKETS_REPO
    no tickets, an empty PROJECT_ROOTS every repo."""
    return {
        'TICKETS_REPO': '', 'QUESTS_USER': getpass.getuser(), 'QUESTS_TZ': '', 'QUESTS_HOME': CHECKOUT,
        'QUESTS_INSTANCE': instance, 'QUESTS_CHECKOUT': CHECKOUT, 'SERVER_PORT': '3001',
        'DATABASE_PATH': f'~/.config/quests/{instance}.db',
        'QUESTS_UNIT_PREFIX': 'quests' if instance == 'main' else f'quests-{instance}', 'PROJECT_ROOTS': '',
    }


def read(path):
    out = {}
    for line in open(path):
        m = re.match(r'^([A-Z_][A-Z0-9_]*)=(.*)$', line.strip())
        if m:
            out[m.group(1)] = m.group(2)
    return out


def norm(p):
    # normcase: case-blind with one separator on Windows, unchanged elsewhere
    return os.path.normcase(os.path.realpath(p))


def roots(values):
    # PROJECT_ROOTS is `:`-separated, `;` on Windows (os.pathsep), like PATH
    return [norm(p) for p in values.get('PROJECT_ROOTS', '').split(os.pathsep) if p]


def repo_of(folder):
    return re.sub(r'[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$', '', norm(folder))


def resolve(folder, config=CONFIG, instance=None):
    """The merged environment of the server that serves `folder`."""
    files = sorted(os.listdir(config)) if os.path.isdir(config) else []
    user = read(os.path.join(config, 'user.env')) if 'user.env' in files else {}
    servers = {f[:-4]: read(os.path.join(config, f)) for f in files if f.endswith('.env') and f != 'user.env'} or {'main': {}}
    if instance:
        name = instance
    else:
        repo = repo_of(folder)
        mine = [n for n, s in servers.items() if any(repo == r or repo.startswith(r.rstrip(os.sep) + os.sep) for r in roots(s))]
        name = mine[0] if mine else next((n for n, s in servers.items() if not roots(s)), next(iter(servers)))
    env = {**defaults(name), **user, **servers.get(name, {})}
    env['DATABASE_PATH'] = os.path.expanduser(env['DATABASE_PATH'])
    return env


def current():
    """The environment of the server this process belongs to."""
    return resolve(os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd(), instance=os.environ.get('QUESTS_INSTANCE'))


def test():
    import tempfile
    d = tempfile.mkdtemp()
    open(f'{d}/user.env', 'w').write('TICKETS_REPO=me/tickets\nQUESTS_USER=Ann\nQUESTS_TZ=UTC\n')
    open(f'{d}/main.env', 'w').write('QUESTS_INSTANCE=main\nDATABASE_PATH=/db/main\nQUESTS_UNIT_PREFIX=quests\n')
    open(f'{d}/demo.env', 'w').write(f'QUESTS_INSTANCE=demo\nDATABASE_PATH=/db/demo\nQUESTS_UNIT_PREFIX=quests-demo\n'
                                     f'PROJECT_ROOTS={d}/other{os.pathsep}{d}/demo\nTICKETS_REPO=me/demo-tickets\n')
    os.makedirs(f'{d}/demo/.claude/worktrees/x')
    assert resolve(f'{d}/demo', d)['QUESTS_INSTANCE'] == 'demo'
    assert resolve(f'{d}/demo/.claude/worktrees/x', d)['TICKETS_REPO'] == 'me/demo-tickets'
    assert resolve('/elsewhere', d)['TICKETS_REPO'] == 'me/tickets'
    assert resolve('/elsewhere', d, instance='demo')['DATABASE_PATH'] == '/db/demo'
    empty = resolve('/elsewhere', f'{d}/none')  # no config folder at all
    assert (empty['QUESTS_INSTANCE'], empty['SERVER_PORT'], empty['TICKETS_REPO']) == ('main', '3001', '')
    assert os.path.isfile(f"{empty['QUESTS_CHECKOUT']}/quests/lib/quests_env.py")
    print('quests_env: ok')


if __name__ == '__main__':
    if sys.argv[1:2] == ['--test']:
        test()
    elif sys.argv[1:2] == ['--shell']:
        sys.stdout.reconfigure(newline='\n')  # bash evals this: no \r on Windows
        env = resolve(sys.argv[2], instance=os.environ.get('QUESTS_INSTANCE')) if len(sys.argv) > 2 else current()
        print('\n'.join(f'export {k}={shlex.quote(v)}' for k, v in env.items()))
    else:
        sys.exit(__doc__)
