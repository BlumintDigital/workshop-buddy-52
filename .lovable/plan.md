## Plan

1. **Make Access Review resilient to edge-function request failures**
   - Keep using `admin-access-review` as the primary source because it can read real Supabase Auth `last_sign_in_at` values.
   - Improve the error handling so a failed edge function call does not leave the page as “No users found” without context.

2. **Fix the edge function invocation/auth path**
   - Update the client call to explicitly use the active session access token when invoking `admin-access-review`.
   - Add a clear fallback message when no session token is available instead of triggering an unauthenticated edge-function request.

3. **Harden the edge function CORS response**
   - Replace the custom origin logic with the standard Supabase CORS header pattern used by the rest of the project.
   - Ensure `OPTIONS`, success, and error responses all include the same required headers.

4. **Add a safe fallback data path**
   - If the edge function cannot be reached because of a transient preview/network issue, load the admin-visible profile/role data directly from Supabase so the page still shows users.
   - Mark last sign-in as unavailable only when the edge function fails, instead of incorrectly treating every user as stale.

5. **Validate**
   - Test the deployed `admin-access-review` function directly with the authenticated preview session.
   - Verify the Access Review page shows the signed-in admin account and does not show the failed edge-function toast on normal load.