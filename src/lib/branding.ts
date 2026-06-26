import type { SyntheticEvent } from "react";

export const DEFAULT_LOGO_URL = "/Blumint_Logo.png";

export const resolveLogoUrl = (logoUrl?: string | null) => {
  const trimmed = logoUrl?.trim();
  return trimmed || DEFAULT_LOGO_URL;
};

export const useDefaultLogoOnError = (event: SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (!image.src.endsWith(DEFAULT_LOGO_URL)) {
    image.src = DEFAULT_LOGO_URL;
  }
};
