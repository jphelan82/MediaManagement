import { RadarrRelease } from '../radarr/radarrTypes';
import { Tier } from '../types';

const IGNORED_QUALITIES = new Set([
  'CAM', 'TELECINE', 'TELESYNC', 'WORKPRINT', 'Unknown',
]);

export function classifyReleases(releases: RadarrRelease[]): Tier | null {
  let bestTier: Tier | null = null;

  for (const release of releases) {
    const qualityName = release.quality?.quality?.name ?? '';
    if (IGNORED_QUALITIES.has(qualityName)) continue;

    const tier = classifySingleRelease(qualityName, release.title);
    if (tier !== null && (bestTier === null || tier < bestTier)) {
      bestTier = tier;
    }
    if (bestTier === 1) break; // can't do better than remux
  }

  return bestTier;
}

function classifySingleRelease(qualityName: string, title: string): Tier | null {
  const qLower = qualityName.toLowerCase();
  const tLower = title.toLowerCase();

  // Tier 1: 4K Remux
  if (
    (qLower.includes('remux') && qLower.includes('2160p')) ||
    (tLower.includes('remux') && tLower.includes('2160p'))
  ) {
    return 1;
  }

  // Tier 2: 4K non-remux (WEB-DL, WEBRip, Blu-Ray encode, etc.)
  if (qLower.includes('2160p') || tLower.includes('2160p')) {
    return 2;
  }

  // Tier 3: 1080p
  if (qLower.includes('1080p') || tLower.includes('1080p')) {
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
