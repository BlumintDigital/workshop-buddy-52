import { useState } from "react";

export const PAGE_SIZE = 25;

export function usePagination() {
  const [page, setPage] = useState(0);

  const reset = () => setPage(0);
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  return { page, setPage, from, to, reset };
}
