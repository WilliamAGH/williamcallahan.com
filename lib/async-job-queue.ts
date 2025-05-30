import EventEmitter from 'events';

export type Job = () => Promise<void>;

export class AsyncJobQueue extends EventEmitter {
  private queue: Job[] = [];
  private processing = false;
  private readonly maxQueueSize: number;

  constructor(maxQueueSize: number = 100) {
    super();
    this.maxQueueSize = maxQueueSize;
  }

  add(job: Job): void {
    if (this.queue.length >= this.maxQueueSize) {
      // Option 1: Throw an error
      // throw new Error('Queue is full. Cannot add more jobs.');

      // Option 2: Log a warning and drop the job
      console.warn(`[AsyncJobQueue] Queue is full (max size: ${this.maxQueueSize}). Dropping new job.`);
      return;

      // Option 3: Implement a more sophisticated backpressure mechanism if needed
    }
    this.queue.push(job);
    this.emit('jobAdded', job);
    void this.process();
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    const job = this.queue.shift();
    if (!job) return;
    this.processing = true;
    this.emit('job:start');
    try {
      await job();
      this.emit('job:complete');
    } catch (error) {
      this.emit('job:error', error);
    } finally {
      this.processing = false;
      setImmediate(() => { void this.process(); });
    }
  }

  public get isProcessing(): boolean {
    return this.processing;
  }

  public get queueLength(): number {
    return this.queue.length;
  }
}

export const createJobQueue = () => new AsyncJobQueue();
export const BookmarkRefreshQueue = new AsyncJobQueue();
