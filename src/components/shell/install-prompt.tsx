"use client";

import { DismissRegular } from "@/components/icons";
import { Mark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { messages } from "@/messages";
import { useInstallPrompt } from "@/services/stores/install-prompt";

/** A quiet plate above the tab bar offering the install; dismissal sleeps it for a month. */
export function InstallPrompt() {
  const { platform, visible, install, dismiss } = useInstallPrompt();
  if (!visible) return null;
  const m = messages.shell.install;
  return (
    <aside className="fixed inset-x-0 bottom-(--tabbar-height) z-nav px-3 pb-2 md:bottom-4 md:left-auto md:right-4 md:w-auto md:px-0" role="complementary" aria-label={m.title} data-testid="install-prompt">
      <div className="panel mx-auto flex w-full max-w-prose items-center gap-3 bg-surface-2 p-3 shadow-2 md:w-96">
        <Mark size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-1">{m.title}</p>
          <p className="truncate text-xs text-ink-2">{platform === "ios" ? m.iosHint : m.detail}</p>
        </div>
        {platform === "chromium" ? (
          <Button variant="primary" size="sm" onClick={install}>
            {m.action}
          </Button>
        ) : null}
        <IconButton label={messages.common.dismiss} size="sm" icon={<DismissRegular className="size-4" aria-hidden="true" />} onClick={dismiss} data-testid="install-dismiss" />
      </div>
    </aside>
  );
}
