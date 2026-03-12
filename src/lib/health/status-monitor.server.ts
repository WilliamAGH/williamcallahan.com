/**
 * System Information Provider
 *
 * Gathers and returns detailed system metrics using the `systeminformation`
 * library. This module provides the data source for health and status APIs.
 *
 * @module lib/health/status-monitor.server
 */

import si from "systeminformation";
import { getMonotonicTime } from "@/lib/utils";

/**
 * Fetches a consolidated object of system metrics.
 * @returns {Promise<object>} A promise that resolves to an object containing system metrics.
 */
export async function getSystemMetrics() {
  const [mem, cpu, net] = await Promise.all([si.mem(), si.currentLoad(), si.networkStats()]);

  return {
    mem,
    cpu,
    net,
    ts: getMonotonicTime(),
  };
}
