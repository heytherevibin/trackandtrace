import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { messages } from "@/messages";
import { currentUser } from "@/services/session";
import { isSupabaseConfigured } from "@/services/supabase/public-env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: messages.auth.title };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  if (await currentUser()) redirect("/account");
  const { error } = await searchParams;
  return <LoginForm configured={isSupabaseConfigured()} error={typeof error === "string" ? error : null} />;
}
