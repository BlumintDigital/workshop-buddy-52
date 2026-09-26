import { useEffect, useSyncExternalStore } from "react";

// Detail pages name their own last breadcrumb (a project ID, an invoice number)
// instead of the header showing the record's database ID.

const labels = new Map<string, string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Sets the breadcrumb label for `path` while the calling page is mounted. */
export function useBreadcrumbLabel(path: string, label: string | null | undefined) {
  useEffect(() => {
    if (!label) return;
    labels.set(path, label);
    emit();
    return () => {
      if (labels.get(path) === label) labels.delete(path);
      emit();
    };
  }, [path, label]);
}

/** The label a page registered for `path`, if any. */
export function useRegisteredLabel(path: string): string | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => labels.get(path),
  );
}

const ID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isIdSegment = (segment: string) => ID_SEGMENT.test(segment);
