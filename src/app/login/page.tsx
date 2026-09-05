"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Bezel, Button, PlateLabel } from "@/components/ui";
import { Sigil } from "@/components/brand";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { status } = useSession();

  if (status === "authenticated") {
    router.replace("/account");
    return null;
  }

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await signIn("nodemailer", {
        email,
        redirectTo: "/account",
        redirect: false,
      });
      if (res?.error) {
        setError("Magic link unavailable — try Google or continue as demo.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Magic link unavailable — try Google or continue as demo.");
    } finally {
      setLoading(false);
    }
  };

  const submitGoogle = () => {
    signIn("google", { redirectTo: "/account" });
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 pb-24 pt-32 sm:px-6 sm:pt-40">
      <div className="flex flex-col items-center text-center">
        <Sigil size={40} />
        <h1 className="mt-5 text-4xl font-[800] tracking-[-0.03em]">Sign in</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-steel">
          Sync your watchlist and saved analyses across devices. No passwords —
          a magic link to your inbox, or a Google account.
        </p>
      </div>

      <Bezel className="mt-10">
        <div className="bezel-plate p-7 sm:p-8">
          {sent ? (
            <div className="flex flex-col items-center py-6 text-center">
              <span className="led bg-go shadow-[0_0_14px_rgba(47,191,113,0.7)]" />
              <h2 className="mt-4 text-lg font-semibold">Link dispatched</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-steel">
                A one-time sign-in link has been sent to{" "}
                <span className="text-bone">{email || "your inbox"}</span>.
                Check your email and click the link to continue.
              </p>
            </div>
          ) : (
            <form onSubmit={submitEmail} className="space-y-4">
              <label className="block">
                <PlateLabel>Work email</PlateLabel>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="well mt-2 w-full px-4 py-3.5 font-data text-[14px] text-bone placeholder:text-steel/50 focus:outline-none"
                />
              </label>
              {error && (
                <p className="text-[12px] text-stop">{error}</p>
              )}
              <Button type="submit" variant="primary" className="w-full justify-center" disabled={loading}>
                {loading ? "Sending…" : "Email me a sign-in link"}
              </Button>
              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-(--line)" />
                <span className="font-data text-[10px] tracking-[0.2em] text-steel">OR</span>
                <span className="h-px flex-1 bg-(--line)" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                onClick={submitGoogle}
              >
                Continue with Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                onClick={() => router.push("/account")}
              >
                Continue without an account
              </Button>
            </form>
          )}
        </div>
      </Bezel>
    </div>
  );
}
