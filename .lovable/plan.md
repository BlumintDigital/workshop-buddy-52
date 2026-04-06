

## Fix Build Error in admin-api/index.ts

### Problem
Line 543: `{ data: rlsTest }` captures the `data` property which is `null` when using `head: true`. The actual count is in the `count` property. Then line 552 compares `anonCount` (an array or null) against `0`, causing the TS2367 type error.

### Fix — File: `supabase/functions/admin-api/index.ts`

**Line 543:** Change destructuring from `{ data: rlsTest, error: rlsErr }` to `{ count: rlsCount, error: rlsErr }`

**Line 551:** Change `const anonCount = rlsTest ?? 0;` to `const anonCount = rlsCount ?? 0;`

No other files affected.

