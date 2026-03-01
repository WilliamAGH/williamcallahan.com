import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/connection";
import { contentEngagement } from "@/lib/db/schema/content-engagement";
import { engagementBatchSchema } from "@/types/schemas/engagement";

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_EVENTS_PER_WINDOW = 100;

function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for")?.trim();
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

function buildVisitorHash(headers: Headers): string {
  const ip = getClientIp(headers);
  const userAgent = headers.get("user-agent")?.trim() || "unknown";
  return createHash("sha256").update(`${ip}:${userAgent}`).digest("hex");
}

async function isRateLimited(visitorHash: string, incomingEventsCount: number): Promise<boolean> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentEngagement)
    .where(
      and(
        eq(contentEngagement.visitorHash, visitorHash),
        sql`${contentEngagement.createdAt} > now() - (${RATE_LIMIT_WINDOW_SECONDS} * interval '1 second')`,
      ),
    );

  const existingCount = rows[0]?.count ?? 0;
  return existingCount + incomingEventsCount > RATE_LIMIT_MAX_EVENTS_PER_WINDOW;
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("dnt") === "1") {
    return new Response(null, { status: 204 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = engagementBatchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid engagement payload",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const visitorHash = buildVisitorHash(request.headers);
  const events = parsed.data.events;

  if (await isRateLimited(visitorHash, events.length)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  await db.insert(contentEngagement).values(
    events.map((event) => ({
      contentType: event.contentType,
      contentId: event.contentId,
      eventType: event.eventType,
      durationMs: event.durationMs,
      visitorHash,
    })),
  );

  return new Response(null, { status: 204 });
}
