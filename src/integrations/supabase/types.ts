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
      client_requests: {
        Row: {
          client_decision_at: string | null
          client_id: string
          converted_job_id: string | null
          created_at: string
          decline_reason: string | null
          description: string | null
          id: string
          preferred_date: string | null
          priority: string
          quote_expires_at: string | null
          quoted_currency: string | null
          quoted_invoice_id: string | null
          quoted_notes: string | null
          quoted_total: number | null
          request_type: Database["public"]["Enums"]["client_request_type"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["client_request_status"]
          title: string
          updated_at: string
        }
        Insert: {
          client_decision_at?: string | null
          client_id: string
          converted_job_id?: string | null
          created_at?: string
          decline_reason?: string | null
          description?: string | null
          id?: string
          preferred_date?: string | null
          priority?: string
          quote_expires_at?: string | null
          quoted_currency?: string | null
          quoted_invoice_id?: string | null
          quoted_notes?: string | null
          quoted_total?: number | null
          request_type: Database["public"]["Enums"]["client_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["client_request_status"]
          title: string
          updated_at?: string
        }
        Update: {
          client_decision_at?: string | null
          client_id?: string
          converted_job_id?: string | null
          created_at?: string
          decline_reason?: string | null
          description?: string | null
          id?: string
          preferred_date?: string | null
          priority?: string
          quote_expires_at?: string | null
          quoted_currency?: string | null
          quoted_invoice_id?: string | null
          quoted_notes?: string | null
          quoted_total?: number | null
          request_type?: Database["public"]["Enums"]["client_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["client_request_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_converted_job_id_fkey"
            columns: ["converted_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_quoted_invoice_id_fkey"
            columns: ["quoted_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_prefs: {
        Row: {
          card_order: string[]
          hidden: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          card_order?: string[]
          hidden?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          card_order?: string[]
          hidden?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      department_members: {
        Row: {
          created_at: string
          department_id: string
          is_lead: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          is_lead?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          is_lead?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      department_permissions: {
        Row: {
          department_id: string
          permission: string
        }
        Insert: {
          department_id: string
          permission: string
        }
        Update: {
          department_id?: string
          permission?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_permissions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
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
          location: string | null
          min_stock: number
          name: string
          quantity: number
          reorder_quantity: number | null
          sku: string | null
          supplier_id: string | null
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          min_stock?: number
          name: string
          quantity?: number
          reorder_quantity?: number | null
          sku?: string | null
          supplier_id?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          min_stock?: number
          name?: string
          quantity?: number
          reorder_quantity?: number | null
          sku?: string | null
          supplier_id?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
      invoice_pdf_versions: {
        Row: {
          file_path: string
          file_size: number | null
          generated_at: string
          generated_by: string | null
          id: string
          invoice_id: string
          status_at_generation: string | null
          version: number
        }
        Insert: {
          file_path: string
          file_size?: number | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          invoice_id: string
          status_at_generation?: string | null
          version: number
        }
        Update: {
          file_path?: string
          file_size?: number | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          invoice_id?: string
          status_at_generation?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_pdf_versions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          base_total: number | null
          client_id: string
          client_marked_paid_at: string | null
          created_at: string
          currency: string
          discount_amount: number
          discount_reason: string | null
          discount_type: string | null
          discount_value: number
          due_date: string | null
          fx_rate: number
          id: string
          invoice_number: string
          job_id: string | null
          notes: string | null
          paid_at: string | null
          payment_instructions: string | null
          status: string
          stripe_payment_url: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          base_total?: never
          client_id: string
          client_marked_paid_at?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number
          discount_reason?: string | null
          discount_type?: string | null
          discount_value?: number
          due_date?: string | null
          fx_rate?: number
          id?: string
          invoice_number: string
          job_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_instructions?: string | null
          status?: string
          stripe_payment_url?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          base_total?: never
          client_id?: string
          client_marked_paid_at?: string | null
          created_at?: string
          currency?: string
          discount_amount?: number
          discount_reason?: string | null
          discount_type?: string | null
          discount_value?: number
          due_date?: string | null
          fx_rate?: number
          id?: string
          invoice_number?: string
          job_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_instructions?: string | null
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
          kind: string
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
          kind?: string
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
          kind?: string
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
          legacy_update_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          is_internal?: boolean
          job_id: string
          legacy_update_id?: string | null
          source?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          is_internal?: boolean
          job_id?: string
          legacy_update_id?: string | null
          source?: string
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
          completed_at: string | null
          completed_by: string | null
          created_at: string
          department_id: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          job_id: string
          order_index: number | null
          rework_of: string | null
          status: string
          title: string
          updated_at: string
          value: number | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          job_id: string
          order_index?: number | null
          rework_of?: string | null
          status?: string
          title: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          job_id?: string
          order_index?: number | null
          rework_of?: string | null
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
            foreignKeyName: "job_tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_tasks_rework_of_fkey"
            columns: ["rework_of"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          accessories: string | null
          actual_hours: number | null
          assigned_staff_id: string | null
          client_id: string | null
          condition_notes: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          intake_type: string
          make_model: string | null
          priority: string
          received_at: string | null
          received_by: string | null
          ref: string
          serial_number: string | null
          source_request_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          accessories?: string | null
          actual_hours?: number | null
          assigned_staff_id?: string | null
          client_id?: string | null
          condition_notes?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          intake_type?: string
          make_model?: string | null
          priority?: string
          received_at?: string | null
          received_by?: string | null
          ref?: string
          serial_number?: string | null
          source_request_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          accessories?: string | null
          actual_hours?: number | null
          assigned_staff_id?: string | null
          client_id?: string | null
          condition_notes?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          intake_type?: string
          make_model?: string | null
          priority?: string
          received_at?: string | null
          received_by?: string | null
          ref?: string
          serial_number?: string | null
          source_request_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "client_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      labour_rates: {
        Row: {
          hourly_cost: number
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          hourly_cost: number
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          hourly_cost?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string
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
          invite_accepted_at: string | null
          invited_at: string | null
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
          invite_accepted_at?: string | null
          invited_at?: string | null
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
          invite_accepted_at?: string | null
          invited_at?: string | null
          is_active?: boolean
          is_super_admin?: boolean
          last_sign_in_at?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_events: {
        Row: {
          actor_id: string | null
          client_visible: boolean
          created_at: string
          data: NonNullable<Json>
          id: number
          job_id: string
          kind: string
        }
        Insert: {
          actor_id?: string | null
          client_visible?: boolean
          created_at?: string
          data?: NonNullable<Json>
          id?: never
          job_id: string
          kind: string
        }
        Update: {
          actor_id?: string | null
          client_visible?: boolean
          created_at?: string
          data?: NonNullable<Json>
          id?: never
          job_id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quote_items: {
        Row: {
          description: string
          id: string
          position: number
          quantity: number
          quote_id: string
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          position?: number
          quantity?: number
          quote_id: string
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          position?: number
          quantity?: number
          quote_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "project_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quotes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          job_id: string
          kind: string
          notes: string | null
          number: number
          reason: string | null
          schedule_impact_days: number | null
          sent_at: string | null
          status: string
          subtotal: number
          title: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          job_id: string
          kind: string
          notes?: string | null
          number?: number
          reason?: string | null
          schedule_impact_days?: number | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          title?: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          job_id?: string
          kind?: string
          notes?: string | null
          number?: number
          reason?: string | null
          schedule_impact_days?: number | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          title?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_quotes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      project_ref_counters: {
        Row: {
          last_value: number
          period: string
        }
        Insert: {
          last_value?: number
          period: string
        }
        Update: {
          last_value?: number
          period?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          description: string
          id: string
          item_id: string | null
          po_id: string
          position: number
          quantity: number
          quantity_received: number
          request_item_id: string | null
          unit_cost: number
        }
        Insert: {
          description: string
          id?: string
          item_id?: string | null
          po_id: string
          position?: number
          quantity: number
          quantity_received?: number
          request_item_id?: string | null
          unit_cost?: number
        }
        Update: {
          description?: string
          id?: string
          item_id?: string | null
          po_id?: string
          position?: number
          quantity?: number
          quantity_received?: number
          request_item_id?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_request_item_id_fkey"
            columns: ["request_item_id"]
            isOneToOne: false
            referencedRelation: "stock_request_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          decision_note: string | null
          expected_at: string | null
          id: string
          job_id: string | null
          notes: string | null
          ordered_at: string | null
          po_number: string
          quote_file_name: string | null
          quote_file_path: string | null
          received_at: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          decision_note?: string | null
          expected_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          ordered_at?: string | null
          po_number?: string
          quote_file_name?: string | null
          quote_file_path?: string | null
          received_at?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          decision_note?: string | null
          expected_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          ordered_at?: string | null
          po_number?: string
          quote_file_name?: string | null
          quote_file_path?: string | null
          received_at?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
      request_quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          quantity: number
          request_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          quantity?: number
          request_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          request_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_quote_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "client_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_reports: {
        Row: {
          config: NonNullable<Json>
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          config?: NonNullable<Json>
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          config?: NonNullable<Json>
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
          carrier: string | null
          choice_made_at: string | null
          client_notes: string | null
          collector_id_number: string | null
          collector_name: string | null
          collector_phone: string | null
          created_at: string
          currency: string | null
          delivery_address: string | null
          id: string
          job_id: string
          method: string | null
          notified_at: string | null
          preferred_date: string | null
          shipped_at: string | null
          shipped_by: string | null
          shipping_cost: number | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          vehicle_make: string | null
          vehicle_registration: string | null
        }
        Insert: {
          carrier?: string | null
          choice_made_at?: string | null
          client_notes?: string | null
          collector_id_number?: string | null
          collector_name?: string | null
          collector_phone?: string | null
          created_at?: string
          currency?: string | null
          delivery_address?: string | null
          id?: string
          job_id: string
          method?: string | null
          notified_at?: string | null
          preferred_date?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          shipping_cost?: number | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vehicle_make?: string | null
          vehicle_registration?: string | null
        }
        Update: {
          carrier?: string | null
          choice_made_at?: string | null
          client_notes?: string | null
          collector_id_number?: string | null
          collector_name?: string | null
          collector_phone?: string | null
          created_at?: string
          currency?: string | null
          delivery_address?: string | null
          id?: string
          job_id?: string
          method?: string | null
          notified_at?: string | null
          preferred_date?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          shipping_cost?: number | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          vehicle_make?: string | null
          vehicle_registration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
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
      stock_request_items: {
        Row: {
          created_at: string
          description: string
          id: string
          item_id: string | null
          quantity: number
          quantity_issued: number
          request_id: string
          status: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          item_id?: string | null
          quantity: number
          quantity_issued?: number
          request_id: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          item_id?: string | null
          quantity?: number
          quantity_issued?: number
          request_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_request_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "stock_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_requests: {
        Row: {
          created_at: string
          id: string
          job_id: string
          needed_by: string | null
          notes: string | null
          requested_by: string | null
          status: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          needed_by?: string | null
          notes?: string | null
          requested_by?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          needed_by?: string | null
          notes?: string | null
          requested_by?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
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
      task_handoffs: {
        Row: {
          created_at: string
          from_user: string
          hours: number | null
          id: string
          job_id: string
          next_task_id: string | null
          note: string
          task_id: string
        }
        Insert: {
          created_at?: string
          from_user: string
          hours?: number | null
          id?: string
          job_id: string
          next_task_id?: string | null
          note: string
          task_id: string
        }
        Update: {
          created_at?: string
          from_user?: string
          hours?: number | null
          id?: string
          job_id?: string
          next_task_id?: string | null
          note?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_handoffs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_handoffs_next_task_id_fkey"
            columns: ["next_task_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_handoffs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          hours: number
          id: string
          job_id: string
          note: string | null
          task_id: string | null
          user_id: string
          work_date: string
        }
        Insert: {
          created_at?: string
          hours: number
          id?: string
          job_id: string
          note?: string | null
          task_id?: string | null
          user_id: string
          work_date?: string
        }
        Update: {
          created_at?: string
          hours?: number
          id?: string
          job_id?: string
          note?: string | null
          task_id?: string | null
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          permission: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          permission: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          permission?: string
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
          vapid_public_key: string | null
        }
        Insert: {
          id?: number
          super_admin_email?: string | null
          updated_at?: string
          vapid_public_key?: string | null
        }
        Update: {
          id?: number
          super_admin_email?: string | null
          updated_at?: string
          vapid_public_key?: string | null
        }
        Relationships: []
      }
      workshop_settings: {
        Row: {
          address: string | null
          brand_accent_hsl: string | null
          brand_primary_hsl: string | null
          contact_email: string | null
          currency: string | null
          default_tax_rate: number | null
          email_notifications_enabled: boolean | null
          enabled_currencies: string[]
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
          overhead_percent: number
          phone: string | null
          project_ref_prefix: string
          purchase_manager_limit: number
          vapid_public_key: string | null
          workshop_name: string | null
        }
        Insert: {
          address?: string | null
          brand_accent_hsl?: string | null
          brand_primary_hsl?: string | null
          contact_email?: string | null
          currency?: string | null
          default_tax_rate?: number | null
          email_notifications_enabled?: boolean | null
          enabled_currencies?: string[]
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
          overhead_percent?: number
          phone?: string | null
          project_ref_prefix?: string
          purchase_manager_limit?: number
          vapid_public_key?: string | null
          workshop_name?: string | null
        }
        Update: {
          address?: string | null
          brand_accent_hsl?: string | null
          brand_primary_hsl?: string | null
          contact_email?: string | null
          currency?: string | null
          default_tax_rate?: number | null
          email_notifications_enabled?: boolean | null
          enabled_currencies?: string[]
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
          overhead_percent?: number
          phone?: string | null
          project_ref_prefix?: string
          purchase_manager_limit?: number
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
          vapid_public_key: string | null
          workshop_name: string | null
        }
        Insert: {
          currency?: string | null
          id?: number | null
          login_image_url?: string | null
          logo_url?: string | null
          vapid_public_key?: never
          workshop_name?: string | null
        }
        Update: {
          currency?: string | null
          id?: number | null
          login_image_url?: string | null
          logo_url?: string | null
          vapid_public_key?: never
          workshop_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_client_request: {
        Args: { _assigned_staff_id?: string; _request_id: string }
        Returns: string
      }
      add_project_event: {
        Args: {
          _client_visible?: boolean
          _data?: Json
          _job_id: string
          _kind: string
        }
        Returns: undefined
      }
      admin_set_user_role: {
        Args: {
          _caller_user_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      can_approve_purchase: {
        Args: { _amount: number; _user_id: string }
        Returns: boolean
      }
      can_quote: { Args: { _user_id: string }; Returns: boolean }
      can_run_job: { Args: { _user_id: string }; Returns: boolean }
      can_view_job: {
        Args: { _job_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_job_path: {
        Args: { _folder: string; _user_id: string }
        Returns: boolean
      }
      choose_handover: {
        Args: {
          _address?: string
          _job_id: string
          _method: string
          _notes?: string
          _preferred_date?: string
        }
        Returns: undefined
      }
      client_decide_quote: {
        Args: { _approve: boolean; _reason?: string; _request_id: string }
        Returns: string
      }
      client_mark_invoice_paid: {
        Args: { _invoice_id: string }
        Returns: string
      }
      create_project: { Args: { _p: Json }; Returns: string }
      decide_project_quote: {
        Args: { _accept: boolean; _note?: string; _quote_id: string }
        Returns: string
      }
      decide_purchase_order: {
        Args: { _approve: boolean; _note?: string; _po_id: string }
        Returns: string
      }
      decline_client_request: {
        Args: { _reason: string; _request_id: string }
        Returns: undefined
      }
      get_job_completion_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          count: number
          status: string
        }[]
      }
      get_monthly_bookings: {
        Args: Record<PropertyKey, never>
        Returns: {
          count: number
          month: string
        }[]
      }
      get_monthly_revenue: {
        Args: Record<PropertyKey, never>
        Returns: {
          month: string
          revenue: number
        }[]
      }
      get_my_basic_profile: {
        Args: Record<PropertyKey, never>
        Returns: {
          address: string
          avatar_url: string
          company_name: string
          full_name: string
          invite_accepted_at: string
          phone: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      goal_summary: {
        Args: { _from: string; _to: string }
        Returns: {
          delivered_value: number
          handoffs: number
          hours_logged: number
          projects_finished: number
          projects_shipped: number
        }[]
      }
      handoff_task: {
        Args: {
          _hours?: number
          _next_task_id?: string
          _note: string
          _task_id: string
        }
        Returns: string
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_feature_enabled: { Args: { feature_key: string }; Returns: boolean }
      is_storekeeper: { Args: { _user_id: string }; Returns: boolean }
      issue_parts: {
        Args: { _item_id?: string; _quantity: number; _request_item_id: string }
        Returns: undefined
      }
      mark_purchase_ordered: {
        Args: { _expected?: string; _po_id: string }
        Returns: undefined
      }
      mark_shipped: { Args: { _d: Json; _job_id: string }; Returns: undefined }
      my_permissions: { Args: Record<PropertyKey, never>; Returns: string[] }
      next_project_ref: { Args: { _at?: string }; Returns: string }
      notify_ready_to_ship: {
        Args: { _job_id: string; _message?: string }
        Returns: undefined
      }
      notify_users: {
        Args: {
          _link: string
          _message: string
          _title: string
          _users: string[]
        }
        Returns: undefined
      }
      permission_holders: { Args: { _permission: string }; Returns: string[] }
      permission_keys: { Args: Record<PropertyKey, never>; Returns: string[] }
      project_financials: {
        Args: { _from?: string; _to?: string }
        Returns: {
          assignees: string[]
          charged: number
          client_name: string
          due_date: string
          estimated_hours: number
          finished_at: string
          forecast_cost: number
          forecast_profit: number
          id: string
          intake_type: string
          invoiced: number
          labour_cost: number
          labour_hours: number
          margin_pct: number
          materials_needed_qty: number
          materials_needed_value: number
          materials_used_cost: number
          outcome: string
          overhead: number
          paid: number
          profit: number
          quoted_pending: number
          received_at: string
          ref: string
          shipping_cost: number
          status: string
          title: string
          total_cost: number
        }[]
      }
      project_quote_label: {
        Args: { _job_id: string; _kind: string; _number: number }
        Returns: string
      }
      quality_check: {
        Args: {
          _job_id: string
          _note?: string
          _pass: boolean
          _rework_task_ids?: string[]
        }
        Returns: string
      }
      receive_purchase_order: {
        Args: { _lines: Json; _po_id: string }
        Returns: string
      }
      reception_clients: {
        Args: Record<PropertyKey, never>
        Returns: {
          company_name: string
          email: string
          full_name: string
          id: string
          phone: string
        }[]
      }
      redeem_signup_code: {
        Args: { _code: string }
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
          valid: boolean
        }[]
      }
      refresh_stock_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      request_parts: {
        Args: {
          _items: Json
          _job_id: string
          _needed_by?: string
          _notes?: string
          _task_id?: string
        }
        Returns: string
      }
      return_parts: {
        Args: {
          _item_id: string
          _job_id: string
          _note?: string
          _quantity: number
        }
        Returns: undefined
      }
      review_change_request: {
        Args: { _approve: boolean; _note?: string; _quote_id: string }
        Returns: string
      }
      send_project_quote: { Args: { _quote_id: string }; Returns: string }
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
      submit_purchase_order: { Args: { _po_id: string }; Returns: string }
      submit_quote: {
        Args: {
          _currency: string
          _expires_at: string
          _items: Json
          _notes: string
          _request_id: string
        }
        Returns: number
      }
      team_performance: {
        Args: { _from: string; _to: string }
        Returns: {
          full_name: string
          handoffs: number
          hours: number
          labour_cost: number
          projects: number
          role: string
          task_value: number
          user_id: string
        }[]
      }
      touch_profile_login: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      withdraw_project_quote: {
        Args: { _quote_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff" | "client"
      broadcast_severity: "info" | "warning" | "critical"
      client_request_status:
        | "pending"
        | "quoted"
        | "accepted"
        | "declined"
        | "cancelled"
        | "converted"
        | "approved"
        | "declined_by_client"
      client_request_type: "quote" | "job"
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
      app_role: ["admin", "manager", "staff", "client"],
      broadcast_severity: ["info", "warning", "critical"],
      client_request_status: [
        "pending",
        "quoted",
        "accepted",
        "declined",
        "cancelled",
        "converted",
        "approved",
        "declined_by_client",
      ],
      client_request_type: ["quote", "job"],
    },
  },
} as const
