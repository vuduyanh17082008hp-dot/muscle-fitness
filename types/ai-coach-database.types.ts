type TableDefinition<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type AiThreadRow = {
  id: string;
  user_id: string;
  title: string;
  thread_type: "chat" | "reminder";
  status: "active" | "archived";
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AiMessageRow = {
  id: string;
  thread_id: string;
  user_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  attachments: unknown;
  tool_calls: unknown;
  metadata: unknown;
  openai_response_id: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  created_at: string;
};

export type AiThreadSummaryRow = {
  id: string;
  thread_id: string;
  user_id: string;
  summary: string;
  covered_through_message_id: string | null;
  covered_message_count: number;
  model: string | null;
  created_at: string;
  updated_at: string;
};

export type AiUsageDailyRow = {
  id: string;
  user_id: string;
  usage_date: string;
  plan_code: string;
  messages_used: number;
  request_limit: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  model: string | null;
  created_at: string;
  updated_at: string;
};

export type AiEntitlementRow = {
  user_id: string;
  plan_code: string;
  daily_message_limit: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  source: string;
  external_subscription_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AiUserSettingsRow = {
  user_id: string;
  preferred_tone: "direct" | "supportive" | "analytical";
  detail_level: "concise" | "balanced" | "detailed";
  language: "vi" | "en";
  timezone: string;
  weekly_summary_enabled: boolean;
  workout_reminders_enabled: boolean;
  protein_reminders_enabled: boolean;
  reminder_hour_local: number;
  allow_conversation_memory: boolean;
  created_at: string;
  updated_at: string;
};

export type AiFeedbackRow = {
  id: string;
  user_id: string;
  thread_id: string;
  message_id: string;
  rating: -1 | 1;
  comment: string | null;
  created_at: string;
};

export type AiToolLogRow = {
  id: string;
  thread_id: string | null;
  user_id: string;
  tool_name: string;
  call_id: string | null;
  arguments: unknown;
  result: unknown;
  status: "success" | "error" | "confirmation_required";
  duration_ms: number;
  created_at: string;
};

export type AiWorkoutReminderRow = {
  id: string;
  user_id: string;
  thread_id: string | null;
  title: string;
  message: string;
  remind_at: string;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AiSupportTicketRow = {
  id: string;
  user_id: string;
  thread_id: string | null;
  subject: string;
  category:
    | "technical"
    | "billing"
    | "workout"
    | "nutrition"
    | "account"
    | "other";
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  created_at: string;
  updated_at: string;
};

export type AiUsageSnapshot = {
  usage_date: string;
  plan_code: string;
  messages_used: number;
  daily_limit: number;
  remaining: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export type AiConsumeUsageResult = {
  allowed: boolean;
  usage_date: string;
  plan_code: string;
  messages_used: number;
  daily_limit: number;
  remaining: number;
};

export type AiCoachDatabase = {
  public: {
    Tables: {
      ai_threads: TableDefinition<
        AiThreadRow,
        Partial<AiThreadRow> & Pick<AiThreadRow, "user_id"> & { id?: string }
      >;
      ai_messages: TableDefinition<
        AiMessageRow,
        Partial<AiMessageRow> &
          Pick<AiMessageRow, "thread_id" | "user_id" | "role"> & {
            id?: string;
          }
      >;
      ai_thread_summaries: TableDefinition<
        AiThreadSummaryRow,
        Partial<AiThreadSummaryRow> &
          Pick<
            AiThreadSummaryRow,
            "thread_id" | "user_id" | "summary"
          > & { id?: string }
      >;
      ai_usage_daily: TableDefinition<
        AiUsageDailyRow,
        Partial<AiUsageDailyRow> &
          Pick<AiUsageDailyRow, "user_id" | "usage_date"> & { id?: string }
      >;
      ai_entitlements: TableDefinition<
        AiEntitlementRow,
        Partial<AiEntitlementRow> & Pick<AiEntitlementRow, "user_id">
      >;
      ai_user_settings: TableDefinition<
        AiUserSettingsRow,
        Partial<AiUserSettingsRow> & Pick<AiUserSettingsRow, "user_id">
      >;
      ai_feedback: TableDefinition<
        AiFeedbackRow,
        Partial<AiFeedbackRow> &
          Pick<
            AiFeedbackRow,
            "user_id" | "thread_id" | "message_id" | "rating"
          > & { id?: string }
      >;
      ai_tool_logs: TableDefinition<
        AiToolLogRow,
        Partial<AiToolLogRow> &
          Pick<AiToolLogRow, "user_id" | "tool_name" | "status"> & {
            id?: string;
          }
      >;
      ai_workout_reminders: TableDefinition<
        AiWorkoutReminderRow,
        Partial<AiWorkoutReminderRow> &
          Pick<
            AiWorkoutReminderRow,
            "user_id" | "title" | "message" | "remind_at"
          > & { id?: string }
      >;
      ai_support_tickets: TableDefinition<
        AiSupportTicketRow,
        Partial<AiSupportTicketRow> &
          Pick<
            AiSupportTicketRow,
            "user_id" | "subject" | "category" | "description"
          > & { id?: string }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      consume_ai_usage: {
        Args: {
          p_thread_id?: string | null;
        };
        Returns: AiConsumeUsageResult[];
      };
      refund_ai_usage: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      get_ai_usage_snapshot: {
        Args: Record<string, never>;
        Returns: AiUsageSnapshot[];
      };
      record_ai_token_usage: {
        Args: {
          p_input_tokens: number;
          p_output_tokens: number;
          p_model: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
