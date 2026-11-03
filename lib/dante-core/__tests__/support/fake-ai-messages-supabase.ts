// In-memory stand-in for the ai_threads / ai_messages query-builder calls conversation-store.ts makes.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;
export function fakeAiSupabase(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: Array<(row: Row) => boolean> = [];
    let op: { kind: "select" } | { kind: "upsert"; value: Row; onConflict: string } | { kind: "update"; value: Row } = { kind: "select" };
    let order: { col: string; asc: boolean } | null = null;
    let limit = Infinity;
    const run = () => {
      if (op.kind === "upsert") {
        const keys = op.onConflict.split(",");
        const value = op.value;
        if (!rows.some((row) => keys.every((key) => row[key] === value[key]))) rows.push({ id: crypto.randomUUID(), status: "complete", metadata: {}, updated_at: new Date().toISOString(), ...value });
        return { data: null, error: null };
      }
      let hit = rows.filter((row) => filters.every((f) => f(row)));
      if (op.kind === "update") {
        for (const row of hit) Object.assign(row, op.value);
        return { data: hit.map((row) => ({ id: row.id })), error: null };
      }
      if (order) {
        const { col, asc } = order;
        hit = [...hit].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      return { data: hit.slice(0, limit), error: null };
    };
    const builder = {
      select: () => builder,
      upsert: (value: Row, options: { onConflict: string }) => ((op = { kind: "upsert", value, onConflict: options.onConflict }), builder),
      update: (value: Row) => ((op = { kind: "update", value }), builder),
      eq: (col: string, value: unknown) => (filters.push((row) => row[col] === value), builder),
      in: (col: string, values: unknown[]) => (filters.push((row) => values.includes(row[col])), builder),
      order: (col: string, options: { ascending: boolean }) => ((order = { col, asc: options.ascending }), builder),
      limit: (n: number) => ((limit = n), builder),
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve(run()),
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}
