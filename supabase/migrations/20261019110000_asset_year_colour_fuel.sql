-- Year of manufacture, colour and fuel on assets. Registration lookups fill them in; they can
-- also be typed by hand or imported from CSV.
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS year_of_manufacture smallint,
  ADD COLUMN IF NOT EXISTS colour text,
  ADD COLUMN IF NOT EXISTS fuel_type text;

DO $$ BEGIN
  ALTER TABLE public.assets ADD CONSTRAINT assets_year_of_manufacture_check
    CHECK (year_of_manufacture IS NULL OR year_of_manufacture BETWEEN 1900 AND 2100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.assets ADD CONSTRAINT assets_colour_length CHECK (colour IS NULL OR length(colour) <= 50);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.assets ADD CONSTRAINT assets_fuel_type_length CHECK (fuel_type IS NULL OR length(fuel_type) <= 50);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
