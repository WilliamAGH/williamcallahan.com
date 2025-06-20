import { ServerCacheInstance } from "@/lib/server-cache";
import { ImageMemoryManagerInstance } from "@/lib/image-memory-manager";

if (process.env.NEXT_RUNTIME === "nodejs") {
  const intervalId = setInterval(() => {
    const rss = process.memoryUsage().rss;

    // Use a proper total process memory budget instead of just image cache budget
    // Default to 1GB total process memory budget for containers
    const totalProcessBudget = Number(process.env.TOTAL_PROCESS_MEMORY_BUDGET_BYTES ?? 1024 * 1024 * 1024); // 1GB default

    // Progressive thresholds based on total process memory
    const warningThreshold = totalProcessBudget * 0.7; // 70% - Start monitoring closely
    const imageWarningThreshold = totalProcessBudget * 0.8; // 80% - Start rejecting new image operations
    const criticalThreshold = totalProcessBudget * 0.9; // 90% - Aggressive cleanup
    const emergencyThreshold = totalProcessBudget * 0.95; // 95% - Emergency flush

    if (rss > emergencyThreshold) {
      console.error(
        `[MemGuard] EMERGENCY: RSS ${Math.round(rss / 1024 / 1024)}MB exceeds 95% of ${Math.round(totalProcessBudget / 1024 / 1024)}MB budget, flushing all caches`,
      );
      ServerCacheInstance.flushAll();
      ImageMemoryManagerInstance.clear();
    } else if (rss > criticalThreshold) {
      console.warn(
        `[MemGuard] CRITICAL: RSS ${Math.round(rss / 1024 / 1024)}MB exceeds 90% of ${Math.round(totalProcessBudget / 1024 / 1024)}MB budget, clearing image cache`,
      );
      ImageMemoryManagerInstance.clear();
      // Keep ServerCache as it's lighter weight
    } else if (rss > imageWarningThreshold) {
      console.warn(
        `[MemGuard] WARNING: RSS ${Math.round(rss / 1024 / 1024)}MB exceeds 80% of ${Math.round(totalProcessBudget / 1024 / 1024)}MB budget, enabling memory pressure mode`,
      );
      // This will cause ImageMemoryManager to reject new entries
      ImageMemoryManagerInstance.setMemoryPressure(true);
    } else if (rss > warningThreshold) {
      console.log(
        `[MemGuard] MONITOR: RSS ${Math.round(rss / 1024 / 1024)}MB exceeds 70% of ${Math.round(totalProcessBudget / 1024 / 1024)}MB budget, monitoring closely`,
      );
      // Just log for awareness, no action needed yet
    } else if (rss < warningThreshold * 0.9) {
      // Clear pressure mode when memory drops below 63% (90% of warning threshold)
      ImageMemoryManagerInstance.setMemoryPressure(false);
    }
  }, 30_000); // Check every 30 seconds instead of 60 for faster response

  // Allow process to exit even with interval running
  intervalId.unref();
}
