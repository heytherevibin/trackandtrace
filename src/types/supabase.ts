// Database types for the public schema. Mirrors supabase/migrations and was checked
// against the hosted project on 2026-09-17. Regenerate after a migration with
// `npm run db:types:linked` (hosted) or `npm run db:types` (local stack).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      watchlist_entries: {
        Row: {
          id: string;
          user_id: string;
          pnr: string;
          label: string;
          checks: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          pnr: string;
          label: string;
          checks?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          pnr?: string;
          label?: string;
          checks?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
