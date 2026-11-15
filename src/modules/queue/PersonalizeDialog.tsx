import { useEffect, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';

/** One repo as the server's Personalize form gives it (server/modules/personalize). */
type RepoSettings = {
  path: string; name: string; enabled: boolean; areas: string;
  finishFile: string; finishSteps: string; finishCommand: string; drawerQuestion: string;
};
type UserSettings = { user: string; timeZone: string; ticketsRepo: string };

const INPUT = 'w-full rounded-sm border border-[#505050] bg-[#3c3c3c] px-2 py-1 text-[13px] text-[#cccccc] placeholder:text-[#7f8081]';
const LABEL = 'mt-3 block text-[12px] font-semibold text-[#cccccc]';
const HINT = 'mb-1 block text-[12px] font-normal text-[#9d9d9d]';
const SAVE = 'rounded-sm bg-[#3794ff] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#2f7fe0] disabled:opacity-50';
const PLAIN = 'rounded-sm border border-[#454647] px-4 py-1.5 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e]';

async function call<T>(route: string, body?: unknown): Promise<T> {
  const response = await authenticatedFetch(`/api/quests/personalize${route}`, body === undefined ? undefined : { method: 'PUT', body: JSON.stringify(body) });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error?.message ?? json?.error ?? `Saving failed (${response.status}).`);
  return json.data as T;
}

/** A labelled field; `hint` says what the value does and what an empty one means. */
function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className={LABEL}>
      {label}
      <span className={HINT}>{hint}</span>
      {children}
    </label>
  );
}

/**
 * quests: the Personalize form, opened from the queue's toolbar. Two parts: the user's own settings (name, time
 * zone, tickets repo) and, per repo of this server, whether quests is on there and how its chats are named and
 * closed (the repo's quests.json, quests/INTERFACE.md). Every field may stay empty: the hint names the default.
 */
