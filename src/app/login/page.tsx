import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/services/session";
import { isSupabaseConfigured } from "@/services/supabase/public-env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/account");
  const { error } = await searchParams;
  return <LoginForm configured={isSupabaseConfigured()} error={error ?? null} />;
}
