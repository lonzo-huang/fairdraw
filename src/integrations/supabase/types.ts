export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          clicks: number
          conditions: Json
          created_at: string
          currency: string
          description: string
          ends_at: string
          escrow_status: string
          id: string
          owner_id: string
          payment_method: string
          prize: string
          prize_amount: number | null
          questions: Json
          requirement: string
          share_duration: number
          share_image_path: string | null
          share_language: string
          slug: string
          status: string
          target_url: string | null
          title: string
          tweet_url: string | null
          winners_count: number
        }
        Insert: {
          clicks?: number
          conditions?: Json
          created_at?: string
          currency?: string
          description?: string
          ends_at: string
          escrow_status?: string
          id?: string
          owner_id: string
          payment_method?: string
          prize: string
          prize_amount?: number | null
          questions?: Json
          requirement?: string
          share_duration?: number
          share_image_path?: string | null
          share_language?: string
          slug?: string
          status?: string
          target_url?: string | null
          title: string
          tweet_url?: string | null
          winners_count?: number
        }
        Update: {
          clicks?: number
          conditions?: Json
          created_at?: string
          currency?: string
          description?: string
          ends_at?: string
          escrow_status?: string
          id?: string
          owner_id?: string
          payment_method?: string
          prize?: string
          prize_amount?: number | null
          questions?: Json
          requirement?: string
          share_duration?: number
          share_image_path?: string | null
          share_language?: string
          slug?: string
          status?: string
          target_url?: string | null
          title?: string
          tweet_url?: string | null
          winners_count?: number
        }
        Relationships: []
      }
      condition_snapshots: {
        Row: {
          campaign_id: string
          fetched_at: string
          id: string
          metrics: Json
          progress: number
        }
        Insert: {
          campaign_id: string
          fetched_at?: string
          id?: string
          metrics?: Json
          progress?: number
        }
        Update: {
          campaign_id?: string
          fetched_at?: string
          id?: string
          metrics?: Json
          progress?: number
        }
        Relationships: [
          {
            foreignKeyName: "condition_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      draws: {
        Row: {
          campaign_id: string
          candidates: Json
          created_at: string
          drawn_at: string
          list_hash: string
          seed: string
          winners: Json
        }
        Insert: {
          campaign_id: string
          candidates: Json
          created_at?: string
          drawn_at: string
          list_hash: string
          seed: string
          winners: Json
        }
        Update: {
          campaign_id?: string
          candidates?: Json
          created_at?: string
          drawn_at?: string
          list_hash?: string
          seed?: string
          winners?: Json
        }
        Relationships: [
          {
            foreignKeyName: "draws_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          answers: Json
          campaign_id: string
          created_at: string
          eligibility_status: string
          fetched_at: string | null
          fetched_meta: Json | null
          handle: string
          id: string
          payout_address: string | null
          platform: string
          post_url: string
          user_id: string
          verification_source: string | null
        }
        Insert: {
          answers?: Json
          campaign_id: string
          created_at?: string
          eligibility_status?: string
          fetched_at?: string | null
          fetched_meta?: Json | null
          handle: string
          id?: string
          payout_address?: string | null
          platform?: string
          post_url: string
          user_id: string
          verification_source?: string | null
        }
        Update: {
          answers?: Json
          campaign_id?: string
          created_at?: string
          eligibility_status?: string
          fetched_at?: string | null
          fetched_meta?: Json | null
          handle?: string
          id?: string
          payout_address?: string | null
          platform?: string
          post_url?: string
          user_id?: string
          verification_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_tiers: {
        Row: {
          created_at: string
          id: string
          min_amount: number
          rate_percent: number
        }
        Insert: {
          created_at?: string
          id?: string
          min_amount?: number
          rate_percent: number
        }
        Update: {
          created_at?: string
          id?: string
          min_amount?: number
          rate_percent?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          campaign_id: string
          created_at: string
          currency: string
          external_ref: string | null
          id: string
          kind: string
          meta: Json
          provider: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          campaign_id: string
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          kind: string
          meta?: Json
          provider: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          campaign_id?: string
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          kind?: string
          meta?: Json
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          campaign_id: string
          claim_info: string | null
          id: string
          note: string | null
          proof: string | null
          status: string
          stripe_account_id: string | null
          tx_hash: string | null
          updated_at: string
          wallet_address: string | null
          winner_handle: string
        }
        Insert: {
          campaign_id: string
          claim_info?: string | null
          id?: string
          note?: string | null
          proof?: string | null
          status?: string
          stripe_account_id?: string | null
          tx_hash?: string | null
          updated_at?: string
          wallet_address?: string | null
          winner_handle: string
        }
        Update: {
          campaign_id?: string
          claim_info?: string | null
          id?: string
          note?: string | null
          proof?: string | null
          status?: string
          stripe_account_id?: string | null
          tx_hash?: string | null
          updated_at?: string
          wallet_address?: string | null
          winner_handle?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          plan: string
          updated_at: string
          user_id: string
        }
        Insert: {
          plan?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          plan?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          address: string
          chain: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          address: string
          chain?: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          address?: string
          chain?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      entry_count: { Args: { _campaign_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      plan_weekly_limit: { Args: { _plan: string }; Returns: number }
      register_click: { Args: { _slug: string }; Returns: string }
      weekly_usage: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
