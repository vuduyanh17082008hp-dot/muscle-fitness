/**
 * Minimal Supabase surface for AI Coach tables/RPCs that are not yet
 * fully represented in generated Database types on this branch.
 */

export type AiRow = Record<string, unknown>;

export type AiQueryResult = {
  data: AiRow | AiRow[] | null;
  error: { message: string } | null;
  count?: number | null;
};

export type AiQueryBuilder = {
  select: (
    columns?: string,
    options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ) => AiQueryBuilder;
  insert: (values: unknown) => AiQueryBuilder;
  update: (values: Record<string, unknown>) => AiQueryBuilder;
  upsert: (
    values: unknown,
    options?: Record<string, unknown>,
  ) => AiQueryBuilder;
  delete: () => AiQueryBuilder;
  eq: (column: string, value: unknown) => AiQueryBuilder;
  in: (column: string, values: unknown[]) => AiQueryBuilder;
  is: (column: string, value: unknown) => AiQueryBuilder;
  lte: (column: string, value: unknown) => AiQueryBuilder;
  gte: (column: string, value: unknown) => AiQueryBuilder;
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

export function asAiRow(value: unknown): AiRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as AiRow;
}

export function asAiRows(value: unknown): AiRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is AiRow =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}
