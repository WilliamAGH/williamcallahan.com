import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/connection";
import { aiAnalysisLatest } from "@/lib/db/schema/ai-analysis";
import { preventCaching } from "@/lib/utils/api-utils";

const CATEGORY_LIMIT = 12;

export async function GET(): Promise<NextResponse> {
  preventCaching();

  try {
    const categoryExpression = sql<
      string | null
    >`nullif(trim(${aiAnalysisLatest.payload} -> 'analysis' ->> 'category'), '')`;
    const rows = await db
      .select({
        name: categoryExpression,
        count: sql<number>`count(*)::int`,
      })
      .from(aiAnalysisLatest)
      .where(and(eq(aiAnalysisLatest.domain, "bookmarks"), sql`${categoryExpression} is not null`))
      .groupBy(categoryExpression)
      .orderBy(desc(sql<number>`count(*)::int`))
      .limit(CATEGORY_LIMIT);

    return NextResponse.json({
      categories: rows
        .filter((row) => row.name !== null)
        .map((row) => ({
          name: row.name,
          count: row.count,
        })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API Bookmarks Categories] Failed to load categories:", message);
    return NextResponse.json({ error: "Failed to load bookmark categories" }, { status: 500 });
  }
}
