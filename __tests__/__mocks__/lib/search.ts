/**
 * Mock search module for tests
 */
import { vi } from "vitest";
import type { SearchResult } from "@/types/schemas/search";

type SearchFunction = (query: string) => Promise<SearchResult[]>;

export const searchExperience = vi.fn<SearchFunction>().mockResolvedValue([]);
export const searchEducation = vi.fn<SearchFunction>().mockResolvedValue([]);
export const searchInvestments = vi.fn<SearchFunction>().mockResolvedValue([]);
export const searchBookmarks = vi.fn<SearchFunction>().mockResolvedValue([]);
export const searchProjects = vi.fn<SearchFunction>().mockResolvedValue([]);
export const searchBooks = vi.fn<SearchFunction>().mockResolvedValue([]);
export const searchBlogPosts = vi.fn<SearchFunction>().mockResolvedValue([]);
export const searchAll = vi.fn<SearchFunction>().mockResolvedValue([]);
