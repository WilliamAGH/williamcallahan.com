/**
 * Education Types
 */

export interface Education {
  id: string;
  institution: string;
  degree: string;
  year: string;
  logo?: string;
}

export interface Certification {
  id: string;
  institution: string;
  name: string;
  year: string;
  logo?: string;
}