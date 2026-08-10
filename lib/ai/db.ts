/**
 * Minimal untyped Supabase surface for AI Coach tables/RPCs that are not yet
 * fully represented in generated Database types on this branch.
 */
export type AiQueryResult<T = unknown> = {
  data: T;
  error: { message: string } | null;
};

export type AiQueryBuilder = {
  select: (columns?: string) => AiQueryBuilder;
  insert: (values: unknown) => AiQueryBuilder;
  update: (values: Record<string, unknown>) => AiQueryBuilder;
  upsert: (
    values: unknown,
    options?: Record<string, unknown>,
  ) => AiQueryBuilder;
  delete: () => AiQueryBuilder;
  eq: (column: string, value: unknown) => AiQueryBuilder;
  in: (column: string, values: unknown[]) => AiQueryBuilder;
  contains: (column: string, value: unknown) => AiQueryBuilder;
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => AiQueryBuilder;
  limit: (count: number) => AiQueryBuilder;
  maybeSingle: () => PromiseLike<AiQueryResult>;
  single: () => PromiseLike<AiQueryResult>;
  then: PromiseLike<AiQueryResult>["then"];
};

export type AiDatabaseClient = {
  from: (table: string) => AiQueryBuilder;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<AiQueryResult>;
};

export function asAiDatabaseClient(client: unknown): AiDatabaseClient {
  return client as AiDatabaseClient;
}
