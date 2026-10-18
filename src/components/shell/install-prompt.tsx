"use client";

import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import { useInstallPrompt } from "@/services/stores/install-prompt";

/**
 * v4's install plate: on the landing, under the check, once a check has come back with a record — the moment the
 * installed check is worth having. "Install" where the browser offers it (Chromium); on iPhone, the Share hint. Not now
 * sleeps it for a month (install-prompt store).
 */
export function InstallPrompt({ shown }: { readonly shown: boolean }) {
  const { platform, visible, install, dismiss } = useInstallPrompt();
  if (!shown || !visible) return null;
  const m = messages.shell.install;
  return (
    <section aria-label={m.title} data-testid="install-prompt" className="nb-rise ml-auto max-w-[560px] pb-4">
      <Plate as="div" title={m.title} meta={[m.meta]} padding="sm" corners={false} bodyClassName="flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="m-0 min-w-[200px] flex-1 text-sm leading-5 text-ink-2">
          {m.detail}
          {platform === "ios" ? (
            <>
              <br />
              <span className="font-figure text-xs leading-4 text-ink-3">{m.iosHint}</span>
            </>
          ) : null}
        </p>
        {platform === "chromium" ? (
          <Button variant="primary" onClick={install}>
            {m.action}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={dismiss} data-testid="install-dismiss">
          {m.later}
        </Button>
      </Plate>
    </section>
  );
}
