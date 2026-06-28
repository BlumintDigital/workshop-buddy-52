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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          record_id: string | null
          summary: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          record_id?: string | null
          summary?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          record_id?: string | null
          summary?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      admin_onboarding_progress: {
        Row: {
          created_at: string
          dismissed_at: string | null
          skipped_steps: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          skipped_steps?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          skipped_steps?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          client_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          notes: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          client_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          notes?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          client_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          notes?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          active: boolean
          created_at: string
          expires_at: string | null
          id: string
          link_label: string | null
          link_url: string | null
          message: string | null
          severity: Database["public"]["Enums"]["broadcast_severity"]
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          link_label?: string | null
          link_url?: string | null
          message?: string | null
          severity?: Database["public"]["Enums"]["broadcast_severity"]
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          link_label?: string | null
          link_url?: string | null
          message?: string | null
          severity?: Database["public"]["Enums"]["broadcast_severity"]
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          created_at: string
          description: string
          id: string
          page_url: string | null
          severity: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          page_url?: string | null
          severity?: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          page_url?: string | null
          severity?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      dismissed_broadcasts: {
        Row: {
          broadcast_id: string
          dismissed_at: string | null
          user_id: string
        }
        Insert: {
          broadcast_id: string
          dismissed_at?: string | null
          user_id: string
        }
        Update: {
          broadcast_id?: string
          dismissed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dismissed_broadcasts_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      dismissed_notices: {
        Row: {
          dismissed_at: string | null
          notice_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          notice_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
          notice_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dismissed_notices_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "system_notices"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          min_stock: number
          name: string
          quantity: number
          sku: string | null
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          min_stock?: number
          name: string
          quantity?: number
          sku?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          min_stock?: number
          name?: string
          quantity?: number
          sku?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_transactions: {
        Row: {
          created_at: string
          id: string
          item_id: string
          job_id: string | null
          notes: string | null
          quantity: number
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          job_id?: string | null
          notes?: string | null
          quantity: number
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          job_id?: string | null
          notes?: string | null
          quantity?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          description: string
          id: string
          invoice_id: string
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string
          job_id: string | null
          notes: string | null
          paid_at: string | null
          status: string
          stripe_payment_url: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          job_id?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: string
          stripe_payment_url?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          job_id?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: string
          stripe_payment_url?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          job_id: string
          task_id: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number
          file_type?: string
          id?: string
          job_id: string
          task_id?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          job_id?: string
          task_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_attachments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      job_comments: {
        Row: {
          body: string
          created_at: string
          id: number
          is_internal: boolean
          job_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          is_internal?: boolean
          job_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          is_internal?: boolean
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_comments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_ratings: {
        Row: {
          client_id: string
          comment: string | null
          created_at: string
          id: string
          job_id: string
          rating: number
        }
        Insert: {
          client_id: string
          comment?: string | null
          created_at?: string
          id?: string
          job_id: string
          rating: number
        }
        Update: {
          client_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          job_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_ratings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_task_notes: {
        Row: {
          created_at: string
          id: string
          note: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_task_notes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      job_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          job_id: string
          order_index: number | null
          status: string
          title: string
          updated_at: string
          value: number | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          job_id: string
          order_index?: number | null
          status?: string
          title: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          job_id?: string
          order_index?: number | null
          status?: string
          title?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_updates: {
        Row: {
          created_at: string
          id: string
          job_id: string
          notes: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_updates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          actual_hours: number | null
          assigned_staff_id: string | null
          client_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_hours?: number | null
          assigned_staff_id?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_hours?: number | null
          assigned_staff_id?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      mfa_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_rate_limits: {
        Row: {
          action: string
          attempt_count: number
          locked_until: string | null
          updated_at: string
          user_id: string
          window_started_at: string
        }
        Insert: {
          action: string
          attempt_count?: number
          locked_until?: string | null
          updated_at?: string
          user_id: string
          window_started_at?: string
        }
        Update: {
          action?: string
          attempt_count?: number
          locked_until?: string | null
          updated_at?: string
          user_id?: string
          window_started_at?: string
        }
        Relationships: []
      }
      mfa_trusted_devices: {
        Row: {
          created_at: string
          device_label: string | null
          expires_at: string
          id: string
          last_used_at: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          expires_at: string
          id?: string
          last_used_at?: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      monthly_revenue_goals: {
        Row: {
          created_at: string
          goal_amount: number
          id: number
          month: number
          set_by: string | null
          year: number
        }
        Insert: {
          created_at?: string
          goal_amount: number
          id?: never
          month: number
          set_by?: string | null
          year: number
        }
        Update: {
          created_at?: string
          goal_amount?: number
          id?: never
          month?: number
          set_by?: string | null
          year?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          company_name: string | null
          contact_person: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          is_super_admin: boolean
          last_sign_in_at: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          is_super_admin?: boolean
          last_sign_in_at?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_super_admin?: boolean
          last_sign_in_at?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      signup_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string | null
          max_uses: number | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          uses_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          uses_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          uses_count?: number
        }
        Relationships: []
      }
      system_notices: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          message: string | null
          title: string
          url: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          message?: string | null
          title: string
          url?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          message?: string | null
          title?: string
          url?: string | null
          user_id?: string | null
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
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workshop_admin_contacts: {
        Row: {
          id: number
          super_admin_email: string | null
          updated_at: string
          vapid_private_key: string | null
          vapid_public_key: string | null
        }
        Insert: {
          id?: number
          super_admin_email?: string | null
          updated_at?: string
          vapid_private_key?: string | null
          vapid_public_key?: string | null
        }
        Update: {
          id?: number
          super_admin_email?: string | null
          updated_at?: string
          vapid_private_key?: string | null
          vapid_public_key?: string | null
        }
        Relationships: []
      }
      workshop_settings: {
        Row: {
          address: string | null
          contact_email: string | null
          currency: string | null
          default_tax_rate: number | null
          email_notifications_enabled: boolean | null
          feature_flags: Json | null
          from_email: string | null
          id: number
          instance_version: string | null
          login_image_url: string | null
          logo_url: string | null
          monthly_goal: number | null
          notify_job_status: boolean | null
          notify_low_inventory: boolean | null
          notify_new_appointment: boolean | null
          phone: string | null
          vapid_public_key: string | null
          workshop_name: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          currency?: string | null
          default_tax_rate?: number | null
          email_notifications_enabled?: boolean | null
          feature_flags?: Json | null
          from_email?: string | null
          id?: number
          instance_version?: string | null
          login_image_url?: string | null
          logo_url?: string | null
          monthly_goal?: number | null
          notify_job_status?: boolean | null
          notify_low_inventory?: boolean | null
          notify_new_appointment?: boolean | null
          phone?: string | null
          vapid_public_key?: string | null
          workshop_name?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          currency?: string | null
          default_tax_rate?: number | null
          email_notifications_enabled?: boolean | null
          feature_flags?: Json | null
          from_email?: string | null
          id?: number
          instance_version?: string | null
          login_image_url?: string | null
          logo_url?: string | null
          monthly_goal?: number | null
          notify_job_status?: boolean | null
          notify_low_inventory?: boolean | null
          notify_new_appointment?: boolean | null
          phone?: string | null
          vapid_public_key?: string | null
          workshop_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      workshop_settings_public: {
        Row: {
          currency: string | null
          id: number | null
          login_image_url: string | null
          logo_url: string | null
          workshop_name: string | null
        }
        Insert: {
          currency?: string | null
          id?: number | null
          login_image_url?: string | null
          logo_url?: string | null
          workshop_name?: string | null
        }
        Update: {
          currency?: string | null
          id?: number | null
          login_image_url?: string | null
          logo_url?: string | null
          workshop_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_job_completion_stats: {
        Args: never
        Returns: {
          count: number
          status: string
        }[]
      }
      get_monthly_bookings: {
        Args: never
        Returns: {
          count: number
          month: string
        }[]
      }
      get_monthly_revenue: {
        Args: never
        Returns: {
          month: string
          revenue: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_feature_enabled: { Args: { feature_key: string }; Returns: boolean }
      redeem_signup_code: {
        Args: { _code: string }
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
          valid: boolean
        }[]
      }
      set_feature_flag: {
        Args: { feature_enabled: boolean; feature_key: string }
        Returns: {
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "feature_flags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff" | "client"
      broadcast_severity: "info" | "warning" | "critical"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "manager", "staff", "client"],
      broadcast_severity: ["info", "warning", "critical"],
    },
  },
} as const
