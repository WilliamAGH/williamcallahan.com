/**
 * Simple Tabs Enhancement for MDX
 * 
 * This component progressively enhances tab functionality for MDX content.
 * It works with plain HTML structure that MDX can understand, then adds
 * interactivity on the client side.
 */

'use client';

import { useEffect } from 'react';
import './simple-tabs.css';

export function SimpleTabsEnhancer() {
  useEffect(() => {
    // Find all tab groups on the page
    const tabGroups = document.querySelectorAll('.mdx-tab-group');
    
    for (const group of tabGroups) {
      const buttons = group.querySelectorAll('.mdx-tab-button');
      
      for (const button of buttons) {
        button.addEventListener('click', (e: Event) => {
          if (!(e.currentTarget instanceof HTMLElement)) return;
          
          const tabId = e.currentTarget.getAttribute('data-tab');
          if (!tabId) return;
          
          // Update active tab on the group
          group.setAttribute('data-active-tab', tabId);
          
          // Update active state on buttons
          for (const btn of buttons) {
            const isActive = btn.getAttribute('data-tab') === tabId;
            btn.setAttribute('data-active', isActive.toString());
          }
        });
      }
    }
    
    // Cleanup
    return () => {
      for (const group of tabGroups) {
        const buttons = group.querySelectorAll('.mdx-tab-button');
        for (const button of buttons) {
          const clone = button.cloneNode(true);
          button.parentNode?.replaceChild(clone, button);
        }
      }
    };
  }, []);
  
  return null;
}
