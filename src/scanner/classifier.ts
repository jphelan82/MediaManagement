import { RadarrRelease } from '../radarr/radarrTypes';
import { Tier } from '../types';

const IGNORED_QUALITIES = new Set([
  'CAM', 'TELECINE', 'TELESYNC', 'WORKPRINT', 'Unknown',
]);

/** Matches Dolby Vision indicators in release titles */
const DV_PATTERN = /\b(DV|DoVi|Dolby[\s.]?Vision)\b/i;

export function classifyReleases(releases: RadarrRelease[]): Tier | null {
  let bestTier: Tier | null = null;

  for (const release of releases) {
    const qualityName = release.quality?.quality?.name ?? '';
    if (IGNORED_QUALITIES.has(qualityName)) continue;

    // Skip Dolby Vision releases — they are unwanted regardless of tier
    if (DV_PATTERN.test(release.title)) continue;

    const tier = classifySingleRelease(qualityName, release.title);
    if (tier !== null && (bestTier === null || tier < bestTier)) {
      bestTier = tier;
    }
    if (bestTier === 1) break; // can't do better than remux
  }

  return bestTier;
}

function classifySingleRelease(qualityName: string, _title: string): Tier | null {
  const qLower = qualityName.toLowerCase();

  // Tier 1: 4K Remux — only trust Radarr's parsed quality name, not the release title
  if (qLower.includes('remux') && qLower.includes('2160p')) {
    return 1;
  }

  // Tier 2: 4K non-remux (WEB-DL, WEBRip, Blu-Ray encode, etc.)
  if (qLower.includes('2160p')) {
    return 2;
  }

  // Tier 3: 1080p
  if (qLower.includes('1080p')) {
    return 3;
  }

  // Below 1080p or unrecognized — ignore
  return null;
}

export function fileMatchesTier(qualityName: string, tier: number): boolean {
  const q = qualityName.toLowerCase();
  switch (tier) {
    case 1: return q.includes('remux') && q.includes('2160p');
    case 2: return q.includes('2160p') && !q.includes('remux');
    case 3: return q.includes('1080p');
    default: return false;
  }
}
