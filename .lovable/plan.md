

# Session Activity Indicator + Warning Dialog

## What this delivers
A live countdown timer in the header showing remaining session time, plus an alert dialog that appears 2 minutes before auto-logout giving users the option to extend their session.

## Plan

### 1. Expose session timer state from AuthContext

**File: `src/hooks/useAuth.tsx`**
- Add `sessionTimeLeft` (number, ms remaining) to context
- Add a 1-second interval that decrements `sessionTimeLeft` from `SESSION_TIMEOUT_MS`
- Reset `sessionTimeLeft` to `SESSION_TIMEOUT_MS` whenever the inactivity timer resets (user activity)
- Add `extendSession()` method that resets the inactivity timer (for the warning dialog's "Stay Logged In" button)
- Export `SESSION_TIMEOUT_MS` so components can reference it

### 2. Create SessionIndicator component

**New file: `src/components/SessionIndicator.tsx`**
- Reads `sessionTimeLeft` and `extendSession` from `useAuth()`
- Displays a compact timer in the header (e.g., `🕐 28:45`) with a circular progress or simple text
- Color changes: green > 5 min, yellow 2-5 min, red < 2 min
- When `sessionTimeLeft <= 120000` (2 min), opens an `AlertDialog` with:
  - Title: "Session Expiring Soon"
  - Description: "Your session will expire in X:XX due to inactivity."
  - Actions: "Stay Logged In" (calls `extendSession()`) and "Log Out" (calls `signOut()`)
- Dialog auto-closes when user clicks "Stay Logged In"

### 3. Add to AppHeader

**File: `src/components/layout/AppHeader.tsx`**
- Add `<SessionIndicator />` next to `<NotificationBell />` in the header's right section

### Files modified
| File | Change |
|------|--------|
| `src/hooks/useAuth.tsx` | Add `sessionTimeLeft`, countdown interval, `extendSession()` to context |
| `src/components/SessionIndicator.tsx` | New component with timer display + warning dialog |
| `src/components/layout/AppHeader.tsx` | Add SessionIndicator to header |

