/**
 * A simple in-memory lock to prevent "stampeding herd" problems for expensive, concurrent requests.
 */
const locks = new Map<string, Promise<any>>();

export const requestLock = {
  /**
   * Executes a function with a lock. If another request for the same key is already in progress,
   * it waits for that request to complete and returns its result.
   *
   * @param key A unique key for the operation to be locked.
   * @param work The expensive function to execute.
   * @returns The result of the work function.
   */
  async run<T>({ key, work }: { key: string; work: () => Promise<T> }): Promise<T> {
    // Check if a request for this key is already in progress.
    const existingPromise = locks.get(key);
    if (existingPromise) {
      // Wait for the existing request to finish.
      return existingPromise;
    }

    // No existing request, so start a new one.
    const newPromise = work();

    // Store the promise in the lock map.
    locks.set(key, newPromise);

    try {
      // Wait for the work to complete.
      return await newPromise;
    } finally {
      // Once the work is done (successfully or not), remove the lock.
      locks.delete(key);
    }
  },
};
