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
    PostgrestVersion: "13.0.5"
  }
  hris: {
    Tables: {
      attendance_logs: {
        Row: {
          created_at: string | null
          date: string
          employee_id: string
          id: string
          is_absent: boolean | null
          is_late: boolean | null
          is_undertime: boolean | null
          late_minutes: number | null
          remarks: string | null
          source: string | null
          time_in_am: string | null
          time_in_pm: string | null
          time_out_am: string | null
          time_out_pm: string | null
          undertime_minutes: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          employee_id: string
          id?: string
          is_absent?: boolean | null
          is_late?: boolean | null
          is_undertime?: boolean | null
          late_minutes?: number | null
          remarks?: string | null
          source?: string | null
          time_in_am?: string | null
          time_in_pm?: string | null
          time_out_am?: string | null
          time_out_pm?: string | null
          undertime_minutes?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          employee_id?: string
          id?: string
          is_absent?: boolean | null
          is_late?: boolean | null
          is_undertime?: boolean | null
          late_minutes?: number | null
          remarks?: string | null
          source?: string | null
          time_in_am?: string | null
          time_in_pm?: string | null
          time_out_am?: string | null
          time_out_pm?: string | null
          undertime_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string | null
          head_employee_id: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          head_employee_id?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          head_employee_id?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_dept_head"
            columns: ["head_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string | null
          employee_id: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          reference_id: string | null
          type: Database["hris"]["Enums"]["document_type"]
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          reference_id?: string | null
          type: Database["hris"]["Enums"]["document_type"]
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          reference_id?: string | null
          type?: Database["hris"]["Enums"]["document_type"]
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dtr_summary: {
        Row: {
          employee_id: string
          generated_at: string | null
          id: string
          month: number
          total_days_absent: number | null
          total_days_present: number | null
          total_late_minutes: number | null
          total_undertime_minutes: number | null
          year: number
        }
        Insert: {
          employee_id: string
          generated_at?: string | null
          id?: string
          month: number
          total_days_absent?: number | null
          total_days_present?: number | null
          total_late_minutes?: number | null
          total_undertime_minutes?: number | null
          year: number
        }
        Update: {
          employee_id?: string
          generated_at?: string | null
          id?: string
          month?: number
          total_days_absent?: number | null
          total_days_present?: number | null
          total_late_minutes?: number | null
          total_undertime_minutes?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "dtr_summary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          birth_date: string | null
          civil_status: string | null
          created_at: string | null
          department_id: string | null
          employee_no: string
          employment_type: Database["hris"]["Enums"]["employment_type"]
          end_of_contract: string | null
          first_name: string
          gender: string | null
          hire_date: string
          id: string
          last_name: string
          middle_name: string | null
          phone: string | null
          position_id: string | null
          salary_grade: number
          status: Database["hris"]["Enums"]["employee_status"] | null
          step_increment: number
          suffix: string | null
          updated_at: string | null
          user_profile_id: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          civil_status?: string | null
          created_at?: string | null
          department_id?: string | null
          employee_no: string
          employment_type: Database["hris"]["Enums"]["employment_type"]
          end_of_contract?: string | null
          first_name: string
          gender?: string | null
          hire_date: string
          id?: string
          last_name: string
          middle_name?: string | null
          phone?: string | null
          position_id?: string | null
          salary_grade: number
          status?: Database["hris"]["Enums"]["employee_status"] | null
          step_increment?: number
          suffix?: string | null
          updated_at?: string | null
          user_profile_id?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          civil_status?: string | null
          created_at?: string | null
          department_id?: string | null
          employee_no?: string
          employment_type?: Database["hris"]["Enums"]["employment_type"]
          end_of_contract?: string | null
          first_name?: string
          gender?: string | null
          hire_date?: string
          id?: string
          last_name?: string
          middle_name?: string | null
          phone?: string | null
          position_id?: string | null
          salary_grade?: number
          status?: Database["hris"]["Enums"]["employee_status"] | null
          step_increment?: number
          suffix?: string | null
          updated_at?: string | null
          user_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ipcr_periods: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          is_active: boolean | null
          name: string
          start_date: string
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          name: string
          start_date: string
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          name?: string
          start_date?: string
        }
        Relationships: []
      }
      ipcr_records: {
        Row: {
          adjectival_rating: string | null
          approved_by: string | null
          created_at: string | null
          employee_id: string
          id: string
          numerical_rating: number | null
          period_id: string
          remarks: string | null
          reviewed_by: string | null
          status: Database["hris"]["Enums"]["approval_status"] | null
          updated_at: string | null
        }
        Insert: {
          adjectival_rating?: string | null
          approved_by?: string | null
          created_at?: string | null
          employee_id: string
          id?: string
          numerical_rating?: number | null
          period_id: string
          remarks?: string | null
          reviewed_by?: string | null
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string | null
        }
        Update: {
          adjectival_rating?: string | null
          approved_by?: string | null
          created_at?: string | null
          employee_id?: string
          id?: string
          numerical_rating?: number | null
          period_id?: string
          remarks?: string | null
          reviewed_by?: string | null
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ipcr_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ipcr_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ipcr_records_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "ipcr_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ipcr_records_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_applications: {
        Row: {
          created_at: string | null
          days_applied: number
          department_head_id: string | null
          dept_approved_at: string | null
          employee_id: string
          end_date: string
          hr_approved_at: string | null
          hr_reviewer_id: string | null
          id: string
          leave_type_id: string
          reason: string | null
          rejection_reason: string | null
          start_date: string
          status: Database["hris"]["Enums"]["approval_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          days_applied: number
          department_head_id?: string | null
          dept_approved_at?: string | null
          employee_id: string
          end_date: string
          hr_approved_at?: string | null
          hr_reviewer_id?: string | null
          id?: string
          leave_type_id: string
          reason?: string | null
          rejection_reason?: string | null
          start_date: string
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          days_applied?: number
          department_head_id?: string | null
          dept_approved_at?: string | null
          employee_id?: string
          end_date?: string
          hr_approved_at?: string | null
          hr_reviewer_id?: string | null
          id?: string
          leave_type_id?: string
          reason?: string | null
          rejection_reason?: string | null
          start_date?: string
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_applications_department_head_id_fkey"
            columns: ["department_head_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_applications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_applications_hr_reviewer_id_fkey"
            columns: ["hr_reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_applications_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_credits: {
        Row: {
          balance: number | null
          employee_id: string
          id: string
          leave_type_id: string
          total_credits: number
          used_credits: number
          year: number
        }
        Insert: {
          balance?: number | null
          employee_id: string
          id?: string
          leave_type_id: string
          total_credits?: number
          used_credits?: number
          year: number
        }
        Update: {
          balance?: number | null
          employee_id?: string
          id?: string
          leave_type_id?: string
          total_credits?: number
          used_credits?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_credits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_credits_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          applicable_to: string | null
          code: Database["hris"]["Enums"]["leave_type_code"]
          created_at: string | null
          id: string
          is_convertible: boolean | null
          is_cumulative: boolean | null
          max_credits: number | null
          name: string
        }
        Insert: {
          applicable_to?: string | null
          code: Database["hris"]["Enums"]["leave_type_code"]
          created_at?: string | null
          id?: string
          is_convertible?: boolean | null
          is_cumulative?: boolean | null
          max_credits?: number | null
          name: string
        }
        Update: {
          applicable_to?: string | null
          code?: Database["hris"]["Enums"]["leave_type_code"]
          created_at?: string | null
          id?: string
          is_convertible?: boolean | null
          is_cumulative?: boolean | null
          max_credits?: number | null
          name?: string
        }
        Relationships: []
      }
      nosa_records: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          effective_date: string
          employee_id: string
          generated_by: string | null
          id: string
          legal_basis: string | null
          new_salary: number
          new_salary_grade: number
          new_step: number
          previous_salary: number
          previous_salary_grade: number
          previous_step: number
          reason: Database["hris"]["Enums"]["salary_change_reason"]
          remarks: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["hris"]["Enums"]["approval_status"] | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          effective_date: string
          employee_id: string
          generated_by?: string | null
          id?: string
          legal_basis?: string | null
          new_salary: number
          new_salary_grade: number
          new_step: number
          previous_salary: number
          previous_salary_grade: number
          previous_step: number
          reason: Database["hris"]["Enums"]["salary_change_reason"]
          remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          effective_date?: string
          employee_id?: string
          generated_by?: string | null
          id?: string
          legal_basis?: string | null
          new_salary?: number
          new_salary_grade?: number
          new_step?: number
          previous_salary?: number
          previous_salary_grade?: number
          previous_step?: number
          reason?: Database["hris"]["Enums"]["salary_change_reason"]
          remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nosa_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nosa_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nosa_records_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nosa_records_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nosi_records: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          current_salary: number
          current_salary_grade: number
          current_step: number
          effective_date: string
          employee_id: string
          generated_by: string | null
          id: string
          last_increment_date: string | null
          new_salary: number
          new_step: number
          remarks: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["hris"]["Enums"]["approval_status"] | null
          updated_at: string | null
          years_in_step: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          current_salary: number
          current_salary_grade: number
          current_step: number
          effective_date: string
          employee_id: string
          generated_by?: string | null
          id?: string
          last_increment_date?: string | null
          new_salary: number
          new_step: number
          remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string | null
          years_in_step?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          current_salary?: number
          current_salary_grade?: number
          current_step?: number
          effective_date?: string
          employee_id?: string
          generated_by?: string | null
          id?: string
          last_increment_date?: string | null
          new_salary?: number
          new_step?: number
          remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string | null
          years_in_step?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nosi_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nosi_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nosi_records_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nosi_records_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          created_at: string | null
          department_id: string | null
          id: string
          is_filled: boolean | null
          item_number: string | null
          salary_grade: number
          title: string
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          id?: string
          is_filled?: boolean | null
          item_number?: string | null
          salary_grade: number
          title: string
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          id?: string
          is_filled?: boolean | null
          item_number?: string | null
          salary_grade?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_grade_table: {
        Row: {
          amount: number
          effective_year: number
          grade: number
          id: string
          step: number
          tranche: number
        }
        Insert: {
          amount: number
          effective_year: number
          grade: number
          id?: string
          step: number
          tranche?: number
        }
        Update: {
          amount?: number
          effective_year?: number
          grade?: number
          id?: string
          step?: number
          tranche?: number
        }
        Relationships: []
      }
      salary_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          effective_date: string
          employee_id: string
          id: string
          reason: Database["hris"]["Enums"]["salary_change_reason"]
          reference_id: string | null
          remarks: string | null
          salary_amount: number
          salary_grade: number
          step: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          effective_date: string
          employee_id: string
          id?: string
          reason: Database["hris"]["Enums"]["salary_change_reason"]
          reference_id?: string | null
          remarks?: string | null
          salary_amount: number
          salary_grade: number
          step: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          effective_date?: string
          employee_id?: string
          id?: string
          reason?: Database["hris"]["Enums"]["salary_change_reason"]
          reference_id?: string | null
          remarks?: string | null
          salary_amount?: number
          salary_grade?: number
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "salary_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      service_records: {
        Row: {
          branch: string | null
          created_at: string | null
          date_from: string
          date_to: string | null
          designation: string
          employee_id: string
          id: string
          leave_without_pay: number | null
          office: string | null
          remarks: string | null
          salary: number | null
          separation_cause: string | null
          separation_date: string | null
          status_type: string | null
        }
        Insert: {
          branch?: string | null
          created_at?: string | null
          date_from: string
          date_to?: string | null
          designation: string
          employee_id: string
          id?: string
          leave_without_pay?: number | null
          office?: string | null
          remarks?: string | null
          salary?: number | null
          separation_cause?: string | null
          separation_date?: string | null
          status_type?: string | null
        }
        Update: {
          branch?: string | null
          created_at?: string | null
          date_from?: string
          date_to?: string | null
          designation?: string
          employee_id?: string
          id?: string
          leave_without_pay?: number | null
          office?: string | null
          remarks?: string | null
          salary?: number | null
          separation_cause?: string | null
          separation_date?: string | null
          status_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          department_id: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          role: Database["hris"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          department_id?: string | null
          email: string
          full_name: string
          id?: string
          is_active?: boolean | null
          role?: Database["hris"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          department_id?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          role?: Database["hris"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_employee_id: { Args: never; Returns: string }
      get_user_department_id: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["hris"]["Enums"]["user_role"]
      }
    }
    Enums: {
      approval_status:
        | "draft"
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
      document_type:
        | "201_file"
        | "nosi"
        | "nosa"
        | "service_record"
        | "leave_form"
        | "dtr"
        | "ipcr"
        | "other"
      employee_status:
        | "active"
        | "inactive"
        | "retired"
        | "terminated"
        | "resigned"
      employment_type: "plantilla" | "jo" | "cos"
      leave_type_code:
        | "VL"
        | "SL"
        | "ML"
        | "PL"
        | "SPL"
        | "FL"
        | "SoloParent"
        | "VAWC"
        | "RA9262"
        | "CL"
        | "AL"
        | "RL"
        | "SEL"
      salary_change_reason:
        | "initial"
        | "step_increment"
        | "promotion"
        | "reclassification"
        | "salary_standardization"
        | "adjustment"
        | "demotion"
      user_role: "super_admin" | "hr_admin" | "department_head" | "employee"
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
  hris: {
    Enums: {
      approval_status: [
        "draft",
        "pending",
        "approved",
        "rejected",
        "cancelled",
      ],
      document_type: [
        "201_file",
        "nosi",
        "nosa",
        "service_record",
        "leave_form",
        "dtr",
        "ipcr",
        "other",
      ],
      employee_status: [
        "active",
        "inactive",
        "retired",
        "terminated",
        "resigned",
      ],
      employment_type: ["plantilla", "jo", "cos"],
      leave_type_code: [
        "VL",
        "SL",
        "ML",
        "PL",
        "SPL",
        "FL",
        "SoloParent",
        "VAWC",
        "RA9262",
        "CL",
        "AL",
        "RL",
        "SEL",
      ],
      salary_change_reason: [
        "initial",
        "step_increment",
        "promotion",
        "reclassification",
        "salary_standardization",
        "adjustment",
        "demotion",
      ],
      user_role: ["super_admin", "hr_admin", "department_head", "employee"],
    },
  },
} as const
