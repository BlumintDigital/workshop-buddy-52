export const ACCESS_REVIEW_STALE_DAYS = 90;

export type AccessReviewUser = {
  user_id: string;
  full_name: string | null;
  email?: string | null;
  role: string;
  is_active: boolean;
  is_super_admin?: boolean;
  last_sign_in_at: string | null;
  created_at: string;
};

export const ACCESS_REVIEW_CSV_HEADERS = [
  "Name",
  "Role",
  "Status",
  "Last Sign-In",
  "Account Created",
  "Stale (>90d)",
];

export function isAccessReviewUserStale(
  lastSignIn: string | null,
  nowMs = Date.now()
): boolean {
  if (!lastSignIn) return true;
  const lastSignInMs = new Date(lastSignIn).getTime();
  if (Number.isNaN(lastSignInMs)) return true;
  const daysSince = (nowMs - lastSignInMs) / 86_400_000;
  return daysSince > ACCESS_REVIEW_STALE_DAYS;
}

export function prepareAccessReviewUsers(
  users: AccessReviewUser[],
  nowMs = Date.now()
): AccessReviewUser[] {
  return users
    .filter((user) => !user.is_super_admin)
    .sort((a, b) => {
      const aStale = isAccessReviewUserStale(a.last_sign_in_at, nowMs) ? 1 : 0;
      const bStale = isAccessReviewUserStale(b.last_sign_in_at, nowMs) ? 1 : 0;
      return bStale - aStale;
    });
}

export function buildAccessReviewCsvRows(users: AccessReviewUser[]) {
  return users.map((user) => [
    user.full_name ?? "",
    user.role,
    user.is_active ? "Active" : "Inactive",
    user.last_sign_in_at ? new Date(user.last_sign_in_at).toISOString() : "Never",
    new Date(user.created_at).toISOString(),
    isAccessReviewUserStale(user.last_sign_in_at) ? "Yes" : "No",
  ]);
}
