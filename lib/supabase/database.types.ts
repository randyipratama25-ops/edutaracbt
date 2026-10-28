export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      attempt_answers: {
        Row: {
          attempt_id: string;
          question_id: string;
          question_version: number;
          revision: number;
          saved_at: string;
          value: Json;
        };
        Insert: {
          attempt_id: string;
          question_id: string;
          question_version: number;
          revision: number;
          saved_at?: string;
          value: Json;
        };
        Update: {
          attempt_id?: string;
          question_id?: string;
          question_version?: number;
          revision?: number;
          saved_at?: string;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "exam_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_answers_question_id_question_version_fkey";
            columns: ["question_id", "question_version"];
            isOneToOne: false;
            referencedRelation: "question_versions";
            referencedColumns: ["question_id", "version"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          request_id: string | null;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          request_id?: string | null;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          request_id?: string | null;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          active: boolean;
          id: string;
          name: string;
          organization_id: string;
        };
        Insert: {
          active?: boolean;
          id?: string;
          name: string;
          organization_id: string;
        };
        Update: {
          active?: boolean;
          id?: string;
          name?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_attempts: {
        Row: {
          attempt_number: number;
          deadline_at: string;
          exam_id: string;
          id: string;
          organization_id: string;
          score_percent: number | null;
          started_at: string;
          status: string;
          student_id: string;
          version: number;
        };
        Insert: {
          attempt_number?: number;
          deadline_at: string;
          exam_id: string;
          id?: string;
          organization_id: string;
          score_percent?: number | null;
          started_at?: string;
          status?: string;
          student_id: string;
          version?: number;
        };
        Update: {
          attempt_number?: number;
          deadline_at?: string;
          exam_id?: string;
          id?: string;
          organization_id?: string;
          score_percent?: number | null;
          started_at?: string;
          status?: string;
          student_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_attempts_organization_id_exam_id_fkey";
            columns: ["organization_id", "exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "exam_attempts_organization_id_student_id_fkey";
            columns: ["organization_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      exam_classes: {
        Row: {
          class_id: string;
          exam_id: string;
          organization_id: string;
        };
        Insert: {
          class_id: string;
          exam_id: string;
          organization_id: string;
        };
        Update: {
          class_id?: string;
          exam_id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_classes_organization_id_class_id_fkey";
            columns: ["organization_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "exam_classes_organization_id_exam_id_fkey";
            columns: ["organization_id", "exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      exam_room_students: {
        Row: {
          exam_id: string;
          organization_id: string;
          room_id: string;
          student_id: string;
        };
        Insert: {
          exam_id: string;
          organization_id: string;
          room_id: string;
          student_id: string;
        };
        Update: {
          exam_id?: string;
          organization_id?: string;
          room_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_room_students_organization_id_exam_id_room_id_fkey";
            columns: ["organization_id", "exam_id", "room_id"];
            isOneToOne: false;
            referencedRelation: "exam_rooms";
            referencedColumns: ["organization_id", "exam_id", "id"];
          },
          {
            foreignKeyName: "exam_room_students_organization_id_student_id_fkey";
            columns: ["organization_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      exam_rooms: {
        Row: {
          capacity: number;
          exam_id: string;
          id: string;
          name: string;
          organization_id: string;
        };
        Insert: {
          capacity: number;
          exam_id: string;
          id?: string;
          name: string;
          organization_id: string;
        };
        Update: {
          capacity?: number;
          exam_id?: string;
          id?: string;
          name?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_rooms_organization_id_exam_id_fkey";
            columns: ["organization_id", "exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      exam_type_configs: {
        Row: {
          default_points: number;
          enabled: boolean;
          exam_id: string;
          max_questions: number | null;
          option_count: number | null;
          type: string;
        };
        Insert: {
          default_points: number;
          enabled?: boolean;
          exam_id: string;
          max_questions?: number | null;
          option_count?: number | null;
          type: string;
        };
        Update: {
          default_points?: number;
          enabled?: boolean;
          exam_id?: string;
          max_questions?: number | null;
          option_count?: number | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_type_configs_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
        ];
      };
      exams: {
        Row: {
          duration_minutes: number;
          ends_at: string;
          id: string;
          organization_id: string;
          passing_grade: number;
          pin_hash: string;
          policy_version: number;
          starts_at: string;
          status: string;
          subject_id: string | null;
          title: string;
        };
        Insert: {
          duration_minutes: number;
          ends_at: string;
          id?: string;
          organization_id: string;
          passing_grade?: number;
          pin_hash: string;
          policy_version?: number;
          starts_at: string;
          status?: string;
          subject_id?: string | null;
          title: string;
        };
        Update: {
          duration_minutes?: number;
          ends_at?: string;
          id?: string;
          organization_id?: string;
          passing_grade?: number;
          pin_hash?: string;
          policy_version?: number;
          starts_at?: string;
          status?: string;
          subject_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exams_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exams_organization_id_subject_id_fkey";
            columns: ["organization_id", "subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      grade_items: {
        Row: {
          approved_by: string | null;
          attempt_id: string;
          awarded_points: number;
          id: string;
          max_points: number;
          question_id: string;
          question_version: number;
          source: string;
        };
        Insert: {
          approved_by?: string | null;
          attempt_id: string;
          awarded_points: number;
          id?: string;
          max_points: number;
          question_id: string;
          question_version: number;
          source: string;
        };
        Update: {
          approved_by?: string | null;
          attempt_id?: string;
          awarded_points?: number;
          id?: string;
          max_points?: number;
          question_id?: string;
          question_version?: number;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grade_items_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grade_items_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "exam_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grade_items_question_id_question_version_fkey";
            columns: ["question_id", "question_version"];
            isOneToOne: false;
            referencedRelation: "question_versions";
            referencedColumns: ["question_id", "version"];
          },
        ];
      };
      job_runs: {
        Row: {
          created_at: string;
          id: string;
          idempotency_key: string;
          kind: string;
          organization_id: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          idempotency_key: string;
          kind: string;
          organization_id: string;
          status: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          kind?: string;
          organization_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_runs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      media_assets: {
        Row: {
          byte_size: number;
          created_at: string;
          id: string;
          mime_type: string;
          object_path: string;
          organization_id: string;
          uploader_id: string;
        };
        Insert: {
          byte_size: number;
          created_at?: string;
          id?: string;
          mime_type: string;
          object_path: string;
          organization_id: string;
          uploader_id: string;
        };
        Update: {
          byte_size?: number;
          created_at?: string;
          id?: string;
          mime_type?: string;
          object_path?: string;
          organization_id?: string;
          uploader_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_assets_uploader_id_fkey";
            columns: ["uploader_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          timezone: string;
        };
        Insert: {
          id?: string;
          name: string;
          timezone?: string;
        };
        Update: {
          id?: string;
          name?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          active: boolean;
          archived_at: string | null;
          created_at: string;
          full_name: string;
          id: string;
          organization_id: string;
          role: string;
          username: string;
        };
        Insert: {
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          full_name: string;
          id: string;
          organization_id: string;
          role: string;
          username: string;
        };
        Update: {
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
          organization_id?: string;
          role?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      question_versions: {
        Row: {
          created_at: string;
          payload: Json;
          question_id: string;
          schema_version: number;
          version: number;
        };
        Insert: {
          created_at?: string;
          payload: Json;
          question_id: string;
          schema_version?: number;
          version: number;
        };
        Update: {
          created_at?: string;
          payload?: Json;
          question_id?: string;
          schema_version?: number;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "question_versions_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          archived_at: string | null;
          current_version: number;
          exam_id: string;
          id: string;
          organization_id: string;
          points: number;
          type: string;
        };
        Insert: {
          archived_at?: string | null;
          current_version?: number;
          exam_id: string;
          id?: string;
          organization_id: string;
          points: number;
          type: string;
        };
        Update: {
          archived_at?: string | null;
          current_version?: number;
          exam_id?: string;
          id?: string;
          organization_id?: string;
          points?: number;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_organization_id_exam_id_fkey";
            columns: ["organization_id", "exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      student_enrollments: {
        Row: {
          active: boolean;
          class_id: string;
          id: string;
          organization_id: string;
          student_id: string;
        };
        Insert: {
          active?: boolean;
          class_id: string;
          id?: string;
          organization_id: string;
          student_id: string;
        };
        Update: {
          active?: boolean;
          class_id?: string;
          id?: string;
          organization_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_enrollments_organization_id_class_id_fkey";
            columns: ["organization_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "student_enrollments_organization_id_student_id_fkey";
            columns: ["organization_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      subjects: {
        Row: {
          active: boolean;
          id: string;
          name: string;
          organization_id: string;
        };
        Insert: {
          active?: boolean;
          id?: string;
          name: string;
          organization_id: string;
        };
        Update: {
          active?: boolean;
          id?: string;
          name?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subjects_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      supervisor_assignments: {
        Row: {
          active: boolean;
          exam_id: string;
          id: string;
          organization_id: string;
          original_supervisor_id: string;
          room_id: string;
        };
        Insert: {
          active?: boolean;
          exam_id: string;
          id?: string;
          organization_id: string;
          original_supervisor_id: string;
          room_id: string;
        };
        Update: {
          active?: boolean;
          exam_id?: string;
          id?: string;
          organization_id?: string;
          original_supervisor_id?: string;
          room_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supervisor_assignments_organization_id_exam_id_room_id_fkey";
            columns: ["organization_id", "exam_id", "room_id"];
            isOneToOne: false;
            referencedRelation: "exam_rooms";
            referencedColumns: ["organization_id", "exam_id", "id"];
          },
          {
            foreignKeyName: "supervisor_assignments_organization_id_original_supervisor_fkey";
            columns: ["organization_id", "original_supervisor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      supervisor_substitutions: {
        Row: {
          assignment_id: string;
          effective_from: string;
          effective_until: string | null;
          id: string;
          revoked_at: string | null;
          substitute_supervisor_id: string;
        };
        Insert: {
          assignment_id: string;
          effective_from?: string;
          effective_until?: string | null;
          id?: string;
          revoked_at?: string | null;
          substitute_supervisor_id: string;
        };
        Update: {
          assignment_id?: string;
          effective_from?: string;
          effective_until?: string | null;
          id?: string;
          revoked_at?: string | null;
          substitute_supervisor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supervisor_substitutions_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "supervisor_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supervisor_substitutions_substitute_supervisor_id_fkey";
            columns: ["substitute_supervisor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_assignments: {
        Row: {
          active: boolean;
          class_id: string;
          id: string;
          organization_id: string;
          subject_id: string;
          teacher_id: string;
        };
        Insert: {
          active?: boolean;
          class_id: string;
          id?: string;
          organization_id: string;
          subject_id: string;
          teacher_id: string;
        };
        Update: {
          active?: boolean;
          class_id?: string;
          id?: string;
          organization_id?: string;
          subject_id?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_assignments_organization_id_class_id_fkey";
            columns: ["organization_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "teacher_assignments_organization_id_subject_id_fkey";
            columns: ["organization_id", "subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "teacher_assignments_organization_id_teacher_id_fkey";
            columns: ["organization_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      consume_login_budget: { Args: { budget_key: string }; Returns: boolean };
      has_supervisor_context: { Args: never; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
