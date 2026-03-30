

## Clearer Loading Screen

Replace the plain spinner in `ProtectedRoute.tsx` and add a matching one for the Auth page redirect check with a branded loading screen that includes:

- The Workshop Manager logo (Wrench icon) and app name
- A smooth progress bar (indeterminate) using the existing `Progress` component or a custom animated bar
- A subtle "Loading your workspace..." message
- Fade-in animation for polish

### Changes

**1. Create `src/components/LoadingScreen.tsx`**

A reusable full-screen loading component with:
- Centered Wrench icon + "Workshop Manager" title (matching Auth page branding)
- An indeterminate animated progress bar beneath
- "Loading your workspace..." muted text
- `animate-fade-in` entrance animation

**2. Update `src/components/ProtectedRoute.tsx`**

Replace the bare spinner `div` (lines 15-19) with `<LoadingScreen />`.

**3. Update `src/pages/Auth.tsx`**

Replace the early-return loading/redirect check (the `useEffect` + implicit render while loading) to also show `<LoadingScreen />` when `loading` is true, so users see the same branded screen before being redirected to their dashboard.

