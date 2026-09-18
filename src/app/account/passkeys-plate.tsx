"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { notify } from "@/components/ui/toast";
import { messages } from "@/messages";
import { deletePasskey, listPasskeys, passkeysUsable, registerPasskey, type PasskeyRecord } from "@/services/auth-client";
import { formatDate } from "@/utils/datetime";

// The account's passkeys, in the sheets' grammar: a title-block plate, one hairline row per passkey
// with when it was added and last used, and the device prompt behind "Add a passkey". A dismissed
// prompt changes nothing and says nothing; only a real refusal is reported.

const subscribeNever = () => () => undefined;
const noPasskeysOnServer = () => false;
const META = "text-label leading-normal text-ink-1/70 tnum";

export function PasskeysPlate() {
  const m = messages.account.passkeys;
  const usable = useSyncExternalStore(subscribeNever, passkeysUsable, noPasskeysOnServer);
  const [passkeys, setPasskeys] = useState<readonly PasskeyRecord[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const reload = useCallback(async () => setPasskeys(await listPasskeys()), []);

  useEffect(() => {
    let live = true;
    void listPasskeys().then((list) => {
      if (live) setPasskeys(list);
    });
    return () => {
      live = false;
    };
  }, []);

  const add = async () => {
    if (adding) return;
    setAdding(true);
    const result = await registerPasskey();
    setAdding(false);
    if (result.ok) {
      notify.success(m.saved);
      await reload();
      return;
    }
    if (result.message) notify.error(result.message);
  };

  const remove = async (id: string) => {
    setRemoving(id);
    const result = await deletePasskey(id);
    setRemoving(null);
    if (result.ok) {
      notify.success(m.removed);
      await reload();
      return;
    }
    notify.error(result.message ?? m.failed);
  };

  return (
    <Plate className="mt-8" title={m.legend} titleId="account-passkeys" headingLevel={2} cells="tight">
      <p className="max-w-[64ch] text-sm text-ink-1/74">{m.detail}</p>
      {usable ? null : (
        <p role="status" className="mt-4 text-sm text-accent-soft-ink">
          {m.unsupported}
        </p>
      )}
      {passkeys && passkeys.length > 0 ? (
        <ul aria-label={m.listLabel} className="mt-4 flex flex-col border-t border-line">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base font-semibold leading-normal tracking-head">{passkey.name ?? m.unnamed}</span>
                <span className={`mt-0.5 block ${META}`}>
                  {m.added(formatDate(passkey.createdAt))} · {passkey.lastUsedAt ? m.lastUsed(formatDate(passkey.lastUsedAt)) : m.neverUsed}
                </span>
              </span>
              <Button variant="ghost" aria-label={m.removeNamed(passkey.name ?? m.unnamed)} aria-busy={removing === passkey.id || undefined} onClick={() => void remove(passkey.id)}>
                {m.remove}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {passkeys && passkeys.length === 0 ? (
        <p className="mt-4 text-body text-ink-1/78">{m.none}</p>
      ) : null}
      {usable ? (
        <Button variant="secondary" className="mt-4" aria-busy={adding || undefined} onClick={() => void add()}>
          {adding ? m.adding : m.add}
        </Button>
      ) : null}
    </Plate>
  );
}
