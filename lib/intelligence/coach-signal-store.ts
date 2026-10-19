/**
 * AI-R1E.1 coach signal persistence — SERVER-ONLY adapter over public.coach_signals.
 * Write path: service-role client + persist_coach_signal() RPC (atomic insert + supersession, first publication wins).
 * Read path: same-user, ACTIVE, unexpired, schema-compatible, domain-matched, clearance-filtered. A read NEVER mutates lifecycle.
 * Structured fields only: no raw chat, no chain-of-thought, no Athlete State. user_id comes from the trusted server caller,
 * never from the signal payload; the opaque userScope on the signal must match it.
 * Callers pass the client: the writer must be the service-role client (lib/supabase/admin.ts); the reader may be any client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachDomain, CoachImplication, CoachSignal, PrivacyClass } from "./coordination";
import { COACH_DOMAINS, COORDINATION_SCHEMA_VERSION, isCoachSignalActive, isSameUserScope, maxPrivacyClass, privacyRank, REF_RE } from "./coordination";
import { toUserScopeRef } from "./dante-runtime";

const PRIVACY: readonly PrivacyClass[] = ["NORMAL", "SENSITIVE", "MEDICAL"];
const STATUSES = ["CROSS_COACH_VERIFIED", "SUPPORTED_HYPOTHESIS", "INFERENCE", "HEURISTIC"];
const UNCERTAINTY = ["HIGH_SUPPORT", "MODERATE_SUPPORT", "WEAK_SUPPORT", "UNRESOLVED"];

export type PersistOutcome =
  | { ok: true; signalId: string; result: "INSERTED" | "DUPLICATE"; superseded: number }
  | { ok: false; signalId: string; reason: string };

/** Distinct, ordered target domains of a signal (derived from its implications). */
export const targetDomainsOf = (s: Pick<CoachSignal, "implications">): CoachDomain[] => [...new Set(s.implications.map((i) => i.targetDomain))];

/** Contract check before anything touches the DB. Returns reason codes; empty = persistable. Never reads signal text beyond tokens. */
export function validateSignalForPersistence(s: CoachSignal, userId: string): string[] {
  const bad: string[] = [];
  if (!isSameUserScope(s.userScope, toUserScopeRef(userId))) bad.push("USER_SCOPE_MISMATCH");
  if (s.schemaVersion !== COORDINATION_SCHEMA_VERSION) bad.push("SCHEMA_VERSION_UNSUPPORTED");
  if (s.lifecycle !== "ACTIVE") bad.push("NOT_ACTIVE");
  if (s.sourceCoach !== "DANTE" && s.sourceCoach !== "GEMMA") bad.push("UNKNOWN_PRODUCER");
  if (!COACH_DOMAINS.includes(s.sourceDomain)) bad.push("UNKNOWN_SOURCE_DOMAIN");
  const targets = targetDomainsOf(s);
  if (targets.length === 0) bad.push("EMPTY_TARGET_DOMAINS");
  if (targets.some((d) => !COACH_DOMAINS.includes(d))) bad.push("UNKNOWN_TARGET_DOMAIN");
  if (!PRIVACY.includes(s.privacyClass)) bad.push("UNKNOWN_PRIVACY_CLASS");
  if (!STATUSES.includes(s.status)) bad.push("UNKNOWN_STATUS");
  if (!UNCERTAINTY.includes(s.uncertainty)) bad.push("UNKNOWN_UNCERTAINTY");
  if (s.evidenceRefs.length === 0) bad.push("NO_EVIDENCE_REFS");
  if (s.provenance.length === 0) bad.push("NO_PROVENANCE");
  if (!(Date.parse(s.validUntil) > Date.parse(s.validFrom))) bad.push("INVALID_VALIDITY_WINDOW");
  const tokens = [s.id, s.idempotencyKey, s.signalType, ...s.evidenceRefs, ...s.provenance, ...(s.supersedes ?? []), ...s.implications.map((i) => i.value)];
  if (tokens.some((t) => !REF_RE.test(t))) bad.push("NON_STRUCTURED_TOKEN");
  return bad;
}

/** Privacy can only ratchet up on the way to the DB; a MEDICAL risk flag floors the class at MEDICAL. */
const persistedPrivacy = (s: CoachSignal): PrivacyClass => maxPrivacyClass(s.privacyClass, s.riskFlag === "MEDICAL_RISK" ? "MEDICAL" : "NORMAL");

/** Whitelisted column mapping: extra fields on a signal object can never reach the table. */
function toRpcPayload(s: CoachSignal) {
  return {
    signal_id: s.id,
    schema_version: s.schemaVersion,
    idempotency_key: s.idempotencyKey,
    producer: s.sourceCoach,
    source_domain: s.sourceDomain,
    target_domains: targetDomainsOf(s),
    signal_type: s.signalType,
    status: s.status,
    uncertainty: s.uncertainty,
    identifiability: s.identifiability,
    privacy_class: persistedPrivacy(s),
    risk_flag: s.riskFlag ?? null,
    evidence_refs: s.evidenceRefs,
    provenance: s.provenance,
    implications: s.implications.map(({ targetDomain, type, value, relevance, strength, hardBasis }) => ({
      targetDomain, type, value, relevance, ...(strength && { strength }), ...(hardBasis && { hardBasis }),
    })),
    supersedes: s.supersedes ?? [],
    valid_from: s.validFrom,
    valid_until: s.validUntil,
  };
}

