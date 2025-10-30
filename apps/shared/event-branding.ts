export interface EventMessagingBrandSource {
  name?: string | null;
  secondaryTitle?: string | null;
  hosts?: Array<string | null | undefined> | null;
  eventHostNames?: Array<string | null | undefined> | null;
  productionCompany?: string | null | undefined;
}

export interface ResolveEventMessagingBrandNameOptions {
  fallback?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitizeBrandCandidate = (
  value: string | null | undefined,
): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (EMAIL_PATTERN.test(trimmed.toLowerCase())) return undefined;
  return trimmed;
};

/**
 * Formats an array of host names into a readable string.
 * - 1 name: "Name"
 * - 2 names: "Name1 & Name2"
 * - 3+ names: "Name1, Name2, ..., & NameN"
 */
export function formatHostNames(
  hostNames: Array<string | null | undefined> | null | undefined,
): string | undefined {
  if (!hostNames || hostNames.length === 0) return undefined;
  
  const validNames = hostNames
    .map((name) => {
      if (!name) return undefined;
      const trimmed = name.trim();
      if (!trimmed) return undefined;
      // Filter out email addresses
      if (EMAIL_PATTERN.test(trimmed.toLowerCase())) return undefined;
      return trimmed;
    })
    .filter((name): name is string => name !== undefined);

  if (validNames.length === 0) return undefined;
  if (validNames.length === 1) return validNames[0];
  if (validNames.length === 2) return `${validNames[0]} & ${validNames[1]}`;
  
  // 3+ names: "Name1, Name2, ..., & NameN"
  const allButLast = validNames.slice(0, -1);
  const last = validNames[validNames.length - 1];
  return `${allButLast.join(", ")}, & ${last}`;
}

const extractBrandFromSecondaryTitle = (
  secondaryTitle: string | null | undefined,
): string | undefined => {
  if (!secondaryTitle) return undefined;
  const trimmed = secondaryTitle.trim();
  if (!trimmed) return undefined;
  const hostedMatch = trimmed.match(/hosted by\s+(.+)/i);
  if (hostedMatch?.[1]) {
    return sanitizeBrandCandidate(hostedMatch[1]);
  }
  const presentedMatch = trimmed.match(/presented by\s+(.+)/i);
  if (presentedMatch?.[1]) {
    return sanitizeBrandCandidate(presentedMatch[1]);
  }
  const byMatch = trimmed.match(/by\s+(.+)/i);
  if (byMatch?.[1]) {
    return sanitizeBrandCandidate(byMatch[1]);
  }
  return sanitizeBrandCandidate(trimmed);
};

export function resolveEventMessagingBrandName(
  source: EventMessagingBrandSource | null | undefined,
  { fallback = "Event Host" }: ResolveEventMessagingBrandNameOptions = {},
): string {
  // Production company takes precedence
  const productionCompanyBrand = sanitizeBrandCandidate(
    source?.productionCompany ?? undefined,
  );
  if (productionCompanyBrand) {
    return productionCompanyBrand;
  }

  // Next, try formatted host names
  const hostCandidates = source?.eventHostNames ?? source?.hosts ?? [];
  const formattedHostNames = formatHostNames(hostCandidates);
  if (formattedHostNames) {
    return formattedHostNames;
  }

  const secondaryTitleBrand = extractBrandFromSecondaryTitle(
    source?.secondaryTitle ?? undefined,
  );
  if (secondaryTitleBrand) {
    return secondaryTitleBrand;
  }

  const nameBrand = sanitizeBrandCandidate(source?.name ?? undefined);
  if (nameBrand) {
    return nameBrand;
  }

  return fallback;
}

