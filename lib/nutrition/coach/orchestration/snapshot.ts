import { isFollowUpLive, nextFollowUpState, type FollowUpState, type PendingChoiceContext, type StatePatch, type StructuredBlock } from "../followup"

import { parseOptions } from "./context"
import { listMatchesEngine, resolveFocusOwner, slugOf } from "./provenance"
import type { PresentedOptionSnapshot, RecentMessage } from "./types"

/**
 * Displayed-option snapshot: the ONE owner of "which options did the assistant actually show the user?".
 *
 * Lifecycle (the order is the contract):
 *   candidate response -> final validation -> what was ACTUALLY emitted -> snapshot -> follow-up state committed from it
 * Nothing selectable is committed from a pre-final candidate. A hidden engine choice that is not the emitted snapshot is
 * dropped in commitEmitted; a snapshot echoed by the client is re-validated against the conversation before it is read.
 */

export const SNAPSHOT_TTL_MS = 15 * 60_000

/** Stable, content-derived id (FNV-1a). No clock, no randomness. */
export function stableId(prefix: string, parts: unknown): string {
  let hash = 0x811c9dc5
  for (const char of JSON.stringify(parts)) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0
  return `${prefix}_${hash.toString(16).padStart(8, "0")}`
}

const PROVENANCE = "ASSISTANT_DISPLAYED_OPTION" as const
type OptionListBlock = Extract<StructuredBlock, { type: "OPTION_LIST" }>

const stamps = (now: Date) => ({ createdAtServer: now.toISOString(), expiresAt: new Date(now.getTime() + SNAPSHOT_TTL_MS).toISOString() })

function engineSnapshot(options: Array<{ id: string; label: string }>, seed: unknown, now: Date, expiresAt?: string): PresentedOptionSnapshot {
  const responseId = stableId("resp", [seed, options.map((option) => option.id)])
  return {
    responseId,
    owner: "ENGINE",
    options: options.map((option, i) => ({ index: i + 1, entityId: option.id, label: option.label, sourceRef: `block:${responseId}#${i + 1}`, provenance: PROVENANCE })),
    ...stamps(now),
    ...(expiresAt ? { expiresAt } : {}),
  }
}

function conversationSnapshot(reply: string, now: Date): PresentedOptionSnapshot | null {
  const listed = parseOptions(reply)
  if (listed.length < 2) return null
  const responseId = stableId("resp", [reply, listed.map((option) => option.text)])
  return {
    responseId,
    owner: "CONVERSATION",
    options: listed.map((option) => ({ index: option.index, entityId: `opt:${option.index}:${slugOf(option.text)}`, label: option.text, sourceRef: `reply:${responseId}#${option.index}`, provenance: PROVENANCE })),
    ...stamps(now),
  }
}

/**
 * The snapshot of what a FINAL reply (text + structured blocks) shows. conflict = the text enumerates a list the structured
 * block does not match: two different lists would be on screen, so the text list (what the user reads) wins and the caller
 * drops the block.
 */
export function snapshotFromEmitted(input: { reply: string; blocks: StructuredBlock[]; now: Date }): { snapshot: PresentedOptionSnapshot | null; conflict: boolean } {
  const block = input.blocks.find((candidate): candidate is OptionListBlock => candidate.type === "OPTION_LIST")?.options ?? []
  const written = parseOptions(input.reply)
  if (block.length >= 2 && (written.length === 0 || listMatchesEngine(written, block.map((option) => option.label)))) {
    return { snapshot: engineSnapshot(block, input.reply, input.now), conflict: false }
  }
  return { snapshot: conversationSnapshot(input.reply, input.now), conflict: block.length >= 2 }
}

/** The engine's pending choice, derived FROM the snapshot (the snapshot is the owner; this is only the follow-up resolver's view). */
export const engineChoiceOf = (snapshot: PresentedOptionSnapshot): PendingChoiceContext => ({
  options: snapshot.options.map((option) => ({ id: option.entityId, label: option.label })),
  createdAt: snapshot.createdAtServer,
  expiresAt: snapshot.expiresAt,
})

const sameChoice = (choice: PendingChoiceContext | null | undefined, snapshot: PresentedOptionSnapshot | null) =>
  Boolean(choice && snapshot && choice.options.length === snapshot.options.length && choice.options.every((option, i) => option.id === snapshot.options[i].entityId && option.label === snapshot.options[i].label))

