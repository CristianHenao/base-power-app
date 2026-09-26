export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          phone: string | null;
          onboarding_completed_at: string | null;
          address: Json | null;
          household: Json | null;
          goals: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          phone?: string | null;
          onboarding_completed_at?: string | null;
          address?: Json | null;
          household?: Json | null;
          goals?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          phone?: string | null;
          onboarding_completed_at?: string | null;
          address?: Json | null;
          household?: Json | null;
          goals?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      home_devices: {
        Row: {
          id: string;
          user_id: string;
          client_key: string;
          name: string;
          kind: string;
          category: string;
          brand: string | null;
          model: string | null;
          watts: number;
          watts_exact: boolean;
          confidence: number;
          notes: string | null;
          is_medical: boolean;
          needs_refrigeration: boolean;
          thumbnail_url: string | null;
          specs: Json;
          nameplate: Json | null;
          nameplate_scanned_at: string | null;
          breakers: Json;
          panel_scanned_at: string | null;
          scanned_at: string;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_key: string;
          name: string;
          kind: string;
          category: string;
          brand?: string | null;
          model?: string | null;
          watts?: number;
          watts_exact?: boolean;
          confidence?: number;
          notes?: string | null;
          is_medical?: boolean;
          needs_refrigeration?: boolean;
          thumbnail_url?: string | null;
          specs?: Json;
          nameplate?: Json | null;
          nameplate_scanned_at?: string | null;
          breakers?: Json;
          panel_scanned_at?: string | null;
          scanned_at?: string;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_key?: string;
          name?: string;
          kind?: string;
          category?: string;
          brand?: string | null;
          model?: string | null;
          watts?: number;
          watts_exact?: boolean;
          confidence?: number;
          notes?: string | null;
          is_medical?: boolean;
          needs_refrigeration?: boolean;
          thumbnail_url?: string | null;
          specs?: Json;
          nameplate?: Json | null;
          nameplate_scanned_at?: string | null;
          breakers?: Json;
          panel_scanned_at?: string | null;
          scanned_at?: string;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "home_devices_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
export type HomeDeviceRow = Database["public"]["Tables"]["home_devices"]["Row"];
export type HomeDeviceInsert =
  Database["public"]["Tables"]["home_devices"]["Insert"];
export type HomeDeviceUpdate =
  Database["public"]["Tables"]["home_devices"]["Update"];
