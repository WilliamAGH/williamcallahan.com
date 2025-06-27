/**
 * Education Client Component
 * @module components/features/education/education.client
 * @description
 * Client component that handles the display and interaction for the education section.
 * Receives pre-rendered cards with server-fetched logos from the server component.
 * Manages window state (minimize, maximize, close).
 *
 * @example
 * ```tsx
 * <EducationClient
 *   education={educationWithLogos}
 *   recentCourses={recentCoursesWithLogos}
 *   certifications={certificationsWithLogos}
 * />
 * ```
 */

"use client";

import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client"; // Use new hook
import { cn } from "@/lib/utils"; // Import cn utility
import { ChevronDown, ChevronUp, GraduationCap, Search } from "lucide-react"; // Import additional icons
import Image from "next/image";
import { useMemo, useState } from "react";
import { WindowControls } from "@/components/ui/navigation/window-controls";
import { EducationCardClient } from "./education-card.client";

// Define a unique ID for this window instance
const EDUCATION_WINDOW_ID = "education-window";

import type { EducationClientProps, EducationTableItem } from "@/types/education";

// Sort indicator component
const SortIndicator = ({
  field,
  sortField,
  sortDirection,
}: {
  field: "name" | "institution" | "year";
  sortField: "name" | "institution" | "year";
  sortDirection: "asc" | "desc";
}) => {
  if (sortField !== field) return null;
  return sortDirection === "asc" ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />;
};

/**
 * Education Client Component
 * @param {EducationClientProps} props - Component properties
 * @returns {JSX.Element} Rendered education section with client-side cards and window controls
 */
export function EducationClient({
  education,
  recentCourses,
  recentCertifications,
}: EducationClientProps): React.JSX.Element | null {
  // Register this window instance and get its state/actions
  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered,
  } = useRegisteredWindowState(EDUCATION_WINDOW_ID, GraduationCap, "Restore Education", "normal");

  // Combined table data for filtering
  const tableData = useMemo<EducationTableItem[]>(
    () => [...(recentCourses || []), ...(recentCertifications || [])],
    [recentCourses, recentCertifications],
  );

  // State for filtering/searching
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<"all" | "course" | "certification">("all");
  const [sortField, setSortField] = useState<"name" | "institution" | "year">("institution");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Filter and sort the table data
  const filteredTableData = useMemo(() => {
    return tableData
      .filter((item) => {
        // Type filter
        if (selectedType !== "all" && item.type !== selectedType) {
          return false;
        }

        // Search filter
        if (searchQuery) {
          const searchTerms = searchQuery.toLowerCase().split(" ").filter(Boolean);
          const itemText = `${item.name} ${item.institution} ${item.year || ""}`.toLowerCase();
          return searchTerms.every((term) => itemText.includes(term));
        }

        return true;
      })
      .sort((a, b) => {
        // Handle sorting
        let valueA: string | number | undefined;
        let valueB: string | number | undefined;

        if (sortField === "name") {
          valueA = a.name;
          valueB = b.name;
        } else if (sortField === "year") {
          valueA = a.year;
          valueB = b.year;
        } else {
          valueA = a.institution;
          valueB = b.institution;
        }

        // Sort by the selected field
        const comparison = String(valueA ?? "").localeCompare(String(valueB ?? ""));
        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [tableData, selectedType, searchQuery, sortField, sortDirection]);

  // Toggle sort direction and field
  const toggleSort = (field: "name" | "institution" | "year") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Log state changes (optional)
  if (isRegistered) {
    console.log(`EducationClient Render (${EDUCATION_WINDOW_ID}) - Window State:`, windowState);
  }

  // Render nothing until ready
  if (!isRegistered) {
    return null;
  }

  // Handle closed state
  if (windowState === "closed") {
    return null;
  }

  // Handle minimized state
  // This is now handled by the FloatingRestoreButtons component
  if (windowState === "minimized") {
    return null;
  }

  // Render normal or maximized view
  const isMaximized = windowState === "maximized";

  // Refactored structure to match ProjectsClient (single main wrapper)
  return (
    <div
      className={cn(
        // Base styles
        "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden",
        "transition-all duration-300 ease-in-out", // Optional: Add transition like projects
        // Normal state styles
        "relative max-w-5xl mx-auto mt-8 rounded-lg shadow-lg",
        // Maximized state overrides
        isMaximized &&
          "fixed inset-0 z-[60] max-w-none m-0 rounded-none shadow-none flex flex-col h-full top-16 bottom-16 md:bottom-4", // Adjust insets if needed
      )}
    >
      {/* Sticky Header (remains the same) */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center">
          <WindowControls onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} />
          <h1 className="text-xl font-mono ml-4">~/education</h1>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div
        className={cn(
          "p-6",
          // Apply overflow and flex-grow only when maximized
          isMaximized ? "overflow-y-auto flex-grow" : "",
        )}
      >
        {/* Degrees Section (Featured Cards) */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">University Degrees</h2>
          <div className="space-y-6">
            {/* Render EducationCardClient directly with processed data */}
            {education.map((edu) => (
              <EducationCardClient key={edu.id} education={edu} />
            ))}
          </div>
        </div>

        {/* Interactive Table for Courses and Certifications */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Courses & Certifications</h2>

          {/* Search and Filter Controls */}
          <div className="mb-6 flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search courses and certifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                           text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as "all" | "course" | "certification")}
              className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                         text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filter by type"
            >
              <option value="all">All Types</option>
              <option value="course">Courses</option>
              <option value="certification">Certifications</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 mb-8">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    <button
                      type="button"
                      className="flex items-center hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus:text-gray-700 dark:focus:text-gray-200"
                      onClick={() => toggleSort("name")}
                      aria-label="Sort by name"
                    >
                      Name
                      <SortIndicator field="name" sortField={sortField} sortDirection={sortDirection} />
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    <button
                      type="button"
                      className="flex items-center hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus:text-gray-700 dark:focus:text-gray-200"
                      onClick={() => toggleSort("institution")}
                      aria-label="Sort by institution or issuer"
                    >
                      Institution
                      <SortIndicator field="institution" sortField={sortField} sortDirection={sortDirection} />
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    <button
                      type="button"
                      className="flex items-center hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus:text-gray-700 dark:focus:text-gray-200"
                      onClick={() => toggleSort("year")}
                      aria-label="Sort by year"
                    >
                      Year
                      <SortIndicator field="year" sortField={sortField} sortDirection={sortDirection} />
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Type
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-800">
                {filteredTableData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      No results found. Try adjusting your search or filters.
                    </td>
                  </tr>
                ) : (
                  filteredTableData.map((item) => {
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {item.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          <div className="flex items-center">
                            {item.logoData?.url && (
                              <Image
                                src={item.logoData.url}
                                alt={`${item.institution} logo`}
                                width={24}
                                height={24}
                                className="h-6 w-6 mr-2 object-contain rounded-md"
                              />
                            )}
                            {item.institution}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {item.year || "—"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          <span
                            className={cn(
                              "px-2 inline-flex text-xs leading-5 font-semibold rounded-full",
                              item.type === "certification"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                            )}
                          >
                            {item.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : ""}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {item.website && (
                            <a
                              href={item.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              View
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
