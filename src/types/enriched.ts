import type { Buchungen } from './app';

export type EnrichedBuchungen = Buchungen & {
  kursName: string;
};
