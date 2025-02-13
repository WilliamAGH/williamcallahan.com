/**
 * Analytics Queue System
 * @module lib/analytics/queue
 * @description
 * Handles queuing and processing of analytics events when tracking scripts
 * are not yet loaded. Events are stored in sessionStorage and processed
 * when scripts become available.
 *
 * This module provides a reliable way to handle analytics events that occur
 * before tracking scripts are fully loaded. Events are stored in sessionStorage
 * and processed once the scripts become available, ensuring no pageviews or
 * events are lost during script initialization.
 *
 * Related modules:
 * @see {@link "components/analytics/Analytics"} - Main analytics component
 * @see {@link "types/analytics"} - Analytics type definitions
 * @see {@link "public/scripts/plausible-init.js"} - Plausible initialization
 *
 * Features:
 * - Persistent queue using sessionStorage
 * - Deduplication of similar events
 * - Exponential backoff retry mechanism
 * - Debug logging for queue operations
 * - Session-based event grouping
 */

import { BaseAnalyticsEvent } from '@/types/analytics';

const QUEUE_STORAGE_KEY = 'analytics_event_queue';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

interface QueuedEvent {
  type: 'pageview';
  path: string;
  data: BaseAnalyticsEvent;
  timestamp: number;
  retryCount: number;
  sessionId: string;
  provider: 'plausible' | 'umami';
}

/**
 * Generates a unique session ID
 */
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Gets the current analytics queue from sessionStorage
 */
function getQueue(): QueuedEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = sessionStorage.getItem(QUEUE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('[Analytics Queue] Error reading queue:', error);
    return [];
  }
}

/**
 * Saves the analytics queue to sessionStorage
 */
function saveQueue(queue: QueuedEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('[Analytics Queue] Error saving queue:', error);
  }
}

/**
 * Adds an event to the queue
 */
export function queueEvent(
  type: 'pageview',
  path: string,
  data: BaseAnalyticsEvent,
  provider: 'plausible' | 'umami'
): void {
  const queue = getQueue();
  const event: QueuedEvent = {
    type,
    path,
    data,
    timestamp: Date.now(),
    retryCount: 0,
    sessionId: generateSessionId(),
    provider
  };

  // Deduplicate similar events within 1 second
  const recentDuplicate = queue.find(
    e => e.type === type &&
    e.path === path &&
    e.provider === provider &&
    Math.abs(e.timestamp - event.timestamp) < 1000
  );

  if (!recentDuplicate) {
    queue.push(event);
    saveQueue(queue);
    console.debug(`[Analytics Queue] Added ${provider} event for path: ${path}`);
  }
}

/**
 * Processes queued events for a specific provider
 */
export async function processQueue(
  provider: 'plausible' | 'umami',
  processor: (event: QueuedEvent) => Promise<boolean>
): Promise<void> {
  const queue = getQueue();
  const providerQueue = queue.filter(e => e.provider === provider);
  if (providerQueue.length === 0) return;

  console.debug(`[Analytics Queue] Processing ${providerQueue.length} ${provider} events`);

  const remainingEvents: QueuedEvent[] = [];
  const processedEvents: QueuedEvent[] = [];

  for (const event of providerQueue) {
    try {
      const success = await processor(event);
      if (success) {
        processedEvents.push(event);
        console.debug(`[Analytics Queue] Successfully processed ${provider} event for path: ${event.path}`);
      } else if (event.retryCount < MAX_RETRY_ATTEMPTS) {
        event.retryCount++;
        remainingEvents.push(event);
        console.debug(`[Analytics Queue] Will retry ${provider} event for path: ${event.path} (attempt ${event.retryCount})`);
        // Add delay between retries
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * event.retryCount));
      } else {
        console.error(`[Analytics Queue] Failed to process ${provider} event after ${MAX_RETRY_ATTEMPTS} attempts:`, event);
      }
    } catch (error) {
      console.error(`[Analytics Queue] Error processing ${provider} event:`, error);
      if (event.retryCount < MAX_RETRY_ATTEMPTS) {
        event.retryCount++;
        remainingEvents.push(event);
      }
    }
  }

  // Update queue with remaining events
  const updatedQueue = queue
    .filter(e => e.provider !== provider)
    .concat(remainingEvents);

  saveQueue(updatedQueue);
}

/**
 * Clears all queued events for a specific provider
 */
export function clearQueue(provider: 'plausible' | 'umami'): void {
  const queue = getQueue();
  const updatedQueue = queue.filter(e => e.provider !== provider);
  saveQueue(updatedQueue);
}