/**
 * A client-echoed snapshot is only a claim. It is accepted when it still re-resolves: not expired, and the options it lists
 * are the ones really on screen (the coach's own list in the recent messages, or the engine's choice + meals). null = nothing
 * selectable is displayed any more.
 */
export function validateSnapshot(snapshot: PresentedOptionSnapshot | null | undefined, input: { recent: RecentMessage[]; followUp: FollowUpState | null | undefined; now: Date }): PresentedOptionSnapshot | null {
  if (!snapshot || snapshot.options.length < 2 || !(Date.parse(snapshot.expiresAt) > input.now.getTime())) return null
  if (snapshot.owner === "ENGINE") {
    const live = input.followUp && isFollowUpLive(input.followUp, input.now) ? input.followUp : null
    const known = new Set(live?.meals.map((meal) => meal.id))
    return live && sameChoice(live.presentedOptions, snapshot) && snapshot.options.every((option) => known.has(option.entityId)) ? snapshot : null
  }
  const turn = [...input.recent].reverse().find((message) => message.role === "coach" && parseOptions(message.text).length >= 2)
  const shown = turn ? parseOptions(turn.text) : []
  const matches = shown.length === snapshot.options.length && shown.every((option, i) => snapshot.options[i].label === option.text && snapshot.options[i].entityId === `opt:${option.index}:${slugOf(option.text)}`)
  return matches ? snapshot : null
}

/**
 * State echoed by a client that predates the snapshot: derive what it would have said from the old heuristic (the newest coach
 * turn decides the owner). Used only when the field is absent; once any response carries "presented", this is never consulted.
 */
export function legacySnapshot(input: { recent: RecentMessage[]; followUp: FollowUpState | null | undefined; engine: { names: string[]; optionLabels: string[] }; now: Date }): PresentedOptionSnapshot | null {
  if (resolveFocusOwner(input.recent, input.engine) === "CONVERSATION") {
    const turn = [...input.recent].reverse().find((message) => message.role === "coach" && parseOptions(message.text).length >= 2)
    return turn ? conversationSnapshot(turn.text, input.now) : null
  }
  const live = input.followUp && isFollowUpLive(input.followUp, input.now) ? input.followUp : null
  const choice = live?.presentedOptions
  if (!live || !choice || Date.parse(choice.expiresAt) <= input.now.getTime()) return null
  return engineSnapshot(choice.options, "legacy", input.now, choice.expiresAt)
}

/**
 * COMMIT ORDER. Given the final reply and the state patch the route wanted, decide what is really committed:
 *   1. the snapshot is read from the emitted reply + blocks (a conflicting structured list is dropped);
 *   2. a coach-written list supersedes the engine's referent / pending choice (it is what the user can act on now);
 *   3. the snapshot is replaced only by a newer emitted list, and carried otherwise (until TTL / invalidation);
 *   4. the engine may keep a selectable choice ONLY if it is exactly the displayed snapshot.
 */
export function commitEmitted(input: {
  reply: string
  blocks: StructuredBlock[]
  patch: StatePatch
  prevFollowUp: FollowUpState | null | undefined
  prior: PresentedOptionSnapshot | null
  /** Topic switch, reset, safety stop, deactivated draft: nothing from before may stay selectable. */
  invalidated: boolean
  now: Date
}): { blocks: StructuredBlock[]; followUp: FollowUpState | null; snapshot: PresentedOptionSnapshot | null } {
  const emitted = snapshotFromEmitted({ reply: input.reply, blocks: input.blocks, now: input.now })
  const blocks = emitted.conflict ? input.blocks.filter((block) => block.type !== "OPTION_LIST") : input.blocks
  const patch: StatePatch = emitted.snapshot?.owner === "CONVERSATION" ? { ...input.patch, referent: null, candidateReferents: [], presentedOptions: null, pendingProposal: null } : input.patch
  let followUp = nextFollowUpState(input.prevFollowUp, patch, input.now)
  let snapshot: PresentedOptionSnapshot | null = null
  if (!input.invalidated) {
    const carried = input.prior && (input.prior.owner === "CONVERSATION" || sameChoice(followUp?.presentedOptions, input.prior)) ? input.prior : null
    snapshot = emitted.snapshot ?? carried
  }
  if (followUp?.presentedOptions && !(snapshot?.owner === "ENGINE" && sameChoice(followUp.presentedOptions, snapshot))) {
    followUp = nextFollowUpState(input.prevFollowUp, { ...patch, presentedOptions: null }, input.now)
  }
  return { blocks, followUp, snapshot }
}
