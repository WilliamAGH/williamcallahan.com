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
    
    tabGroups.forEach((group) => {
      const buttons = group.querySelectorAll('.mdx-tab-button');
      
      buttons.forEach((button) => {
        button.addEventListener('click', (e) => {
          const target = e.currentTarget as HTMLElement;
          const tabId = target.getAttribute('data-tab');
          if (!tabId) return;
          
          // Update active tab on the group
          group.setAttribute('data-active-tab', tabId);
          
          // Update active state on buttons
          buttons.forEach((btn) => {
            const isActive = btn.getAttribute('data-tab') === tabId;
            btn.setAttribute('data-active', isActive.toString());
          });
        });
      });
    });
    
    // Cleanup
    return () => {
      tabGroups.forEach((group) => {
        const buttons = group.querySelectorAll('.mdx-tab-button');
        buttons.forEach((button) => {
          const clone = button.cloneNode(true);
          button.parentNode?.replaceChild(clone, button);
        });
      });
    };
  }, []);
  
  return null;
}