/**
 * Investment Types
 */

import type { Accelerator } from './accelerator';

export interface Investment {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly type: string;
  readonly stage: string;
  readonly year: string;
  readonly status: 'Active' | 'Exited' | 'Inactive';
  readonly logo: string;
  readonly website?: string;
  readonly accelerator?: Accelerator;
  readonly details?: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
  }>;
}