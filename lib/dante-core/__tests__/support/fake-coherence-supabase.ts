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
        select: () => {
          const read = { maybeSingle: async () => ({ data: { timezone: profiles.timezone }, error: null }) };
          // PostgREST's `.abortSignal()` returns the same builder (the route bounds this read with it).
          return { eq: () => ({ ...read, abortSignal: () => read }) };
        },
      };
    }
    if (name !== "dante_coherence_state") return inertQuery();

    // S0 D-04: rows are keyed by (user_id, thread_key); the legacy '' thread keeps the bare user id as its map key.
    const keyOf = (filters: Record<string, unknown>) => (filters.thread_key ? `${filters.user_id}:${filters.thread_key}` : String(filters.user_id));
    type Filters = Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a chainable PostgREST builder stub
    const filtered = (done: (filters: Filters) => object, filters: Filters = {}): any => ({ ...done(filters), eq: (column: string, value: unknown) => filtered(done, { ...filters, [column]: value }) });
    return {
      select: () => filtered((filters: Filters) => ({ maybeSingle: async () => ({ data: table.rows.get(keyOf(filters)) ?? null, error: null }) })),
      insert: async (row: FakeCoherenceRow & { thread_key?: string }) => {
        const key = keyOf(row);
        if (table.rows.has(key)) {
          table.writes.push({ kind: "insert", version: row.state_version, expected: null, applied: false });
          return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        table.rows.set(key, JSON.parse(JSON.stringify(row)));
        table.writes.push({ kind: "insert", version: row.state_version, expected: null, applied: true });
        return { error: null };
      },
      update: (payload: Omit<FakeCoherenceRow, "user_id">) => filtered((filters: Filters) => ({
        select: async () => {
          const key = keyOf(filters);
          const expected = filters.state_version as number;
          const row = table.rows.get(key);
          if (!row || row.state_version !== expected) {
            table.writes.push({ kind: "update", version: payload.state_version, expected, applied: false });
            return { data: [], error: null };
          }
          table.rows.set(key, { ...row, ...JSON.parse(JSON.stringify(payload)) });
          table.writes.push({ kind: "update", version: payload.state_version, expected, applied: true });
          return { data: [{ state_version: payload.state_version }], error: null };
        },
      })),
    };
  };
}
