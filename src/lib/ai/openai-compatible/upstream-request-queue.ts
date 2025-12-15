import "server-only";

import crypto from "node:crypto";
import type { AiUpstreamQueuePosition, AiUpstreamQueueSnapshot } from "@/types/ai-openai-compatible";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function coerceMaxParallel(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(20, Math.trunc(value)));
}

export class UpstreamRequestQueue {
  private maxParallel: number;
  private running = 0;
  private readonly pendingByPriority = new Map<
    number,
    Array<{
      id: string;
      priority: number;
      signal: AbortSignal;
      started: ReturnType<typeof createDeferred<void>>;
      result: ReturnType<typeof createDeferred<string>>;
      run: () => Promise<string>;
    }>
  >();
  private readonly prioritiesDesc: number[] = [];
  private draining = false;

  public constructor(options: { key: string; maxParallel: number }) {
    this.maxParallel = coerceMaxParallel(options.maxParallel);
  }

  public get snapshot(): AiUpstreamQueueSnapshot {
    return {
      running: this.running,
      pending: this.pendingCount,
      maxParallel: this.maxParallel,
    };
  }

  private get pendingCount(): number {
    let total = 0;
    for (const tasks of this.pendingByPriority.values()) total += tasks.length;
    return total;
  }

  public setMaxParallel(requestedMaxParallel: number): void {
    const next = coerceMaxParallel(requestedMaxParallel);
    if (next === this.maxParallel) return;
    this.maxParallel = next;
    this.drain();
  }

  public getPosition(taskId: string): AiUpstreamQueuePosition {
    let offset = 0;

    for (const priority of this.prioritiesDesc) {
      const tasks = this.pendingByPriority.get(priority);
      if (!tasks || tasks.length === 0) continue;
      const index = tasks.findIndex(task => task.id === taskId);
      if (index !== -1) {
        return {
          ...this.snapshot,
          inQueue: true,
          position: offset + index + 1,
        };
      }
      offset += tasks.length;
    }

    return {
      ...this.snapshot,
      inQueue: false,
      position: null,
    };
  }

  public enqueue(args: { priority?: number; signal: AbortSignal; run: () => Promise<string> }): {
    id: string;
    started: Promise<void>;
    result: Promise<string>;
  } {
    if (args.signal.aborted) {
      return {
        id: crypto.randomUUID(),
        started: Promise.reject(new DOMException("Request aborted", "AbortError")),
        result: Promise.reject(new DOMException("Request aborted", "AbortError")),
      };
    }

    const id = crypto.randomUUID();
    const started = createDeferred<void>();
    const result = createDeferred<string>();

    const priority = Number.isFinite(args.priority) ? Math.trunc(args.priority ?? 0) : 0;

    const task = {
      id,
      priority,
      signal: args.signal,
      started,
      result,
      run: args.run,
    };

    const abortHandler = () => {
      const removed = this.removePendingTask(id);
      if (removed) {
        const abortError = new DOMException("Request aborted", "AbortError");
        started.reject(abortError);
        result.reject(abortError);
      }
    };

    args.signal.addEventListener("abort", abortHandler, { once: true });

    this.pushPendingTask(task);
    this.drain();

    return { id, started: started.promise, result: result.promise };
  }

  private pushPendingTask(task: {
    id: string;
    priority: number;
    signal: AbortSignal;
    started: ReturnType<typeof createDeferred<void>>;
    result: ReturnType<typeof createDeferred<string>>;
    run: () => Promise<string>;
  }): void {
    const existing = this.pendingByPriority.get(task.priority);
    if (existing) {
      existing.push(task);
      return;
    }

    this.pendingByPriority.set(task.priority, [task]);
    this.prioritiesDesc.push(task.priority);
    this.prioritiesDesc.sort((a, b) => b - a);
  }

  private removePendingTask(taskId: string): boolean {
    let removed = false;

    for (const priority of this.prioritiesDesc) {
      const tasks = this.pendingByPriority.get(priority);
      if (!tasks || tasks.length === 0) continue;
      const next = tasks.filter(task => task.id !== taskId);
      if (next.length !== tasks.length) {
        removed = true;
        if (next.length === 0) {
          this.pendingByPriority.delete(priority);
        } else {
          this.pendingByPriority.set(priority, next);
        }
        break;
      }
    }

    if (removed) {
      for (let i = this.prioritiesDesc.length - 1; i >= 0; i -= 1) {
        const priority = this.prioritiesDesc[i];
        if (priority === undefined) continue;
        const tasks = this.pendingByPriority.get(priority);
        if (!tasks || tasks.length === 0) {
          this.prioritiesDesc.splice(i, 1);
        }
      }
    }

    return removed;
  }

  private shiftNextTask(): {
    id: string;
    priority: number;
    signal: AbortSignal;
    started: ReturnType<typeof createDeferred<void>>;
    result: ReturnType<typeof createDeferred<string>>;
    run: () => Promise<string>;
  } | null {
    for (const priority of this.prioritiesDesc) {
      const tasks = this.pendingByPriority.get(priority);
      if (!tasks || tasks.length === 0) continue;

      const next = tasks.shift();
      if (!next) continue;

      if (tasks.length === 0) {
        this.pendingByPriority.delete(priority);
        const idx = this.prioritiesDesc.indexOf(priority);
        if (idx !== -1) this.prioritiesDesc.splice(idx, 1);
      }

      return next;
    }

    return null;
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.running < this.maxParallel) {
        const task = this.shiftNextTask();
        if (!task) return;

        if (task.signal.aborted) {
          const abortError = new DOMException("Request aborted", "AbortError");
          task.started.reject(abortError);
          task.result.reject(abortError);
          continue;
        }

        this.running += 1;
        task.started.resolve();

        void task
          .run()
          .then(value => {
            task.result.resolve(value);
          })
          .catch(error => {
            task.result.reject(error);
          })
          .finally(() => {
            this.running -= 1;
            this.drain();
          });
      }
    } finally {
      this.draining = false;
    }
  }
}

const queues = new Map<string, UpstreamRequestQueue>();

export function getUpstreamRequestQueue(args: { key: string; maxParallel: number }): UpstreamRequestQueue {
  const existing = queues.get(args.key);
  if (existing) {
    existing.setMaxParallel(args.maxParallel);
    return existing;
  }

  const created = new UpstreamRequestQueue({ key: args.key, maxParallel: args.maxParallel });
  queues.set(args.key, created);
  return created;
}
