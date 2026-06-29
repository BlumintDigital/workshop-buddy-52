
CREATE TABLE public.invoice_pdf_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status_at_generation text,
  file_path text NOT NULL,
  file_size integer,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, version)
);

CREATE INDEX invoice_pdf_versions_invoice_id_idx
  ON public.invoice_pdf_versions (invoice_id, generated_at DESC);

GRANT SELECT, INSERT, DELETE ON public.invoice_pdf_versions TO authenticated;
GRANT ALL ON public.invoice_pdf_versions TO service_role;

ALTER TABLE public.invoice_pdf_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers manage pdf versions"
  ON public.invoice_pdf_versions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));

CREATE POLICY "Clients read own invoice pdf versions"
  ON public.invoice_pdf_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_pdf_versions.invoice_id
        AND i.client_id = auth.uid()
    )
  );

-- Storage RLS for the invoice-pdfs bucket. File path: <invoice_id>/v<version>.pdf
CREATE POLICY "Admins and managers manage invoice pdf files"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'invoice-pdfs'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))
  )
  WITH CHECK (
    bucket_id = 'invoice-pdfs'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))
  );

CREATE POLICY "Clients read own invoice pdf files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-pdfs'
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id::text = (storage.foldername(name))[1]
        AND i.client_id = auth.uid()
    )
  );
