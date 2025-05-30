import EventEmitter from 'events';

export type Job = () => Promise<void>;

export class AsyncJobQueue extends EventEmitter {
  private queue: Job[] = [];
  private processing = false;

  add(job: Job): void {
    this.queue.push(job);
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
}

export const BookmarkRefreshQueue = new AsyncJobQueue();
