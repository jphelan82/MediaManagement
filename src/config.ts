import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';

const LibrarySchema = z.object({
  name: z.string(),
  tier: z.number().min(1).max(3),
  rootFolder: z.string(),
  qualityProfileId: z.number(),
});

const AppConfigSchema = z.object({
  radarr: z.object({
    url: z.string(),
    apiKey: z.string().min(1),
  }),
  libraries: z.array(LibrarySchema).min(1),
  scanner: z.object({
    scheduleCron: z.string(),
    rateLimit: z.object({
      maxConcurrent: z.number().min(1),
      delayBetweenMs: z.number().min(0),
      maxPerHour: z.number().min(1),
    }),
  }),
  pushover: z.object({
    enabled: z.boolean(),
    userKey: z.string(),
    apiToken: z.string(),
  }),
  server: z.object({
    host: z.string(),
    port: z.number(),
  }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type LibraryConfig = z.infer<typeof LibrarySchema>;

function loadConfig(): AppConfig {
  const configPath = process.env.CONFIG_PATH || path.resolve(__dirname, '..', 'config', 'default.yaml');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(raw);
  return AppConfigSchema.parse(parsed);
}

export const appConfig = loadConfig();

export function getLibraryByTier(tier: number): LibraryConfig | undefined {
  return appConfig.libraries.find(l => l.tier === tier);
}

export function getLibraryByRootFolder(rootFolder: string): LibraryConfig | undefined {
  // Normalize path separators and trailing slashes for comparison
  const normalize = (p: string) => p.replace(/[\\/]+/g, '/').replace(/\/+$/, '');
  const input = normalize(rootFolder);

  // Sort by path length descending so "S:/Movies (UHD)" matches before "S:/Movies"
  const sorted = [...appConfig.libraries].sort(
    (a, b) => normalize(b.rootFolder).length - normalize(a.rootFolder).length,
  );

  return sorted.find(l => {
    const configPath = normalize(l.rootFolder);
    // Movie path must start with root folder, followed by / or end of string
    return input === configPath || input.startsWith(configPath + '/');
  });
}

export function getLibraryByQualityProfile(profileId: number): LibraryConfig | undefined {
  return appConfig.libraries.find(l => l.qualityProfileId === profileId);
}

export function getLibrariesSortedByTier(): LibraryConfig[] {
  return [...appConfig.libraries].sort((a, b) => a.tier - b.tier);
}

export function getNextLowerTier(currentTier: number): LibraryConfig | undefined {
  const sorted = getLibrariesSortedByTier();
  return sorted.find(l => l.tier > currentTier);
}
