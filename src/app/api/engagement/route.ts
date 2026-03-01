import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/connection";
import { contentEngagement } from "@/lib/db/schema/content-engagement";
import { engagementBatchSchema } from "@/types/schemas/engagement";

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_EVENTS_PER_WINDOW = 100;

function getClientIp(headers: Headers): string | null {
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

  return null;
}

function buildVisitorHash(headers: Headers): string {
  const ip = getClientIp(headers);
  const userAgent = headers.get("user-agent")?.trim() || null;
  if (!ip || !userAgent) {
    console.warn(
      "[Engagement API] Missing request fingerprint headers; using deterministic fallback seed.",
      {
        hasIp: Boolean(ip),
        hasUserAgent: Boolean(userAgent),
      },
    );
  }
  const seed = `${ip ?? "missing-ip"}:${userAgent ?? "missing-ua"}`;
  return createHash("sha256").update(seed).digest("hex");
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

  const rateLimited = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${visitorHash}))`);

    const rows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(contentEngagement)
      .where(
        and(
          eq(contentEngagement.visitorHash, visitorHash),
          sql`${contentEngagement.createdAt} > now() - (${RATE_LIMIT_WINDOW_SECONDS} * interval '1 second')`,
        ),
      );

    const firstRow = rows[0];
    if (!firstRow) {
      throw new Error("[Engagement API] Rate-limit count query returned no rows");
    }
    const existingCount = firstRow.count;
    if (existingCount + events.length > RATE_LIMIT_MAX_EVENTS_PER_WINDOW) {
      return true;
    }

    await tx.insert(contentEngagement).values(
      events.map((event) => ({
        contentType: event.contentType,
        contentId: event.contentId,
        eventType: event.eventType,
        durationMs: event.durationMs,
        visitorHash,
      })),
    );

    return false;
  });

  if (rateLimited) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  return new Response(null, { status: 204 });
}
