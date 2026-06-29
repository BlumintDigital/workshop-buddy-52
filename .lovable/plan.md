## Goal
Fill the empty right-side space on `/invoices/new` with a live PDF preview that updates as the user types, styled to match the existing invoice PDF and using the workshop's company details.

## Layout changes — `src/pages/invoices/InvoiceCreate.tsx`
- Remove the `max-w-3xl` cap and switch the page into a two-column grid:
  - Left column (≈`lg:col-span-7`): existing form (Invoice Details, Line Items, Totals, Save button) — unchanged content.
  - Right column (≈`lg:col-span-5`): new `Card` titled "Live Preview" with a sticky container (`lg:sticky lg:top-20`) holding the PDF preview.
- On mobile/tablet (`<lg`), the preview stacks below the form.

## Preview component — new `src/components/invoices/InvoicePdfPreview.tsx`
- Uses `@react-pdf/renderer`'s `PDFViewer` (already in the dependency tree via `src/lib/invoicePdf.tsx`) to render in-browser inside an iframe.
- Props: invoice draft fields (number placeholder, due date, status="DRAFT", tax_rate, notes, currency, fx_rate), clientName, items, workshop details.
- Reuses the existing `InvoiceDocument` JSX. To avoid duplication, export `InvoiceDocument` from `src/lib/invoicePdf.tsx` and import it here.
- Debounces re-renders (~300ms) so each keystroke doesn't thrash the PDF engine.
- Shows a lightweight skeleton while first rendering and an error fallback if generation fails.

## Workshop company details
- Fetch once in `InvoiceCreate` via React Query: `workshop_settings` row id=1 selecting `workshop_name, address, phone, email, website, logo_url, currency, tax_id` (only the columns that exist — will verify before writing the select).
- Pass these into the preview component.

## PDF template upgrades — `src/lib/invoicePdf.tsx`
Extend `InvoiceDocument` to actually use company details so the preview looks like a real invoice:
- Header band: workshop logo (if `logo_url`) on the left, workshop name + address + phone + email + website stacked on the right.
- "Bill To" block with client name (and email if available later).
- Keep existing line-items table, totals, notes.
- Show a faint "DRAFT" watermark when `invoice.status === "draft"`.
- Existing download flow (`generateInvoicePDF`) keeps working — it already fetches `workshop_settings`; expand its select to include the new columns and forward them into `InvoiceDocument`.

## Preview-specific invoice object
Build a synthetic `invoice` object in `InvoiceCreate` from current form state:
- `invoice_number`: `"INV-PREVIEW"` placeholder until saved.
- `status`: `"draft"`.
- `due_date`, `tax_rate`, `notes`, `currency`, `fx_rate`, `subtotal`, `tax_amount`, `total` from current state.

## Out of scope
- No changes to the `InvoiceDetail` page or the saved-invoice download button beyond the template upgrade (which it already benefits from).
- No DB schema changes.
- No new dependencies — `@react-pdf/renderer` is already used.

## Technical notes
- `PDFViewer` renders inside an `<iframe>` so it won't inherit Tailwind styles; size it via `style={{ width: "100%", height: 800 }}` inside a responsive wrapper.
- Memoize the `<InvoiceDocument>` element with `useMemo` keyed on the debounced form state to prevent unnecessary re-renders.