export default function PersonalizeDialog({ onClose }: { onClose: () => void }) {
  const [user, setUser] = useState<UserSettings | null>(null);
  const [repos, setRepos] = useState<RepoSettings[]>([]);
  const [shown, setShown] = useState('');
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call<{ user: UserSettings; repos: RepoSettings[] }>('').then((data) => {
      setUser(data.user);
      setRepos(data.repos);
      setShown(data.repos[0]?.path ?? '');
    }, (error: unknown) => setNote({ text: String(error), bad: true }));
  }, []);

  const repo = repos.find((r) => r.path === shown);
  const edit = (change: Partial<RepoSettings>) => setRepos((all) => all.map((r) => (r.path === shown ? { ...r, ...change } : r)));
  const save = (work: () => Promise<void>, done: string) => {
    setBusy(true);
    setNote(null);
    work().then(() => setNote({ text: done, bad: false }), (error: unknown) => setNote({ text: String(error instanceof Error ? error.message : error), bad: true }))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[620px] max-w-[94vw] overflow-y-auto rounded-md border border-[#454647] bg-[#1E1F22] p-5 text-[#cccccc] shadow-2xl">
        <DialogTitle className="not-sr-only text-[15px] font-semibold leading-snug text-white">Personalize</DialogTitle>

        {user && (
          <section data-quests-personalize="user">
            <h3 className="mt-3 border-b border-[#454647] pb-1 text-[13px] font-semibold text-white">You</h3>
            <Field label="Your name" hint="How the chats address you.">
              <input className={INPUT} value={user.user} onChange={(e) => setUser({ ...user, user: e.target.value })} />
            </Field>
            <Field label="Time zone" hint="For the times the chats and the logs show, for example Europe/Paris.">
              <input className={INPUT} value={user.timeZone} onChange={(e) => setUser({ ...user, timeZone: e.target.value })} />
            </Field>
            <Field label="Tickets repo" hint="A GitHub repo, owner/name, whose open issues join the queue. Empty: no tickets, the queue holds chats only.">
              <input className={INPUT} placeholder="owner/name" value={user.ticketsRepo} onChange={(e) => setUser({ ...user, ticketsRepo: e.target.value })} />
            </Field>
            <div className="mt-3 flex justify-end">
              <button type="button" className={SAVE} disabled={busy}
                onClick={() => save(async () => setUser(await call<UserSettings>('/user', user)), 'Saved. Chats started from now on use it.')}>
                Save
              </button>
            </div>
          </section>
        )}

        <section data-quests-personalize="repo">
          <h3 className="mt-4 border-b border-[#454647] pb-1 text-[13px] font-semibold text-white">Per repo</h3>
          {repos.length === 0 && <p className="mt-2 text-[13px] text-[#9d9d9d]">This server has no project yet. Start a chat in a repo first.</p>}
          {repo && (
            <>
              <select className={`${INPUT} mt-2`} value={shown} onChange={(e) => { setShown(e.target.value); setNote(null); }}>
                {repos.map((r) => <option key={r.path} value={r.path}>{r.name}{r.enabled ? '' : ' (quests off)'}</option>)}
              </select>
              <p className="mt-1 text-[12px] text-[#9d9d9d]">{repo.path}</p>
              <label className="mt-3 flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={repo.enabled} onChange={(e) => edit({ enabled: e.target.checked })} />
                Use quests in this repo
                <span className="text-[12px] text-[#9d9d9d]">(its chats get the reply ending, the name question and the closing check)</span>
              </label>
              {repo.enabled && (
                <>
                  <Field label="Areas" hint={'The second word of a chat name, and a ticket\'s label. Words with spaces between. Empty: one area, "general". Start with $ to give a command that prints them.'}>
                    <input className={INPUT} placeholder="frontend backend docs" value={repo.areas} onChange={(e) => edit({ areas: e.target.value })} />
                  </Field>
                  <Field label="Closing steps" hint="What a chat does when you finalize it, in order, in your words. Empty: it commits what it changed and does not push.">
                    <textarea className={`${INPUT} h-24`} placeholder={'1. Run the tests.\n2. Commit.\n3. Push.'} value={repo.finishSteps} onChange={(e) => edit({ finishSteps: e.target.value })} />
                  </Field>
                  <Field label="Closing steps file" hint="Where those steps are kept in the repo. Empty: quests-finish.md.">
                    <input className={INPUT} placeholder="quests-finish.md" value={repo.finishFile} onChange={(e) => edit({ finishFile: e.target.value })} />
                  </Field>
                  <Field label="Last closing command" hint="The command that is the last closing step, for example git push. Empty: none.">
                    <input className={INPUT} placeholder="git push" value={repo.finishCommand} onChange={(e) => edit({ finishCommand: e.target.value })} />
                  </Field>
                  <Field label="Summary drawer question" hint="The first question the Summary drawer offers about a chat. Empty: none offered.">
                    <input className={INPUT} placeholder="what is this chat about?" value={repo.drawerQuestion} onChange={(e) => edit({ drawerQuestion: e.target.value })} />
                  </Field>
                </>
              )}
              <div className="mt-3 flex justify-end">
                <button type="button" className={SAVE} disabled={busy}
                  onClick={() => save(async () => {
                    const saved = await call<RepoSettings>('/repo', repo);
                    setRepos((all) => all.map((r) => (r.path === saved.path ? { ...saved, name: r.name } : r)));
                  }, repo.enabled ? 'Saved to quests.json. New chats in this repo use it.' : 'Quests is off in this repo.')}>
                  Save this repo
                </button>
              </div>
            </>
          )}
        </section>

        {note && <p className={`mt-3 text-[12px] ${note.bad ? 'text-red-400' : 'text-[#74c991]'}`}>{note.text}</p>}
        <div className="mt-4 flex justify-end">
          <button type="button" className={PLAIN} onClick={onClose}>Close</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
