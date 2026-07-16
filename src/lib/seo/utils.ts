/**
 * SEO Utility Functions
 *
 * Date formatting utilities compliant with OpenGraph and Schema.org requirements.
 *
 * @module lib/seo/utils
 * @see {@link "https://ogp.me/#type_article"} OpenGraph date format requirements
 * @see {@link "https://schema.org/Article"} Schema.org date format requirements
 */

import type { PacificDateString } from "../../types/seo/shared";
import { getDeterministicTimestamp } from "@/lib/utils/deterministic-timestamp";

const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const PACIFIC_CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;
const EXPLICIT_TIME_ZONE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

const PACIFIC_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

function formatOffset(totalMinutes: number): string {
  const sign = totalMinutes <= 0 ? "-" : "+";
  const absMinutes = Math.abs(totalMinutes);
  const hours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const minutes = String(absMinutes % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function getPacificDateParts(date: Date): {
  year: string;
  month: string;
  day: string;
  hours: string;
  minutes: string;
  seconds: string;
  offset: string;
  offsetMinutes: number;
} {
  const parts = PACIFIC_DATE_FORMATTER.formatToParts(date);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  const getRequiredPart = (part: Intl.DateTimeFormatPartTypes): string => {
    const value = partMap.get(part);
    if (!value) throw new TypeError(`Pacific date formatter omitted ${part}`);
    return value;
  };
  const year = getRequiredPart("year");
  const month = getRequiredPart("month");
  const day = getRequiredPart("day");
  const hours = getRequiredPart("hour");
  const minutes = getRequiredPart("minute");
  const seconds = getRequiredPart("second");
  const offsetMinutes = Math.round(
    (Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
    ) -
      date.getTime()) /
      60000,
  );
  const offset = formatOffset(offsetMinutes);

  return { year, month, day, hours, minutes, seconds, offset, offsetMinutes };
}

function formatPacificCivilDate(input: string): PacificDateString | null {
  const match = PACIFIC_CIVIL_DATE.exec(input);
  if (!match) return null;

  const [, year, month, day, hours = "00", minutes = "00", seconds = "00"] = match;
  const civilTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
  const expected = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  const candidateOffsets = new Set<number>();
  for (let dayDelta = -1; dayDelta <= 1; dayDelta += 1) {
    candidateOffsets.add(
      getPacificDateParts(new Date(civilTime + dayDelta * MILLISECONDS_PER_DAY)).offsetMinutes,
    );
  }
  const matches = [...candidateOffsets].filter((offsetMinutes) => {
    const candidate = new Date(civilTime - offsetMinutes * 60_000);
    const parts = getPacificDateParts(candidate);
    return (
      `${parts.year}-${parts.month}-${parts.day}T${parts.hours}:${parts.minutes}:${parts.seconds}` ===
      expected
    );
  });

  const [offsetMinutes] = matches;
  if (offsetMinutes === undefined || matches.length !== 1) {
    throw new TypeError("Invalid or ambiguous Pacific civil date provided to formatSeoDate");
  }

  return `${expected}${formatOffset(offsetMinutes)}`;
}

/**
 * Formats a date as an ISO 8601 string with Pacific Time offset for SEO metadata
 *
 * Converts date to the required format for OpenGraph and Schema.org with correct Pacific Time offset
 *
 * @param date - The date to format. If omitted, current date and time are used
 * @returns ISO 8601 date string with Pacific Time offset suitable for SEO metadata
 * @throws {Error} If the date string doesn't conform to the PacificDateString format
 */
export function formatSeoDate(date: string | Date | undefined | number): PacificDateString {
  let inputDate = date;
  if (typeof inputDate === "number") {
    throw new TypeError(
      "Numeric timestamp inputs are not supported by formatSeoDate. Provide string or Date.",
    );
  }
  if (inputDate === undefined) {
    // Use deterministic timestamp during build to avoid Next.js static generation errors
    inputDate = new Date(getDeterministicTimestamp());
  }

  if (typeof inputDate === "string") {
    const pacificCivilDate = formatPacificCivilDate(inputDate);
    if (pacificCivilDate) return pacificCivilDate;
    if (!EXPLICIT_TIME_ZONE.test(inputDate)) {
      throw new TypeError("Unoffset date strings must use ISO Pacific civil date-time format");
    }
  }

  const d = new Date(inputDate);

  if (Number.isNaN(d.getTime())) {
    throw new TypeError("Invalid date provided to formatSeoDate");
  }

  const pacific = getPacificDateParts(d);

  return `${pacific.year}-${pacific.month}-${pacific.day}T${pacific.hours}:${pacific.minutes}:${pacific.seconds}${pacific.offset}`;
}
