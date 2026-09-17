// Database types for the public schema. Mirrors supabase/migrations; regenerate
// with `npm run db:types` once a local stack is running. Keep in sync by hand
// until then.

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
