/**
 * Expandable Blog Tags Component
 *
 * Displays a list of tags with a "see more" button when tags overflow.
 * Can be used in both article and card views.
 */

"use client";

import { kebabCase } from "@/lib/utils/formatters";
import { Tag, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";

import type { BlogTagsPropsExtended, TagWrapperProps } from "@/types/features";

function TagWrapper({ children, className, href }: TagWrapperProps) {
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return <span className={className}>{children}</span>;
}

export function BlogTagsExpandable({ tags, interactive = false }: BlogTagsPropsExtended) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [visibleTags, setVisibleTags] = useState<string[]>(tags);
  const [hiddenCount, setHiddenCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const testRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calculateVisibleTags = () => {
      if (!testRef.current || !containerRef.current) return;

      // Reset to test with all tags
      testRef.current.innerHTML = '';
      
      // Create test elements for all tags plus the "see more" button
      const testContainer = document.createElement('div');
      testContainer.className = 'flex flex-wrap gap-2';
      testContainer.style.position = 'absolute';
      testContainer.style.visibility = 'hidden';
      testContainer.style.width = containerRef.current.offsetWidth + 'px';
      
      // Add all tag elements to test container
      tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'inline-flex items-center px-3 py-1 rounded-full text-sm';
        tagEl.textContent = tag;
        testContainer.appendChild(tagEl);
      });
      
      // Add "see more" button to test
      const buttonEl = document.createElement('span');
      buttonEl.className = 'inline-flex items-center px-3 py-1 rounded-full text-sm';
      buttonEl.textContent = 'See more';
      
      testRef.current.appendChild(testContainer);
      
      // Check if all tags fit in ~2 lines (80px)
      if (testContainer.offsetHeight <= 80) {
        setVisibleTags(tags);
        setHiddenCount(0);
      } else {
        // Binary search to find how many tags fit with the button
        let low = 0;
        let high = tags.length - 1;
        let bestFit = 0;
        
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          testContainer.innerHTML = '';
          
          // Add tags up to mid
          for (let i = 0; i <= mid; i++) {
            const tagEl = document.createElement('span');
            tagEl.className = 'inline-flex items-center px-3 py-1 rounded-full text-sm';
            tagEl.textContent = tags[i] ?? null;
            testContainer.appendChild(tagEl);
          }
          
          // Add the button
          testContainer.appendChild(buttonEl.cloneNode(true));
          
          if (testContainer.offsetHeight <= 80) {
            bestFit = mid;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        
        setVisibleTags(tags.slice(0, bestFit + 1));
        setHiddenCount(tags.length - bestFit - 1);
      }
      
      // Clean up test container
      testRef.current.innerHTML = '';
    };

    calculateVisibleTags();
    
    // Recalculate on window resize
    if (typeof window !== "undefined") {
      const handleResize = () => {
        calculateVisibleTags();
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [tags]);

  const baseTagClass = `
    inline-flex items-center px-3 py-1 rounded-full text-sm
    bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300
    transition-colors
  `;

  const interactiveClass = interactive 
    ? "hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer" 
    : "";

  const displayTags = isExpanded ? tags : visibleTags;

  return (
    <div className="mb-4" ref={containerRef}>
      <div ref={testRef} style={{ position: 'absolute', visibility: 'hidden' }} />
      <div className="flex flex-wrap gap-2">
        {displayTags.map((tag) => (
          <TagWrapper
            key={tag}
            href={interactive ? `/blog/tags/${kebabCase(tag)}` : undefined}
            className={`${baseTagClass} ${interactiveClass}`}
          >
            <Tag className="w-3 h-3 mr-1" />
            {tag}
          </TagWrapper>
        ))}
        
        {/* Inline See More/Less Button */}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className={`
              inline-flex items-center px-3 py-1 rounded-full text-sm
              bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300
              hover:bg-blue-200 dark:hover:bg-blue-900/50 cursor-pointer
              transition-colors
            `}
            aria-label={isExpanded ? "Show less tags" : "Show more tags"}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3 mr-1" />
                See less
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 mr-1" />
                +{hiddenCount} more
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
