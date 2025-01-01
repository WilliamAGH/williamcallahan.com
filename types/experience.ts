/**
 * Experience Types
 */

import type { Accelerator } from './accelerator';

export interface Experience {
  id: string;
  company: string;
  period: string;
  role: string;
  logo?: string;
  website?: string;
  accelerator?: Accelerator;
  /** Optional location of the company */
  location?: string;
}
