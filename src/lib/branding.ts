import blumintLogoUrl from "@/assets/blumint_logo.png";
import type { SyntheticEvent } from "react";

export const DEFAULT_LOGO_URL = blumintLogoUrl;
const LEGACY_DEFAULT_LOGO_FILENAME = "Blumint_Logo.png";

export const isLegacyDefaultLogoUrl = (logoUrl?: string | null) => {
  const trimmed = logoUrl?.trim();
  if (!trimmed) return false;
  const normalizedPath = trimmed.split("?")[0].split("#")[0].replace(/\\/g, "/");
  return normalizedPath === LEGACY_DEFAULT_LOGO_FILENAME || normalizedPath.endsWith(`/${LEGACY_DEFAULT_LOGO_FILENAME}`);
};

export const getCustomLogoUrl = (logoUrl?: string | null) => {
  const trimmed = logoUrl?.trim();
  if (!trimmed || isLegacyDefaultLogoUrl(trimmed)) return null;
  return trimmed;
};

export const resolveLogoUrl = (logoUrl?: string | null) => {
  return getCustomLogoUrl(logoUrl) || DEFAULT_LOGO_URL;
};

export const useDefaultLogoOnError = (event: SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (image.src !== DEFAULT_LOGO_URL && !image.src.endsWith(DEFAULT_LOGO_URL)) {
    image.src = DEFAULT_LOGO_URL;
  }
};
