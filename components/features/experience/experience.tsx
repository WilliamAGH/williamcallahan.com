/**
 * Experience Section Component
 * Displays professional experience entries with logos and details
 */

import { ExperienceCard, LogoImage } from "../../../components/ui";
import { experiences } from "../../../data/experience";
import type { Experience as ExperienceType } from "../../../types";

export function Experience() {
  return (
    <div className="flex flex-col gap-4">
      {experiences.map((exp: ExperienceType) => (
        <div key={exp.company} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <LogoImage 
              company={exp.company} 
              logoUrl={exp.logo}
              website={exp.website}
              width={24} 
              height={24} 
            />
            <h3 className="text-lg font-semibold">{exp.company}</h3>
          </div>
          <ExperienceCard {...exp} />
        </div>
      ))}
    </div>
  );
}
