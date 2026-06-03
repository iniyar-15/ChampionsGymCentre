export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          user_name: string
          role: 'admin' | 'manager' | 'coach'
          phone: string | null
          email: string | null
          date_of_birth: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      students: {
        Row: {
          id: string
          auth_id: string | null
          name: string
          parent_name: string | null
          contact_phone: string
          secondary_phone: string | null
          email: string | null
          date_of_birth: string
          gender: 'male' | 'female' | 'other' | null
          school: string | null
          level_id: string | null
          fee_structure_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['students']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['students']['Insert']>
      }
      batches: {
        Row: {
          id: string
          name: string
          days: string[]
          start_time: string
          end_time: string
          start_date: string | null
          end_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['batches']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['batches']['Insert']>
      }
      levels: {
        Row: {
          id: string
          name: string
          start_age: number | null
          end_age: number | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['levels']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['levels']['Insert']>
      }
      apparatus: {
        Row: {
          id: string
          name: string
          gender: 'male' | 'female' | 'mixed' | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['apparatus']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['apparatus']['Insert']>
      }
      skills: {
        Row: {
          id: string
          name: string
          apparatus_id: string | null
          category: string | null
          description: string | null
          value: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['skills']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['skills']['Insert']>
      }
      fee_structures: {
        Row: {
          id: string
          name: string
          days_per_week: number
          amount: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['fee_structures']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['fee_structures']['Insert']>
      }
      fee_collections: {
        Row: {
          id: string
          month: string
          student_id: string
          fee_structure_id: string | null
          amount: number
          paid_amount: number
          paid_date: string | null
          payment_mode: string | null
          reference_id: string | null
          notes: string | null
          receipt_url: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['fee_collections']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['fee_collections']['Insert']>
      }
      competitions: {
        Row: {
          id: string
          name: string
          organized_by: string | null
          location: string | null
          start_date: string | null
          end_date: string | null
          start_time: string | null
          end_time: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['competitions']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['competitions']['Insert']>
      }
      competition_age_groups: {
        Row: {
          id: string
          competition_id: string
          name: string
          min_age: number | null
          max_age: number | null
          level_id: string | null
          entry_fee: number | null
          is_finalized: boolean
        }
        Insert: Omit<Database['public']['Tables']['competition_age_groups']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['competition_age_groups']['Insert']>
      }
      competition_shortlist: {
        Row: {
          id: string
          age_group_id: string
          student_id: string
          status: 'shortlisted' | 'finalized' | 'removed'
          notified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['competition_shortlist']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['competition_shortlist']['Insert']>
      }
      announcements: {
        Row: {
          id: string
          title: string
          body: string | null
          competition_id: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['announcements']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['announcements']['Insert']>
      }
      announcement_reads: {
        Row: { announcement_id: string; student_id: string; read_at: string }
        Insert: Omit<Database['public']['Tables']['announcement_reads']['Row'], 'read_at'>
        Update: Partial<Database['public']['Tables']['announcement_reads']['Insert']>
      }
      competition_age_group_apparatus: {
        Row: {
          id: string
          age_group_id: string
          apparatus_id: string
        }
        Insert: Omit<Database['public']['Tables']['competition_age_group_apparatus']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['competition_age_group_apparatus']['Insert']>
      }
      competition_enrollments: {
        Row: {
          id: string
          age_group_id: string
          student_id: string
          apparatus_id: string
          points: number | null
          rank: number | null
          awards: string | null
          enrolled_at: string
        }
        Insert: Omit<Database['public']['Tables']['competition_enrollments']['Row'], 'id' | 'enrolled_at'>
        Update: Partial<Database['public']['Tables']['competition_enrollments']['Insert']>
      }
      attendance: {
        Row: {
          id: string
          batch_id: string
          level_id: string
          student_id: string
          date: string
          status: 'present' | 'absent'
          marked_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['attendance']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['attendance']['Insert']>
      }
      curriculum: {
        Row: {
          id: string
          batch_id: string
          level_id: string
          date: string
          apparatus_id: string
          coach_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['curriculum']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['curriculum']['Insert']>
      }
      feedback: {
        Row: {
          id: string
          student_id: string
          month: string
          apparatus_id: string
          skill_id: string | null
          feedback_text: string | null
          coach_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['feedback']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['feedback']['Insert']>
      }
      level_apparatus: {
        Row: { level_id: string; apparatus_id: string }
        Insert: Database['public']['Tables']['level_apparatus']['Row']
        Update: Partial<Database['public']['Tables']['level_apparatus']['Row']>
      }
      level_skills: {
        Row: { level_id: string; skill_id: string }
        Insert: Database['public']['Tables']['level_skills']['Row']
        Update: Partial<Database['public']['Tables']['level_skills']['Row']>
      }
      coach_batches: {
        Row: { coach_id: string; batch_id: string }
        Insert: Database['public']['Tables']['coach_batches']['Row']
        Update: Partial<Database['public']['Tables']['coach_batches']['Row']>
      }
      coach_levels: {
        Row: { coach_id: string; level_id: string }
        Insert: Database['public']['Tables']['coach_levels']['Row']
        Update: Partial<Database['public']['Tables']['coach_levels']['Row']>
      }
      student_batches: {
        Row: { student_id: string; batch_id: string; enrolled_at: string }
        Insert: Omit<Database['public']['Tables']['student_batches']['Row'], 'enrolled_at'>
        Update: Partial<Database['public']['Tables']['student_batches']['Row']>
      }
    }
    Functions: {
      calculate_age: { Args: { dob: string }; Returns: number }
      get_user_role: { Args: Record<never, never>; Returns: string }
    }
  }
}

// Convenience types
export type UserRow = Database['public']['Tables']['users']['Row']
export type StudentRow = Database['public']['Tables']['students']['Row']
export type BatchRow = Database['public']['Tables']['batches']['Row']
export type LevelRow = Database['public']['Tables']['levels']['Row']
export type ApparatusRow = Database['public']['Tables']['apparatus']['Row']
export type SkillRow = Database['public']['Tables']['skills']['Row']
export type FeeStructureRow = Database['public']['Tables']['fee_structures']['Row']
export type FeeCollectionRow = Database['public']['Tables']['fee_collections']['Row']
export type CompetitionRow = Database['public']['Tables']['competitions']['Row']
export type CompetitionAgeGroupRow = Database['public']['Tables']['competition_age_groups']['Row']
export type CompetitionEnrollmentRow = Database['public']['Tables']['competition_enrollments']['Row']
export type CompetitionShortlistRow = Database['public']['Tables']['competition_shortlist']['Row']
export type AnnouncementRow = Database['public']['Tables']['announcements']['Row']
export type AttendanceRow = Database['public']['Tables']['attendance']['Row']
export type CurriculumRow = Database['public']['Tables']['curriculum']['Row']
export type FeedbackRow = Database['public']['Tables']['feedback']['Row']