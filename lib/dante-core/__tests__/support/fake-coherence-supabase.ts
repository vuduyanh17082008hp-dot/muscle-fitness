/**
 * Test double for the `dante_coherence_state` table with the same observable semantics the Supabase store relies
 * on: unique primary key (23505 on duplicate insert) and an atomic UPDATE ... WHERE state_version = <expected>
 * that returns the updated rows. Everything else answers "no rows" so unrelated route lookups stay inert.
 */

export type FakeCoherenceRow = {
  user_id: string;
  state_version: number;
  schema_version: number;
  state: unknown;
  updated_at?: string;
};

export type FakeCoherenceTable = {
  rows: Map<string, FakeCoherenceRow>;
  /** Every write attempt, in order, with its outcome — lets tests assert stale writes were refused. */
  writes: Array<{ kind: "insert" | "update"; version: number; expected: number | null; applied: boolean }>;
};

export function createFakeCoherenceTable(): FakeCoherenceTable {
  return { rows: new Map(), writes: [] };
}

function inertQuery(): unknown {
  const query: unknown = new Proxy(() => query, {
    get: (_target, prop) => {
      if (prop === "then") return undefined;
      if (prop === "maybeSingle") return async () => ({ data: null, error: null });
      return () => query;
    },
  });
  return query;
}

export function fakeCoherenceFrom(table: FakeCoherenceTable, profiles: { timezone: string | null }) {
  return (name: string) => {
    if (name === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { timezone: profiles.timezone }, error: null }),
          }),
        }),
      };
    }
    if (name !== "dante_coherence_state") return inertQuery();

    return {
      select: () => ({
        eq: (_column: string, userId: string) => ({
          maybeSingle: async () => ({ data: table.rows.get(userId) ?? null, error: null }),
        }),
      }),
      insert: async (row: FakeCoherenceRow) => {
        if (table.rows.has(row.user_id)) {
          table.writes.push({ kind: "insert", version: row.state_version, expected: null, applied: false });
          return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        table.rows.set(row.user_id, JSON.parse(JSON.stringify(row)));
        table.writes.push({ kind: "insert", version: row.state_version, expected: null, applied: true });
        return { error: null };
      },
      update: (payload: Omit<FakeCoherenceRow, "user_id">) => ({
        eq: (_userColumn: string, userId: string) => ({
          eq: (_versionColumn: string, expected: number) => ({
            select: async () => {
              const row = table.rows.get(userId);
              if (!row || row.state_version !== expected) {
                table.writes.push({ kind: "update", version: payload.state_version, expected, applied: false });
                return { data: [], error: null };
              }
              table.rows.set(userId, { user_id: userId, ...JSON.parse(JSON.stringify(payload)) });
              table.writes.push({ kind: "update", version: payload.state_version, expected, applied: true });
              return { data: [{ state_version: payload.state_version }], error: null };
            },
          }),
        }),
      }),
    };
  };
}
