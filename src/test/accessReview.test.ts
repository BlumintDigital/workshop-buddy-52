import { describe, expect, it, vi } from "vitest";
import {
  ACCESS_REVIEW_CSV_HEADERS,
  buildAccessReviewCsvRows,
  isAccessReviewUserStale,
  prepareAccessReviewUsers,
  type AccessReviewUser,
} from "@/lib/accessReview";

const now = new Date("2026-06-27T12:00:00.000Z").getTime();

function user(overrides: Partial<AccessReviewUser>): AccessReviewUser {
  return {
    user_id: "user-1",
    full_name: "Test User",
    email: "test@example.com",
    role: "admin",
    is_active: true,
    is_super_admin: false,
    last_sign_in_at: "2026-06-26T12:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("access review helpers", () => {
  it("marks recent sign-ins as active and null sign-ins as stale", () => {
    expect(isAccessReviewUserStale("2026-06-26T12:00:00.000Z", now)).toBe(false);
    expect(isAccessReviewUserStale(null, now)).toBe(true);
  });

  it("filters super admins and sorts stale users first", () => {
    const recent = user({ user_id: "recent", last_sign_in_at: "2026-06-26T12:00:00.000Z" });
    const stale = user({ user_id: "stale", last_sign_in_at: null });
    const superAdmin = user({ user_id: "super", is_super_admin: true, last_sign_in_at: null });

    const prepared = prepareAccessReviewUsers([recent, superAdmin, stale], now);

    expect(prepared.map((item) => item.user_id)).toEqual(["stale", "recent"]);
  });

  it("uses the displayed last sign-in value in CSV rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));

    const rows = buildAccessReviewCsvRows([
      user({
        full_name: "Emmanuel",
        role: "admin",
        last_sign_in_at: "2026-06-27T10:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      user({
        full_name: "Never User",
        role: "staff",
        last_sign_in_at: null,
        created_at: "2026-01-02T00:00:00.000Z",
      }),
    ]);

    expect(ACCESS_REVIEW_CSV_HEADERS).toContain("Last Sign-In");
    expect(rows[0]).toEqual([
      "Emmanuel",
      "admin",
      "Active",
      "2026-06-27T10:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      "No",
    ]);
    expect(rows[1][3]).toBe("Never");
    expect(rows[1][5]).toBe("Yes");

    vi.useRealTimers();
  });
});
