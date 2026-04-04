export type Tier = 1 | 2 | 3;

export interface ScanProgress {
  running: boolean;
  total: number;
  processed: number;
  skipped: number;
  downgrades: number;
  upgradesQueued: number;
  errors: number;
  startedAt: Date | null;
}
