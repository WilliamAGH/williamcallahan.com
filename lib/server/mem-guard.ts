import { ServerCacheInstance } from "@/lib/server-cache";
import { ImageMemoryManagerInstance } from "@/lib/image-memory-manager";

if (process.env.NEXT_RUNTIME === "nodejs") {
  const intervalId = setInterval(() => {
    const rss = process.memoryUsage().rss;
    const budget = Number(process.env.IMAGE_RAM_BUDGET_BYTES ?? 512 * 1024 * 1024);
    
    // Progressive thresholds for early intervention
    const warningThreshold = budget * 0.8;  // 80% - Start rejecting new large operations
    const criticalThreshold = budget * 1.0; // 100% - Aggressive cleanup
    const emergencyThreshold = budget * 1.2; // 120% - Emergency flush
    
    if (rss > emergencyThreshold) {
      console.error("[MemGuard] EMERGENCY: RSS exceeds 120% budget, flushing all caches");
      ServerCacheInstance.flushAll();
      ImageMemoryManagerInstance.clear();
    } else if (rss > criticalThreshold) {
      console.warn("[MemGuard] CRITICAL: RSS exceeds 100% budget, clearing image cache");
      ImageMemoryManagerInstance.clear();
      // Keep ServerCache as it's lighter weight
    } else if (rss > warningThreshold) {
      console.warn("[MemGuard] WARNING: RSS exceeds 80% budget, enabling memory pressure mode");
      // This will cause ImageMemoryManager to reject new entries
      ImageMemoryManagerInstance.setMemoryPressure(true);
    } else if (rss < warningThreshold * 0.9) {
      // Clear pressure mode when memory drops below 72% (90% of warning threshold)
      ImageMemoryManagerInstance.setMemoryPressure(false);
    }
  }, 30_000); // Check every 30 seconds instead of 60 for faster response

  // Allow process to exit even with interval running
  intervalId.unref();
}
