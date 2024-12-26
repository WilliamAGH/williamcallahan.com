/**
 * Investment Types
 */

import type { Accelerator } from './accelerator';

export interface Investment {
  id: string;
  name: string;
  description: string;
  type: string;
  stage: string;
  year: string;
  status: 'Active' | 'Exited' | 'Inactive';
  logo: string;
  website?: string;
  accelerator?: Accelerator;
  details?: {
    label: string;
    value: string;
  }[];
}