/**
 * Mock search module for tests
 */
import { vi } from "vitest";

export const searchExperience = vi.fn().mockResolvedValue([]);
export const searchEducation = vi.fn().mockResolvedValue([]);
export const searchInvestments = vi.fn().mockResolvedValue([]);
export const searchBookmarks = vi.fn().mockResolvedValue([]);
export const searchProjects = vi.fn().mockResolvedValue([]);
export const searchBooks = vi.fn().mockResolvedValue([]);
export const searchBlogPosts = vi.fn().mockResolvedValue([]);
export const searchAll = vi.fn().mockResolvedValue([]);
