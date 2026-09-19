import type { Metadata } from "next";
import { Mark } from "@/components/brand/mark";
import { SignedOutFrame } from "@/console/components/signed-out-frame";
import { consoleMessages } from "@/console/messages";
import { SignInForm } from "./sign-in-form";

const m = consoleMessages.signIn;

export const metadata: Metadata = { title: m.pageTitle };

export default function ConsoleSignInPage() {
  return (
    <SignedOutFrame>
      <span className="inline-flex">
        <Mark size={40} />
      </span>
      <h1 className="optical-hang mt-6 text-5xl tracking-display">{m.title}</h1>
      <p className="mt-3.5 text-base text-ink-2">{m.lead}</p>
      <div className="mt-8">
        <SignInForm />
      </div>
    </SignedOutFrame>
  );
}
