export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  hris: {
    Tables: {
      attendance_import_batches: {
        Row: {
          created_at: string
          id: string
          imported_at: string
          imported_by: string | null
          period_end: string | null
          period_start: string | null
          punch_count: number
          punches: Json
        }
        Insert: {
          created_at?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          period_end?: string | null
          period_start?: string | null
          punch_count?: number
          punches?: Json
        }
        Update: {
          created_at?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          period_end?: string | null
          period_start?: string | null
          punch_count?: number
          punches?: Json
        }
        Relationships: [
          {
            foreignKeyName: "attendance_import_batches_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          created_at: string | null
          created_by: string | null
          created_by_email: string | null
          date: string
          employee_id: string
          id: string
          is_absent: boolean | null
          is_late: boolean | null
          is_undertime: boolean | null
          late_minutes: number | null
          no_time_reason: string | null
          remarks: string | null
          schedule_id: string | null
          source: string | null
          time_in_am: string | null
          time_in_am_reason: string | null
          time_in_pm: string | null
          time_in_pm_reason: string | null
          time_out_am: string | null
          time_out_am_reason: string | null
          time_out_pm: string | null
          time_out_pm_reason: string | null
          undertime_minutes: number | null
          updated_at: string | null
          updated_by: string | null
          updated_by_email: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          date: string
          employee_id: string
          id?: string
          is_absent?: boolean | null
          is_late?: boolean | null
          is_undertime?: boolean | null
          late_minutes?: number | null
          no_time_reason?: string | null
          remarks?: string | null
          schedule_id?: string | null
          source?: string | null
          time_in_am?: string | null
          time_in_am_reason?: string | null
          time_in_pm?: string | null
          time_in_pm_reason?: string | null
          time_out_am?: string | null
          time_out_am_reason?: string | null
          time_out_pm?: string | null
          time_out_pm_reason?: string | null
          undertime_minutes?: number | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_email?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          date?: string
          employee_id?: string
          id?: string
          is_absent?: boolean | null
          is_late?: boolean | null
          is_undertime?: boolean | null
          late_minutes?: number | null
          no_time_reason?: string | null
          remarks?: string | null
          schedule_id?: string | null
          source?: string | null
          time_in_am?: string | null
          time_in_am_reason?: string | null
          time_in_pm?: string | null
          time_in_pm_reason?: string | null
          time_out_am?: string | null
          time_out_am_reason?: string | null
          time_out_pm?: string | null
          time_out_pm_reason?: string | null
          undertime_minutes?: number | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
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
      cos_contract_templates: {
        Row: {
          body: Json
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          body: Json
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          body?: Json
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cos_contract_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_contract_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_contracts: {
        Row: {
          body: Json
          cos_employee_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          monthly_rate: number | null
          period_end: string
          period_start: string
          position_title: string | null
          renewed_from_id: string | null
          scope_of_work: string | null
          signatory_name: string | null
          signatory_position: string | null
          status: string
          template_id: string | null
          terminated_on: string | null
          termination_reason: string | null
          updated_at: string | null
          updated_by: string | null
          witness_name: string | null
          witness_position: string | null
        }
        Insert: {
          body: Json
          cos_employee_id: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          monthly_rate?: number | null
          period_end: string
          period_start: string
          position_title?: string | null
          renewed_from_id?: string | null
          scope_of_work?: string | null
          signatory_name?: string | null
          signatory_position?: string | null
          status?: string
          template_id?: string | null
          terminated_on?: string | null
          termination_reason?: string | null
          updated_at?: string | null
          updated_by?: string | null
          witness_name?: string | null
          witness_position?: string | null
        }
        Update: {
          body?: Json
          cos_employee_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          monthly_rate?: number | null
          period_end?: string
          period_start?: string
          position_title?: string | null
          renewed_from_id?: string | null
          scope_of_work?: string | null
          signatory_name?: string | null
          signatory_position?: string | null
          status?: string
          template_id?: string | null
          terminated_on?: string | null
          termination_reason?: string | null
          updated_at?: string | null
          updated_by?: string | null
          witness_name?: string | null
          witness_position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cos_contracts_cos_employee_id_fkey"
            columns: ["cos_employee_id"]
            isOneToOne: false
            referencedRelation: "cos_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_contracts_renewed_from_id_fkey"
            columns: ["renewed_from_id"]
            isOneToOne: true
            referencedRelation: "cos_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cos_contract_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_contracts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_employee_payroll: {
        Row: {
          absent_without_pay: number | null
          amount_received: number | null
          created_at: string | null
          designation: string | null
          employee_id: string
          id: string
          monthly_rate: number | null
          payroll_id: string
          percentage_tax_3: number | null
          ss_contribution: number | null
          ss_contribution_ec: number | null
          updated_at: string | null
        }
        Insert: {
          absent_without_pay?: number | null
          amount_received?: number | null
          created_at?: string | null
          designation?: string | null
          employee_id: string
          id?: string
          monthly_rate?: number | null
          payroll_id: string
          percentage_tax_3?: number | null
          ss_contribution?: number | null
          ss_contribution_ec?: number | null
          updated_at?: string | null
        }
        Update: {
          absent_without_pay?: number | null
          amount_received?: number | null
          created_at?: string | null
          designation?: string | null
          employee_id?: string
          id?: string
          monthly_rate?: number | null
          payroll_id?: string
          percentage_tax_3?: number | null
          ss_contribution?: number | null
          ss_contribution_ec?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cos_employee_payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_employee_payroll_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "cos_payroll"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_employees: {
        Row: {
          address: string | null
          birth_date: string | null
          contact_number: string | null
          cos_no: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          eligibility: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          legacy_id: number | null
          middle_name: string | null
          monthly_rate: number | null
          position_title: string | null
          recommended_by: string | null
          remarks: string | null
          sex: string | null
          status: string
          suffix: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          contact_number?: string | null
          cos_no: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          eligibility?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          legacy_id?: number | null
          middle_name?: string | null
          monthly_rate?: number | null
          position_title?: string | null
          recommended_by?: string | null
          remarks?: string | null
          sex?: string | null
          status?: string
          suffix?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          contact_number?: string | null
          cos_no?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          eligibility?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          legacy_id?: number | null
          middle_name?: string | null
          monthly_rate?: number | null
          position_title?: string | null
          recommended_by?: string | null
          remarks?: string | null
          sex?: string | null
          status?: string
          suffix?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cos_employees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_employees_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_payroll: {
        Row: {
          created_at: string | null
          id: string
          particulars: string | null
          period_end: string
          period_start: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          particulars?: string | null
          period_end: string
          period_start: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          particulars?: string | null
          period_end?: string
          period_start?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cto_applications: {
        Row: {
          created_at: string
          created_by: string | null
          cto_dates: string[]
          department_head_id: string | null
          dept_approved_at: string | null
          employee_id: string
          end_date: string
          hours_applied: number
          hr_approved_at: string | null
          hr_reviewer_id: string | null
          id: string
          reason: string | null
          rejection_reason: string | null
          start_date: string
          status: Database["hris"]["Enums"]["approval_status"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cto_dates: string[]
          department_head_id?: string | null
          dept_approved_at?: string | null
          employee_id: string
          end_date: string
          hours_applied: number
          hr_approved_at?: string | null
          hr_reviewer_id?: string | null
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          start_date: string
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cto_dates?: string[]
          department_head_id?: string | null
          dept_approved_at?: string | null
          employee_id?: string
          end_date?: string
          hours_applied?: number
          hr_approved_at?: string | null
          hr_reviewer_id?: string | null
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          start_date?: string
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cto_applications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cto_applications_department_head_id_fkey"
            columns: ["department_head_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cto_applications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cto_applications_hr_reviewer_id_fkey"
            columns: ["hr_reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cto_credits: {
        Row: {
          created_at: string
          created_by: string | null
          day_type: string
          employee_id: string
          expiry_date: string | null
          hours_earned: number
          hours_worked: number
          id: string
          multiplier: number
          notes: string | null
          office_order_no: string | null
          ot_date: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_type: string
          employee_id: string
          expiry_date?: string | null
          hours_earned: number
          hours_worked: number
          id?: string
          multiplier: number
          notes?: string | null
          office_order_no?: string | null
          ot_date: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_type?: string
          employee_id?: string
          expiry_date?: string | null
          hours_earned?: number
          hours_worked?: number
          id?: string
          multiplier?: number
          notes?: string | null
          office_order_no?: string | null
          ot_date?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cto_credits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cto_credits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cto_credits_voided_by_fkey"
            columns: ["voided_by"]
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
          head_custom_name: string | null
          head_employee_id: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          head_custom_name?: string | null
          head_employee_id?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          head_custom_name?: string | null
          head_employee_id?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_head_employee_id_fkey"
            columns: ["head_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
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
      employee_payroll: {
        Row: {
          amount_received: number | null
          amount_received_2nd_half: number | null
          courage_2_contribution: number | null
          courage_2_pera_loan: number | null
          courage_salary_loan: number | null
          created_at: string | null
          designation: string | null
          economic_enterprise_multipurpose_coop: number | null
          economic_enterprise_multipurpose_coop_pera: number | null
          eempc_salary_loan: number | null
          emergency_loan: number | null
          employee_id: string
          gsis_govt_share: number | null
          gsis_personal_share: number | null
          gsis_repayments_cpl: number | null
          gsis_repayments_mpl: number | null
          gsis_repayments_mpl_lite: number | null
          gsis_repayments_policy_loan: number | null
          hmdf: number | null
          id: string
          lbp_savings_account_number: string | null
          monthly_rate: number | null
          notice_of_disallowance: number | null
          pag_ibig_govt_share: number | null
          pag_ibig_personal_share: number | null
          pag_ibig_salary_loan: number | null
          payroll_id: string
          philhealth_govt_share: number | null
          philhealth_personal_share: number | null
          sif: number | null
          ss_contribution: number | null
          ss_contribution_ec: number | null
          updated_at: string | null
          withholding_tax: number | null
        }
        Insert: {
          amount_received?: number | null
          amount_received_2nd_half?: number | null
          courage_2_contribution?: number | null
          courage_2_pera_loan?: number | null
          courage_salary_loan?: number | null
          created_at?: string | null
          designation?: string | null
          economic_enterprise_multipurpose_coop?: number | null
          economic_enterprise_multipurpose_coop_pera?: number | null
          eempc_salary_loan?: number | null
          emergency_loan?: number | null
          employee_id: string
          gsis_govt_share?: number | null
          gsis_personal_share?: number | null
          gsis_repayments_cpl?: number | null
          gsis_repayments_mpl?: number | null
          gsis_repayments_mpl_lite?: number | null
          gsis_repayments_policy_loan?: number | null
          hmdf?: number | null
          id?: string
          lbp_savings_account_number?: string | null
          monthly_rate?: number | null
          notice_of_disallowance?: number | null
          pag_ibig_govt_share?: number | null
          pag_ibig_personal_share?: number | null
          pag_ibig_salary_loan?: number | null
          payroll_id: string
          philhealth_govt_share?: number | null
          philhealth_personal_share?: number | null
          sif?: number | null
          ss_contribution?: number | null
          ss_contribution_ec?: number | null
          updated_at?: string | null
          withholding_tax?: number | null
        }
        Update: {
          amount_received?: number | null
          amount_received_2nd_half?: number | null
          courage_2_contribution?: number | null
          courage_2_pera_loan?: number | null
          courage_salary_loan?: number | null
          created_at?: string | null
          designation?: string | null
          economic_enterprise_multipurpose_coop?: number | null
          economic_enterprise_multipurpose_coop_pera?: number | null
          eempc_salary_loan?: number | null
          emergency_loan?: number | null
          employee_id?: string
          gsis_govt_share?: number | null
          gsis_personal_share?: number | null
          gsis_repayments_cpl?: number | null
          gsis_repayments_mpl?: number | null
          gsis_repayments_mpl_lite?: number | null
          gsis_repayments_policy_loan?: number | null
          hmdf?: number | null
          id?: string
          lbp_savings_account_number?: string | null
          monthly_rate?: number | null
          notice_of_disallowance?: number | null
          pag_ibig_govt_share?: number | null
          pag_ibig_personal_share?: number | null
          pag_ibig_salary_loan?: number | null
          payroll_id?: string
          philhealth_govt_share?: number | null
          philhealth_personal_share?: number | null
          sif?: number | null
          ss_contribution?: number | null
          ss_contribution_ec?: number | null
          updated_at?: string | null
          withholding_tax?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "payroll"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          account_number: string | null
          address: string | null
          area_assigned: string | null
          biometric_no: number
          birth_date: string | null
          civil_status: string | null
          created_at: string | null
          daily_rate: number | null
          department_id: string | null
          detailed_department_id: string | null
          employee_no: string
          employment_type: Database["hris"]["Enums"]["employment_type"]
          end_of_contract: string | null
          first_name: string
          gender: string | null
          has_atm: boolean | null
          hire_date: string
          id: string
          id_number: string | null
          inactive_effectivity_date: string | null
          inactive_reason: string | null
          is_department_head: boolean
          item_number: string | null
          last_name: string
          legacy_id: number | null
          legacy_status: string | null
          middle_name: string | null
          monthly_salary: number | null
          office_assignment: string | null
          office_code: string | null
          old_item_number: string | null
          original_appointment: string | null
          phone: string | null
          position_id: string | null
          position_level: string | null
          promotion_date: string | null
          salary_grade: number
          schedule_id: string | null
          sss_ec: number | null
          sss_no: string | null
          sss_number: string | null
          sss_ss: number | null
          status: Database["hris"]["Enums"]["employee_status"] | null
          status_effective_date: string | null
          status_remarks: string | null
          step_increment: number
          sub_area: string | null
          suffix: string | null
          tin_number: string | null
          transfer_date: string | null
          updated_at: string | null
          user_profile_id: string | null
          vl_sl_needs_manual_entry: boolean
        }
        Insert: {
          account_number?: string | null
          address?: string | null
          area_assigned?: string | null
          biometric_no?: number
          birth_date?: string | null
          civil_status?: string | null
          created_at?: string | null
          daily_rate?: number | null
          department_id?: string | null
          detailed_department_id?: string | null
          employee_no: string
          employment_type: Database["hris"]["Enums"]["employment_type"]
          end_of_contract?: string | null
          first_name: string
          gender?: string | null
          has_atm?: boolean | null
          hire_date: string
          id?: string
          id_number?: string | null
          inactive_effectivity_date?: string | null
          inactive_reason?: string | null
          is_department_head?: boolean
          item_number?: string | null
          last_name: string
          legacy_id?: number | null
          legacy_status?: string | null
          middle_name?: string | null
          monthly_salary?: number | null
          office_assignment?: string | null
          office_code?: string | null
          old_item_number?: string | null
          original_appointment?: string | null
          phone?: string | null
          position_id?: string | null
          position_level?: string | null
          promotion_date?: string | null
          salary_grade: number
          schedule_id?: string | null
          sss_ec?: number | null
          sss_no?: string | null
          sss_number?: string | null
          sss_ss?: number | null
          status?: Database["hris"]["Enums"]["employee_status"] | null
          status_effective_date?: string | null
          status_remarks?: string | null
          step_increment?: number
          sub_area?: string | null
          suffix?: string | null
          tin_number?: string | null
          transfer_date?: string | null
          updated_at?: string | null
          user_profile_id?: string | null
          vl_sl_needs_manual_entry?: boolean
        }
        Update: {
          account_number?: string | null
          address?: string | null
          area_assigned?: string | null
          biometric_no?: number
          birth_date?: string | null
          civil_status?: string | null
          created_at?: string | null
          daily_rate?: number | null
          department_id?: string | null
          detailed_department_id?: string | null
          employee_no?: string
          employment_type?: Database["hris"]["Enums"]["employment_type"]
          end_of_contract?: string | null
          first_name?: string
          gender?: string | null
          has_atm?: boolean | null
          hire_date?: string
          id?: string
          id_number?: string | null
          inactive_effectivity_date?: string | null
          inactive_reason?: string | null
          is_department_head?: boolean
          item_number?: string | null
          last_name?: string
          legacy_id?: number | null
          legacy_status?: string | null
          middle_name?: string | null
          monthly_salary?: number | null
          office_assignment?: string | null
          office_code?: string | null
          old_item_number?: string | null
          original_appointment?: string | null
          phone?: string | null
          position_id?: string | null
          position_level?: string | null
          promotion_date?: string | null
          salary_grade?: number
          schedule_id?: string | null
          sss_ec?: number | null
          sss_no?: string | null
          sss_number?: string | null
          sss_ss?: number | null
          status?: Database["hris"]["Enums"]["employee_status"] | null
          status_effective_date?: string | null
          status_remarks?: string | null
          step_increment?: number
          sub_area?: string | null
          suffix?: string | null
          tin_number?: string | null
          transfer_date?: string | null
          updated_at?: string | null
          user_profile_id?: string | null
          vl_sl_needs_manual_entry?: boolean
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
            foreignKeyName: "employees_detailed_department_id_fkey"
            columns: ["detailed_department_id"]
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
            foreignKeyName: "employees_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
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
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
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
      job_order_areas: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          normalized_name: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          normalized_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          normalized_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      job_order_employees: {
        Row: {
          area_id: string
          barangay: string | null
          community_tax_date: string | null
          community_tax_number: string | null
          community_tax_place_issued: string | null
          created_at: string
          created_by: string | null
          daily_rate: number | null
          date_started: string | null
          deleted_at: string | null
          eligibility: string | null
          full_name: string
          has_atm: boolean
          id: string
          landbank_account_number: string | null
          legacy_id: number | null
          previous_daily_rate: number | null
          purok: string | null
          recommended_by: string | null
          remarks: string | null
          remarks_2: string | null
          sex: string | null
          sort_name: string | null
          sss_ec: number | null
          sss_no: string | null
          sss_ss: number | null
          status: string
          sub_area: string | null
          updated_at: string
          updated_by: string | null
          working_hours: string | null
        }
        Insert: {
          area_id: string
          barangay?: string | null
          community_tax_date?: string | null
          community_tax_number?: string | null
          community_tax_place_issued?: string | null
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          date_started?: string | null
          deleted_at?: string | null
          eligibility?: string | null
          full_name: string
          has_atm?: boolean
          id?: string
          landbank_account_number?: string | null
          legacy_id?: number | null
          previous_daily_rate?: number | null
          purok?: string | null
          recommended_by?: string | null
          remarks?: string | null
          remarks_2?: string | null
          sex?: string | null
          sort_name?: string | null
          sss_ec?: number | null
          sss_no?: string | null
          sss_ss?: number | null
          status?: string
          sub_area?: string | null
          updated_at?: string
          updated_by?: string | null
          working_hours?: string | null
        }
        Update: {
          area_id?: string
          barangay?: string | null
          community_tax_date?: string | null
          community_tax_number?: string | null
          community_tax_place_issued?: string | null
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          date_started?: string | null
          deleted_at?: string | null
          eligibility?: string | null
          full_name?: string
          has_atm?: boolean
          id?: string
          landbank_account_number?: string | null
          legacy_id?: number | null
          previous_daily_rate?: number | null
          purok?: string | null
          recommended_by?: string | null
          remarks?: string | null
          remarks_2?: string | null
          sex?: string | null
          sort_name?: string | null
          sss_ec?: number | null
          sss_no?: string | null
          sss_ss?: number | null
          status?: string
          sub_area?: string | null
          updated_at?: string
          updated_by?: string | null
          working_hours?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_order_employees_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "job_order_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      job_order_payroll_members: {
        Row: {
          area_name: string | null
          community_tax_date: string | null
          community_tax_number: string | null
          community_tax_place_issued: string | null
          created_at: string
          daily_rate: number | null
          days: number | null
          full_name: string
          has_atm: boolean
          hours: number | null
          id: string
          job_order_employee_id: string | null
          landbank_account_number: string | null
          legacy_id: number | null
          payroll_id: string
          sss_ec: number | null
          sss_no: string | null
          sss_ss: number | null
          sub_area: string | null
          updated_at: string
        }
        Insert: {
          area_name?: string | null
          community_tax_date?: string | null
          community_tax_number?: string | null
          community_tax_place_issued?: string | null
          created_at?: string
          daily_rate?: number | null
          days?: number | null
          full_name: string
          has_atm?: boolean
          hours?: number | null
          id?: string
          job_order_employee_id?: string | null
          landbank_account_number?: string | null
          legacy_id?: number | null
          payroll_id: string
          sss_ec?: number | null
          sss_no?: string | null
          sss_ss?: number | null
          sub_area?: string | null
          updated_at?: string
        }
        Update: {
          area_name?: string | null
          community_tax_date?: string | null
          community_tax_number?: string | null
          community_tax_place_issued?: string | null
          created_at?: string
          daily_rate?: number | null
          days?: number | null
          full_name?: string
          has_atm?: boolean
          hours?: number | null
          id?: string
          job_order_employee_id?: string | null
          landbank_account_number?: string | null
          legacy_id?: number | null
          payroll_id?: string
          sss_ec?: number | null
          sss_no?: string | null
          sss_ss?: number | null
          sub_area?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_order_payroll_members_job_order_employee_id_fkey"
            columns: ["job_order_employee_id"]
            isOneToOne: false
            referencedRelation: "job_order_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_order_payroll_members_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "job_order_payrolls"
            referencedColumns: ["id"]
          },
        ]
      }
      job_order_payrolls: {
        Row: {
          areas: string | null
          created_at: string
          created_by: string | null
          days: number | null
          deleted_at: string | null
          description: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          is_reconstructed: boolean
          legacy_id: number | null
          particulars: string | null
          payroll_date: string | null
          period_end: string
          period_start: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          areas?: string | null
          created_at?: string
          created_by?: string | null
          days?: number | null
          deleted_at?: string | null
          description?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_reconstructed?: boolean
          legacy_id?: number | null
          particulars?: string | null
          payroll_date?: string | null
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          areas?: string | null
          created_at?: string
          created_by?: string | null
          days?: number | null
          deleted_at?: string | null
          description?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_reconstructed?: boolean
          legacy_id?: number | null
          particulars?: string | null
          payroll_date?: string | null
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      leave_applications: {
        Row: {
          commutation_requested: boolean | null
          created_at: string | null
          created_by: string | null
          days_applied: number
          days_with_pay: number
          department_head_id: string | null
          dept_approved_at: string | null
          details_of_leave: string | null
          employee_id: string
          end_date: string
          hr_approved_at: string | null
          hr_reviewer_id: string | null
          id: string
          leave_dates: string[] | null
          leave_type_id: string
          reason: string | null
          rejection_reason: string | null
          start_date: string
          status: Database["hris"]["Enums"]["approval_status"] | null
          updated_at: string | null
        }
        Insert: {
          commutation_requested?: boolean | null
          created_at?: string | null
          created_by?: string | null
          days_applied: number
          days_with_pay?: number
          department_head_id?: string | null
          dept_approved_at?: string | null
          details_of_leave?: string | null
          employee_id: string
          end_date: string
          hr_approved_at?: string | null
          hr_reviewer_id?: string | null
          id?: string
          leave_dates?: string[] | null
          leave_type_id: string
          reason?: string | null
          rejection_reason?: string | null
          start_date: string
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string | null
        }
        Update: {
          commutation_requested?: boolean | null
          created_at?: string | null
          created_by?: string | null
          days_applied?: number
          days_with_pay?: number
          department_head_id?: string | null
          dept_approved_at?: string | null
          details_of_leave?: string | null
          employee_id?: string
          end_date?: string
          hr_approved_at?: string | null
          hr_reviewer_id?: string | null
          id?: string
          leave_dates?: string[] | null
          leave_type_id?: string
          reason?: string | null
          rejection_reason?: string | null
          start_date?: string
          status?: Database["hris"]["Enums"]["approval_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_applications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
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
      leave_credit_accruals: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          leave_type_id: string
          month: number | null
          notes: string | null
          source: string
          year: number
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          leave_type_id: string
          month?: number | null
          notes?: string | null
          source: string
          year: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          leave_type_id?: string
          month?: number | null
          notes?: string | null
          source?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_credit_accruals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_credit_accruals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_credit_accruals_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_credits: {
        Row: {
          employee_id: string
          id: string
          leave_type_id: string
          total_credits: number
          year: number
        }
        Insert: {
          employee_id: string
          id?: string
          leave_type_id: string
          total_credits?: number
          year: number
        }
        Update: {
          employee_id?: string
          id?: string
          leave_type_id?: string
          total_credits?: number
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
          annual_credits: number | null
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
          annual_credits?: number | null
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
          annual_credits?: number | null
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
      payroll: {
        Row: {
          created_at: string | null
          id: string
          particulars: string | null
          particulars_2nd_half: string | null
          period_end: string
          period_start: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          particulars?: string | null
          particulars_2nd_half?: string | null
          period_end: string
          period_start: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          particulars?: string | null
          particulars_2nd_half?: string | null
          period_end?: string
          period_start?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      plantilla: {
        Row: {
          actual_annual_salary: number | null
          area_code: string | null
          area_type: string | null
          authorized_annual_salary: number | null
          civil_service_eligibility: string | null
          comment_annotation: string | null
          created_at: string | null
          date_of_last_promotion_appointment: string | null
          date_of_original_appointment: string | null
          employee_id: string | null
          gsis_bp_number: string | null
          id: string
          indigenous_people: string | null
          is_funded: boolean | null
          is_vacant: boolean | null
          item_number: string | null
          legacy_plantilla_id: number | null
          level: string | null
          level_supplemental: string | null
          organizational_unit: string | null
          position_title: string | null
          pwd: string | null
          ref_first_name: string | null
          ref_last_name: string | null
          ref_middle_name: string | null
          salary_grade: number | null
          solo_parent: string | null
          status: string | null
          step: number | null
          tin: string | null
          updated_at: string | null
          vice: string | null
        }
        Insert: {
          actual_annual_salary?: number | null
          area_code?: string | null
          area_type?: string | null
          authorized_annual_salary?: number | null
          civil_service_eligibility?: string | null
          comment_annotation?: string | null
          created_at?: string | null
          date_of_last_promotion_appointment?: string | null
          date_of_original_appointment?: string | null
          employee_id?: string | null
          gsis_bp_number?: string | null
          id?: string
          indigenous_people?: string | null
          is_funded?: boolean | null
          is_vacant?: boolean | null
          item_number?: string | null
          legacy_plantilla_id?: number | null
          level?: string | null
          level_supplemental?: string | null
          organizational_unit?: string | null
          position_title?: string | null
          pwd?: string | null
          ref_first_name?: string | null
          ref_last_name?: string | null
          ref_middle_name?: string | null
          salary_grade?: number | null
          solo_parent?: string | null
          status?: string | null
          step?: number | null
          tin?: string | null
          updated_at?: string | null
          vice?: string | null
        }
        Update: {
          actual_annual_salary?: number | null
          area_code?: string | null
          area_type?: string | null
          authorized_annual_salary?: number | null
          civil_service_eligibility?: string | null
          comment_annotation?: string | null
          created_at?: string | null
          date_of_last_promotion_appointment?: string | null
          date_of_original_appointment?: string | null
          employee_id?: string | null
          gsis_bp_number?: string | null
          id?: string
          indigenous_people?: string | null
          is_funded?: boolean | null
          is_vacant?: boolean | null
          item_number?: string | null
          legacy_plantilla_id?: number | null
          level?: string | null
          level_supplemental?: string | null
          organizational_unit?: string | null
          position_title?: string | null
          pwd?: string | null
          ref_first_name?: string | null
          ref_last_name?: string | null
          ref_middle_name?: string | null
          salary_grade?: number | null
          solo_parent?: string | null
          status?: string | null
          step?: number | null
          tin?: string | null
          updated_at?: string | null
          vice?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plantilla_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      rsp_applicants: {
        Row: {
          address: string | null
          birth_date: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          employee_id: string | null
          first_name: string
          id: string
          last_name: string
          middle_name: string | null
          mobile_no: string | null
          name_extension: string | null
          notes: string | null
          sex: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          employee_id?: string | null
          first_name: string
          id?: string
          last_name: string
          middle_name?: string | null
          mobile_no?: string | null
          name_extension?: string | null
          notes?: string | null
          sex?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          employee_id?: string | null
          first_name?: string
          id?: string
          last_name?: string
          middle_name?: string | null
          mobile_no?: string | null
          name_extension?: string | null
          notes?: string | null
          sex?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rsp_applicants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_applicants_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_applications: {
        Row: {
          applicant_id: string
          created_at: string | null
          date_received: string
          education: string | null
          eligibility: string | null
          experience: string | null
          experience_years: number | null
          id: string
          screened_at: string | null
          screened_by: string | null
          screening_remarks: string | null
          status: string
          training: string | null
          training_hours: number | null
          updated_at: string | null
          vacancy_id: string
        }
        Insert: {
          applicant_id: string
          created_at?: string | null
          date_received?: string
          education?: string | null
          eligibility?: string | null
          experience?: string | null
          experience_years?: number | null
          id?: string
          screened_at?: string | null
          screened_by?: string | null
          screening_remarks?: string | null
          status?: string
          training?: string | null
          training_hours?: number | null
          updated_at?: string | null
          vacancy_id: string
        }
        Update: {
          applicant_id?: string
          created_at?: string | null
          date_received?: string
          education?: string | null
          eligibility?: string | null
          experience?: string | null
          experience_years?: number | null
          id?: string
          screened_at?: string | null
          screened_by?: string | null
          screening_remarks?: string | null
          status?: string
          training?: string | null
          training_hours?: number | null
          updated_at?: string | null
          vacancy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsp_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "rsp_applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_applications_screened_by_fkey"
            columns: ["screened_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_applications_vacancy_id_fkey"
            columns: ["vacancy_id"]
            isOneToOne: false
            referencedRelation: "rsp_vacancies"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_appointments: {
        Row: {
          application_id: string
          appointing_authority: string | null
          appointing_authority_position: string | null
          assumption_date: string | null
          created_at: string | null
          created_by: string | null
          date_of_signing: string
          employment_period_from: string | null
          employment_period_to: string | null
          id: string
          item_number: string | null
          nature: Database["hris"]["Enums"]["rsp_appointment_nature"]
          nature_others: string | null
          oath_date: string | null
          plantilla_id: string
          probation_end_date: string | null
          remarks: string | null
          status: string
          status_type: Database["hris"]["Enums"]["rsp_appointment_status_type"]
          updated_at: string | null
          vacancy_id: string
          vice: string | null
        }
        Insert: {
          application_id: string
          appointing_authority?: string | null
          appointing_authority_position?: string | null
          assumption_date?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_signing: string
          employment_period_from?: string | null
          employment_period_to?: string | null
          id?: string
          item_number?: string | null
          nature: Database["hris"]["Enums"]["rsp_appointment_nature"]
          nature_others?: string | null
          oath_date?: string | null
          plantilla_id: string
          probation_end_date?: string | null
          remarks?: string | null
          status?: string
          status_type: Database["hris"]["Enums"]["rsp_appointment_status_type"]
          updated_at?: string | null
          vacancy_id: string
          vice?: string | null
        }
        Update: {
          application_id?: string
          appointing_authority?: string | null
          appointing_authority_position?: string | null
          assumption_date?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_signing?: string
          employment_period_from?: string | null
          employment_period_to?: string | null
          id?: string
          item_number?: string | null
          nature?: Database["hris"]["Enums"]["rsp_appointment_nature"]
          nature_others?: string | null
          oath_date?: string | null
          plantilla_id?: string
          probation_end_date?: string | null
          remarks?: string | null
          status?: string
          status_type?: Database["hris"]["Enums"]["rsp_appointment_status_type"]
          updated_at?: string | null
          vacancy_id?: string
          vice?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rsp_appointments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "rsp_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_appointments_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "plantilla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_appointments_vacancy_id_fkey"
            columns: ["vacancy_id"]
            isOneToOne: false
            referencedRelation: "rsp_vacancies"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_assessment_criteria: {
        Row: {
          id: string
          max_score: number
          name: string
          sort_order: number
          vacancy_id: string
          weight: number
        }
        Insert: {
          id?: string
          max_score?: number
          name: string
          sort_order?: number
          vacancy_id: string
          weight: number
        }
        Update: {
          id?: string
          max_score?: number
          name?: string
          sort_order?: number
          vacancy_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "rsp_assessment_criteria_vacancy_id_fkey"
            columns: ["vacancy_id"]
            isOneToOne: false
            referencedRelation: "rsp_vacancies"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_assessment_scores: {
        Row: {
          application_id: string
          created_at: string | null
          criterion_id: string
          id: string
          remarks: string | null
          score: number
          updated_at: string | null
        }
        Insert: {
          application_id: string
          created_at?: string | null
          criterion_id: string
          id?: string
          remarks?: string | null
          score: number
          updated_at?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string | null
          criterion_id?: string
          id?: string
          remarks?: string | null
          score?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rsp_assessment_scores_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "rsp_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_assessment_scores_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "rsp_assessment_criteria"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_vacancies: {
        Row: {
          closing_date: string | null
          created_at: string | null
          created_by: string | null
          csc_bulletin_no: string | null
          hrmpsb_deliberation_date: string | null
          id: string
          item_number: string
          monthly_salary: number | null
          organizational_unit: string | null
          place_of_assignment: string | null
          plantilla_id: string
          position_title: string
          publication_date: string | null
          publication_expiry_date: string | null
          qs_education: string | null
          qs_eligibility: string | null
          qs_experience: string | null
          qs_experience_years: number | null
          qs_training: string | null
          qs_training_hours: number | null
          remarks: string | null
          salary_grade: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          closing_date?: string | null
          created_at?: string | null
          created_by?: string | null
          csc_bulletin_no?: string | null
          hrmpsb_deliberation_date?: string | null
          id?: string
          item_number: string
          monthly_salary?: number | null
          organizational_unit?: string | null
          place_of_assignment?: string | null
          plantilla_id: string
          position_title: string
          publication_date?: string | null
          publication_expiry_date?: string | null
          qs_education?: string | null
          qs_eligibility?: string | null
          qs_experience?: string | null
          qs_experience_years?: number | null
          qs_training?: string | null
          qs_training_hours?: number | null
          remarks?: string | null
          salary_grade?: number | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          closing_date?: string | null
          created_at?: string | null
          created_by?: string | null
          csc_bulletin_no?: string | null
          hrmpsb_deliberation_date?: string | null
          id?: string
          item_number?: string
          monthly_salary?: number | null
          organizational_unit?: string | null
          place_of_assignment?: string | null
          plantilla_id?: string
          position_title?: string
          publication_date?: string | null
          publication_expiry_date?: string | null
          qs_education?: string | null
          qs_eligibility?: string | null
          qs_experience?: string | null
          qs_experience_years?: number | null
          qs_training?: string | null
          qs_training_hours?: number | null
          remarks?: string | null
          salary_grade?: number | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rsp_vacancies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_vacancies_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "plantilla"
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
      schedules: {
        Row: {
          break_end: string | null
          break_start: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          notes: string | null
          time_in: string
          time_out: string
          updated_at: string
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          notes?: string | null
          time_in: string
          time_out: string
          updated_at?: string
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          notes?: string | null
          time_in?: string
          time_out?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_records: {
        Row: {
          agency: string | null
          branch: string | null
          created_at: string | null
          created_by: string | null
          daily_salary: number | null
          date_from: string
          date_to: string | null
          designation: string
          employee_id: string
          id: string
          leave_without_pay: number | null
          legacy_id: number | null
          office: string | null
          remarks: string | null
          salary: number | null
          salary_grade: number | null
          separation_cause: string | null
          separation_date: string | null
          status_type: string | null
          step_increment: number | null
          updated_at: string | null
        }
        Insert: {
          agency?: string | null
          branch?: string | null
          created_at?: string | null
          created_by?: string | null
          daily_salary?: number | null
          date_from: string
          date_to?: string | null
          designation: string
          employee_id: string
          id?: string
          leave_without_pay?: number | null
          legacy_id?: number | null
          office?: string | null
          remarks?: string | null
          salary?: number | null
          salary_grade?: number | null
          separation_cause?: string | null
          separation_date?: string | null
          status_type?: string | null
          step_increment?: number | null
          updated_at?: string | null
        }
        Update: {
          agency?: string | null
          branch?: string | null
          created_at?: string | null
          created_by?: string | null
          daily_salary?: number | null
          date_from?: string
          date_to?: string | null
          designation?: string
          employee_id?: string
          id?: string
          leave_without_pay?: number | null
          legacy_id?: number | null
          office?: string | null
          remarks?: string | null
          salary?: number | null
          salary_grade?: number | null
          separation_cause?: string | null
          separation_date?: string | null
          status_type?: string | null
          step_increment?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      service_records_activity_log: {
        Row: {
          action: string
          created_at: string | null
          description: string | null
          id: string
          service_record_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          description?: string | null
          id?: string
          service_record_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string | null
          id?: string
          service_record_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_records_activity_log_service_record_id_fkey"
            columns: ["service_record_id"]
            isOneToOne: false
            referencedRelation: "service_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_records_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
      leave_credit_balances: {
        Row: {
          balance: number | null
          employee_id: string | null
          id: string | null
          leave_type_id: string | null
          total_credits: number | null
          used_credits: number | null
          year: number | null
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
    }
    Functions: {
      accrue_monthly_leave_credits: {
        Args: { p_month: number; p_year: number }
        Returns: {
          employees_count: number
          month_v: number
          rows_inserted: number
          rows_skipped: number
          year_v: number
        }[]
      }
      apply_attendance_vl_deduction: {
        Args: { p_employee_id?: string; p_month: number; p_year: number }
        Returns: {
          employees_v: number
          month_v: number
          posts_v: number
          total_days: number
          year_v: number
        }[]
      }
      compute_attendance_deduction_minutes: {
        Args: { p_employee_id: string; p_month: number; p_year: number }
        Returns: number
      }
      cron_run_monthly_accrual: { Args: never; Returns: string }
      cron_run_yearly_provision: { Args: never; Returns: string }
      get_employee_id: { Args: never; Returns: string }
      get_user_department_id: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["hris"]["Enums"]["user_role"]
      }
      map_employee_status: {
        Args: { inactive_eff: string; txt: string }
        Returns: Database["hris"]["Enums"]["employee_status"]
      }
      map_employment_type: {
        Args: { txt: string }
        Returns: Database["hris"]["Enums"]["employment_type"]
      }
      post_attendance_vl_deduction_for_employee: {
        Args: { p_employee_id: string; p_month: number; p_year: number }
        Returns: number
      }
      preview_attendance_vl_deduction: {
        Args: { p_employee_id?: string; p_month: number; p_year: number }
        Returns: {
          already_posted_days: number
          delta_days: number
          employee_id: string
          required_days: number
          total_minutes: number
        }[]
      }
      provision_year: {
        Args: { p_year: number }
        Returns: {
          carryover_rows: number
          seed_rows: number
        }[]
      }
      safe_to_date: { Args: { txt: string }; Returns: string }
      safe_to_int: { Args: { txt: string }; Returns: number }
      safe_to_numeric: { Args: { txt: string }; Returns: number }
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
        | "suspended"
        | "awol"
        | "dropped"
        | "deceased"
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
      rsp_appointment_nature:
        | "original"
        | "promotion"
        | "transfer"
        | "reemployment"
        | "reappointment"
        | "reclassification"
        | "demotion"
        | "others"
      rsp_appointment_status_type:
        | "permanent"
        | "temporary"
        | "coterminous"
        | "casual"
        | "contractual"
        | "substitute"
        | "provisional"
      salary_change_reason:
        | "initial"
        | "step_increment"
        | "promotion"
        | "reclassification"
        | "salary_standardization"
        | "adjustment"
        | "demotion"
      user_role:
        | "super_admin"
        | "hr_admin"
        | "department_head"
        | "employee"
        | "department_admin"
        | "department_admin_and_department_head"
        | "ocm_admin"
        | "dtr_manager"
        | "hr_record_manager"
        | "jo_manager"
        | "cos_manager"
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
        "suspended",
        "awol",
        "dropped",
        "deceased",
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
      rsp_appointment_nature: [
        "original",
        "promotion",
        "transfer",
        "reemployment",
        "reappointment",
        "reclassification",
        "demotion",
        "others",
      ],
      rsp_appointment_status_type: [
        "permanent",
        "temporary",
        "coterminous",
        "casual",
        "contractual",
        "substitute",
        "provisional",
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
      user_role: [
        "super_admin",
        "hr_admin",
        "department_head",
        "employee",
        "department_admin",
        "department_admin_and_department_head",
        "ocm_admin",
        "dtr_manager",
        "hr_record_manager",
        "jo_manager",
        "cos_manager",
      ],
    },
  },
} as const

