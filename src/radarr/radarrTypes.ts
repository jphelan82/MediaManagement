import { z } from 'zod';

const QualityDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  source: z.string().optional(),
  resolution: z.number().optional(),
});

const QualitySchema = z.object({
  quality: QualityDetailSchema,
  revision: z.object({
    version: z.number(),
    real: z.number(),
  }).optional(),
});

const MovieFileSchema = z.object({
  id: z.number(),
  quality: QualitySchema,
  relativePath: z.string().optional(),
  size: z.number().optional(),
});

export const RadarrMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  year: z.number(),
  tmdbId: z.number(),
  hasFile: z.boolean(),
  movieFile: MovieFileSchema.nullish(),
  path: z.string(),
  qualityProfileId: z.number(),
  rootFolderPath: z.string().nullish(),
  monitored: z.boolean(),
  status: z.string().optional(),
  digitalRelease: z.string().nullish(),
  physicalRelease: z.string().nullish(),
  inCinemas: z.string().nullish(),
});

export const RadarrReleaseSchema = z.object({
  title: z.string(),
  quality: QualitySchema,
  indexer: z.string().optional(),
  size: z.number().optional(),
  approved: z.boolean().optional(),
  rejected: z.boolean().optional(),
  rejections: z.array(z.string()).optional(),
});

export type RadarrMovie = z.infer<typeof RadarrMovieSchema>;
export type RadarrRelease = z.infer<typeof RadarrReleaseSchema>;
export type RadarrMovieFile = z.infer<typeof MovieFileSchema>;

export interface QualityProfile {
  id: number;
  name: string;
  upgradeAllowed: boolean;
  cutoff: number;
  items: unknown[];
}

export interface RootFolder {
  id: number;
  path: string;
  freeSpace: number;
  accessible: boolean;
}

export interface RadarrCommand {
  id: number;
  name: string;
  status: string;
}
