import { useEffect, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';

/** The part of a repo's Personalize settings this notice reads (server/modules/personalize). */
type Repo = { path: string; name: string; enabled: boolean };

const HIDDEN_KEY = 'quests.offNotice.hidden';
const LINK = 'rounded-sm px-1.5 py-0.5 text-[12px] hover:bg-[#2a2d2e]';

const hiddenPaths = (): string[] => {
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as string[]; } catch { return []; }
};

/**
 * quests: one line per repo of this server that has no quests.json. Such a repo's chats show in the list but never
 * say whether they wait for the user, so the line offers the default quests.json ({}: one area "general", closing
 * commits without a push). "Hide" keeps the repo off and remembers that in this browser.
 */
export default function QuestsOffNotice() {
  const [off, setOff] = useState<Repo[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    authenticatedFetch('/api/quests/personalize')
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const hidden = hiddenPaths();
        setOff(((json?.data?.repos ?? []) as Repo[]).filter((r) => !r.enabled && !hidden.includes(r.path)));
      })
      .catch(() => { /* the notice is a hint: no list, no hint */ });
  }, []);

  const drop = (repo: Repo) => setOff((all) => all.filter((r) => r.path !== repo.path));
  const turnOn = async (repo: Repo) => {
    const response = await authenticatedFetch('/api/quests/personalize/repo', {
      method: 'PUT',
      body: JSON.stringify({ path: repo.path, enabled: true, areas: '', finishFile: '', finishSteps: '', finishCommand: '', drawerQuestion: '' }),
    });
    if (!response.ok) { setError(`Could not write quests.json in ${repo.name} (${response.status}).`); return; }
    drop(repo);
  };
  const hide = (repo: Repo) => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenPaths(), repo.path]));
    drop(repo);
  };

  return (
    <>
      {off.map((repo) => (
        <div key={repo.path} data-quests-queue="quests-off" title={repo.path} className="mx-2 mb-1 rounded-sm border border-[#665c2a] bg-[#3a3520] px-2 py-1 text-[12px] text-[#e2d9a8]">
          Quests is off in <b>{repo.name}</b>: its chats cannot say when they wait for you.
          <div className="mt-0.5 flex gap-1">
            <button type="button" className={`${LINK} font-semibold text-white`} title="Writes a default quests.json in the repo. New chats there use it. Change it later with Personalize." onClick={() => void turnOn(repo)}>Turn on</button>
            <button type="button" className={LINK} onClick={() => hide(repo)}>Hide</button>
          </div>
        </div>
      ))}
      {error && <p className="mx-2 mb-1 text-[12px] text-red-400">{error}</p>}
    </>
  );
}
