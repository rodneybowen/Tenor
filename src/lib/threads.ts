// =====================================================================
// Thread helpers — "Add to this log"
// =====================================================================
// A thread is a flat group of logs that share the same root. The root
// log has `parentLogId == null`; child logs have `parentLogId == root.id`.
// There is no branching: every "+ add to this log" tap from any log in
// a thread appends to the same root.
//
// The DB stores `topic` only on the root row. After `fetchLogs`, we
// denormalize the topic onto every log in the thread (see denormalizeTopics
// below) so card rendering can read `log.topic` directly without lookups.
// =====================================================================

import type { LogEntry } from '../data/mockLogs';

/** The id every log in this log's thread shares. For a root log this
 *  IS its own id. For a standalone (no children) log this is also its
 *  own id — callers should also check `isInThread()` before treating
 *  the return value as a thread identity. */
export function getRootLogId(log: LogEntry): string {
  return log.parentLogId ?? log.id;
}

/** Sorted oldest → newest. Includes the root + every child. */
export function getThreadLogs(log: LogEntry, all: LogEntry[]): LogEntry[] {
  const root = getRootLogId(log);
  return all
    .filter((l) => (l.parentLogId ?? l.id) === root)
    .sort((a, b) => a.ts - b.ts);
}

/** Count = root + every child. */
export function getThreadSize(log: LogEntry, all: LogEntry[]): number {
  return getThreadLogs(log, all).length;
}

/** True if the log has at least one sibling (root with a child, or any
 *  child). Standalone logs return false. */
export function isInThread(log: LogEntry, all: LogEntry[]): boolean {
  return getThreadSize(log, all) > 1;
}

/** Build a Map<rootId, topic> from the raw fetched logs, then return
 *  a new list with the topic copied onto every member of each thread.
 *  Standalone logs (no children) get `topic` left as null even if the
 *  row happens to carry a value — they're not really a thread.
 *
 *  The original input list is not mutated. */
export function denormalizeTopics(logs: LogEntry[]): LogEntry[] {
  // Index children by root id so we can detect "real" threads (root +
  // at least one child) in one pass.
  const memberCountByRoot = new Map<string, number>();
  for (const l of logs) {
    const root = l.parentLogId ?? l.id;
    memberCountByRoot.set(root, (memberCountByRoot.get(root) ?? 0) + 1);
  }

  // Topics only live on the root row in the DB.
  const topicByRoot = new Map<string, string | null>();
  for (const l of logs) {
    if (l.parentLogId == null) {
      topicByRoot.set(l.id, l.topic ?? null);
    }
  }

  return logs.map((l) => {
    const root = l.parentLogId ?? l.id;
    const isThread = (memberCountByRoot.get(root) ?? 0) > 1;
    if (!isThread) {
      // Standalone log — strip any stray topic so rendering branches
      // on `log.topic != null` are honest.
      return { ...l, topic: null };
    }
    return { ...l, topic: topicByRoot.get(root) ?? null };
  });
}

/** Replace one log's topic across every member of its thread, in
 *  memory. Used after the user renames a topic on the LogThreadScreen
 *  (or names it for the first time via the popup). The caller is
 *  responsible for persisting the new topic to the root row. */
export function setThreadTopic(
  logs: LogEntry[],
  rootId: string,
  topic: string | null,
): LogEntry[] {
  return logs.map((l) => {
    const root = l.parentLogId ?? l.id;
    if (root !== rootId) return l;
    return { ...l, topic };
  });
}