/** Never throws. `userId` must be the authenticated server session's user; `client` must be the service-role client. */
export async function persistCoachSignal(client: SupabaseClient, userId: string, signal: CoachSignal): Promise<PersistOutcome> {
  const bad = validateSignalForPersistence(signal, userId);
  if (bad.length) return { ok: false, signalId: signal.id, reason: bad[0] };
  try {
    const { data, error } = await client.rpc("persist_coach_signal", { p_user_id: userId, p_signal: toRpcPayload(signal) });
    if (error) return { ok: false, signalId: signal.id, reason: `DB_ERROR:${error.code ?? "UNKNOWN"}` };
    const r = data as { status?: string; superseded?: number } | null;
    return { ok: true, signalId: signal.id, result: r?.status === "DUPLICATE" ? "DUPLICATE" : "INSERTED", superseded: Number(r?.superseded ?? 0) };
  } catch {
    return { ok: false, signalId: signal.id, reason: "PERSISTENCE_EXCEPTION" };
  }
}

export async function persistCoachSignals(client: SupabaseClient, userId: string, signals: CoachSignal[]): Promise<PersistOutcome[]> {
  const out: PersistOutcome[] = [];
  for (const s of signals) out.push(await persistCoachSignal(client, userId, s));
  return out;
}

type Row = {
  signal_id: string; schema_version: number; idempotency_key: string; producer: CoachSignal["sourceCoach"]; source_domain: CoachDomain;
  signal_type: string; status: CoachSignal["status"]; lifecycle: CoachSignal["lifecycle"]; uncertainty: CoachSignal["uncertainty"];
  identifiability: CoachSignal["identifiability"]; privacy_class: PrivacyClass; risk_flag: CoachSignal["riskFlag"] | null;
  evidence_refs: string[]; provenance: string[]; implications: CoachImplication[]; supersedes: string[]; superseded_by: string | null;
  valid_from: string; valid_until: string;
};

const iso = (t: string) => new Date(t).toISOString();

function fromRow(r: Row, userId: string): CoachSignal {
  return {
    id: r.signal_id, schemaVersion: COORDINATION_SCHEMA_VERSION, idempotencyKey: r.idempotency_key, userScope: toUserScopeRef(userId),
    privacyClass: r.privacy_class, lifecycle: r.lifecycle, sourceCoach: r.producer, sourceDomain: r.source_domain, signalType: r.signal_type,
    status: r.status, evidenceRefs: r.evidence_refs, uncertainty: r.uncertainty, identifiability: r.identifiability,
    implications: r.implications, provenance: r.provenance, validFrom: iso(r.valid_from), validUntil: iso(r.valid_until),
    ...(r.supersedes.length && { supersedes: r.supersedes }),
    ...(r.superseded_by && { supersededBy: r.superseded_by }),
    ...(r.risk_flag && { riskFlag: r.risk_flag }),
  };
}

/** Clearance → permitted classes by explicit rank: NORMAL → NORMAL; SENSITIVE → +SENSITIVE; MEDICAL → all. */
export const permittedPrivacyClasses = (clearance: PrivacyClass): PrivacyClass[] => PRIVACY.filter((p) => privacyRank(p) <= privacyRank(clearance));

/**
 * Same-user, ACTIVE, inside the validity window, schema-compatible, targeting `targetDomain`, privacy-permitted.
 * Read-only: does not consume, expire or otherwise touch lifecycle. Never throws: null = the read FAILED (a safety caller must
 * not treat that as "nothing disclosed"), [] = nothing active.
 */
export async function loadActiveCoachSignalsForDomain(
  client: SupabaseClient,
  args: { userId: string; targetDomain: CoachDomain; clearance: PrivacyClass; now: Date },
): Promise<CoachSignal[] | null> {
  try {
    const nowIso = args.now.toISOString();
    const { data, error } = await client
      .from("coach_signals")
      .select("signal_id,schema_version,idempotency_key,producer,source_domain,signal_type,status,lifecycle,uncertainty,identifiability,privacy_class,risk_flag,evidence_refs,provenance,implications,supersedes,superseded_by,valid_from,valid_until")
      .eq("user_id", args.userId)
      .eq("lifecycle", "ACTIVE")
      .eq("schema_version", COORDINATION_SCHEMA_VERSION)
      .contains("target_domains", [args.targetDomain])
      .in("privacy_class", permittedPrivacyClasses(args.clearance))
      .lte("valid_from", nowIso)
      .gt("valid_until", nowIso)
      .order("valid_from", { ascending: false });
    if (error || !data) return null;
    // Defence in depth: re-check the invariants in code, not only in the query.
    return (data as unknown as Row[])
      .map((r) => fromRow(r, args.userId))
      .filter((s) => s.lifecycle === "ACTIVE" && isCoachSignalActive(s, args.now) && privacyRank(s.privacyClass) <= privacyRank(args.clearance));
  } catch {
    return null;
  }
}

/**
 * The user retracted a disclosure ("I'm not allergic to fish after all"): every still-ACTIVE disclosure of those types, from
 * either coach, moves to WITHDRAWN (history kept, one-way). `client` must be the service-role client. Never throws.
 */
export async function withdrawDisclosureSignals(client: SupabaseClient, userId: string, signalTypes: string[]): Promise<boolean> {
  const types = signalTypes.filter((t) => t.startsWith("USER_DISCLOSED_") && REF_RE.test(t));
  if (types.length === 0) return true;
  try {
    const { error } = await client.from("coach_signals").update({ lifecycle: "WITHDRAWN" }).eq("user_id", userId).eq("lifecycle", "ACTIVE").in("signal_type", types);
    return !error;
  } catch {
    return false;
  }
}
