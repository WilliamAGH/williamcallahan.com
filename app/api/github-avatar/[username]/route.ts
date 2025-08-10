import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import type { GitHubAvatarRouteParams } from "@/types/api";

export async function GET(request: NextRequest, { params }: GitHubAvatarRouteParams) {
  void request; // Explicitly mark as intentionally unused
  try {
    const { username } = await params;
    
    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    // Validate username to prevent abuse
    if (!/^[a-zA-Z0-9-]+$/.test(username)) {
      return NextResponse.json({ error: "Invalid username format" }, { status: 400 });
    }

    // Construct GitHub avatar URL
    const avatarUrl = `https://avatars.githubusercontent.com/${username}`;
    
    // Use UnifiedImageService to fetch and persist the avatar
    const imageService = getUnifiedImageService();
    const result = await imageService.getImage(avatarUrl, {
      type: "social-avatars/github",
    });

    // If we got a CDN URL, redirect to it
    if (result.cdnUrl && !result.buffer) {
      return NextResponse.redirect(result.cdnUrl, { 
        status: 302,
        headers: {
          "Cache-Control": "public, max-age=604800", // 7 days
        }
      });
    }

    // If we have a buffer, return it
    if (result.buffer) {
      return new NextResponse(new Uint8Array(result.buffer), {
        headers: {
          "Content-Type": result.contentType,
          "Cache-Control": "public, max-age=604800", // 7 days
          "X-Cache": result.source === "s3" ? "HIT" : "MISS",
        },
      });
    }

    // Fallback to direct GitHub URL
    return NextResponse.redirect(avatarUrl, { status: 302 });
  } catch (error) {
    console.error("[GitHub Avatar] Error:", error);
    
    // Fallback to GitHub's default avatar
    return NextResponse.redirect("https://avatars.githubusercontent.com/u/0", { 
      status: 302,
      headers: {
        "Cache-Control": "public, max-age=300", // 5 minutes for errors
      }
    });
  }
}