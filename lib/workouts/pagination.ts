/**
 * Pure in-memory pagination for the Exercise Discovery browser (spec
 * §8). At the current/near-term scale (tens of local exercises, not
 * thousands from an external provider) a simple slice over the
 * already-filtered array is correctly scoped — no virtualization
 * library, no server round-trip per page. `page` is 1-indexed.
 */
export function sliceForPage<T>(records: T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, Math.floor(page));
  const start = 0;
  const end = safePage * pageSize;
  return records.slice(start, end);
}

export function hasMorePages<T>(records: T[], page: number, pageSize: number): boolean {
  return sliceForPage(records, page, pageSize).length < records.length;
}
