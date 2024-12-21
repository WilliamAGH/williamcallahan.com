/**
 * Accelerator Type Definition
 * 
 * Represents a startup accelerator program.
 */

export interface Accelerator {
  readonly program: 'techstars' | 'ycombinator';
  readonly batch: string;
  readonly location: string;
  readonly logo?: string;
  readonly name?: string;
}