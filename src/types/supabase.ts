export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      watchlist_entries: {
        Row: {
          checks: Json
          created_at: string
          id: string
          label: string
          pnr: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checks?: Json
          created_at?: string
          id?: string
          label: string
          pnr: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checks?: Json
          created_at?: string
          id?: string
          label?: string
          pnr?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      console_auth_accept_invite: {
        Args: {
          p_environment: string
          p_name: string
          p_token_hash: string
          p_user: string
        }
        Returns: Json
      }
      console_auth_activate_member: {
        Args: { p_member: string }
        Returns: boolean
      }
      console_auth_keys_for_member: {
        Args: { p_member: string }
        Returns: Json
      }
      console_auth_member_by_email: { Args: { p_email: string }; Returns: Json }
      console_auth_new_challenge: {
        Args: {
          p_challenge: string
          p_digest: string
          p_member: string
          p_purpose: string
          p_session: string
        }
        Returns: string
      }
      console_auth_owner_addresses: { Args: never; Returns: string[] }
      console_auth_read_challenge: {
        Args: { p_challenge: string; p_member: string; p_purpose: string }
        Returns: Json
      }
      console_auth_read_settings: {
        Args: { p_environment: string }
        Returns: Json
      }
      console_auth_record_key: {
        Args: {
          p_counter: number
          p_credential_id: string
          p_member: string
          p_name: string
          p_public_key: string
          p_transports: string[]
          p_type: string
        }
        Returns: string
      }
      console_auth_redeem_setup_link: {
        Args: {
          p_email: string
          p_environment: string
          p_name: string
          p_token_hash: string
          p_user: string
        }
        Returns: Json
      }
      console_auth_revoke_member_sessions: {
        Args: { p_except: string; p_member: string }
        Returns: number
      }
      console_auth_revoke_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      console_auth_session: { Args: { p_session_id: string }; Returns: Json }
      console_auth_setup_link: { Args: { p_token_hash: string }; Returns: Json }
      console_auth_start_session: {
        Args: {
          p_address_hash: string
          p_device_label: string
          p_member: string
          p_session_id: string
        }
        Returns: undefined
      }
      console_auth_take_challenge: {
        Args: { p_challenge: string; p_member: string; p_purpose: string }
        Returns: Json
      }
      console_auth_touch_key: {
        Args: { p_counter: number; p_key: string }
        Returns: undefined
      }
      console_auth_verify_session: {
        Args: { p_key_id: string; p_session_id: string }
        Returns: undefined
      }
      console_auth_write_audit: {
        Args: {
          p_action: string
          p_actor: string
          p_actor_name: string
          p_actor_role: string
          p_address_hash: string
          p_after: Json
          p_before: Json
          p_category: string
          p_environment: string
          p_key_id: string
          p_reason: string
          p_result: string
          p_session_label: string
          p_target: string
        }
        Returns: string
      }
      console_me: { Args: never; Returns: Json }
      console_save_settings: {
        Args: {
          p_changes: Json
          p_environment: string
          p_reason: string
          p_version: number
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

