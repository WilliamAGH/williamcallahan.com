/**
 * System Information Provider
 *
 * Gathers and returns detailed system metrics using the `systeminformation`
 * library. This module provides the data source for the health metrics API.
 *
 * @module lib/health/status-monitor.server
 */

import si from "systeminformation";
import { getMonotonicTime } from "@/lib/utils";

/**
 * Fetches a consolidated object of system metrics.
 * @returns System metrics for the authenticated health endpoint.
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
