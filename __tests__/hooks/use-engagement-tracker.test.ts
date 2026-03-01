import { act, renderHook } from "@testing-library/react";

import { useEngagementTracker } from "@/hooks/use-engagement-tracker";
import { engagementBatchSchema } from "@/types/schemas/engagement";

function parseBeaconPayload(rawPayload: unknown) {
  const parsedPayload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  return engagementBatchSchema.parse(parsedPayload);
}

describe("useEngagementTracker", () => {
  const sendBeaconMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    Object.defineProperty(window.navigator, "doNotTrack", {
      configurable: true,
      value: "0",
    });

    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconMock,
    });

    sendBeaconMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables tracking when doNotTrack is enabled", () => {
    Object.defineProperty(window.navigator, "doNotTrack", {
      configurable: true,
      value: "1",
    });

    const { result } = renderHook(() => useEngagementTracker());

    act(() => {
      result.current.trackImpression("bookmark", "abc");
      result.current.trackExternalClick("bookmark", "abc");
      const cleanup = result.current.trackDwell("bookmark", "abc");
      cleanup();
    });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(sendBeaconMock).not.toHaveBeenCalled();
  });

  it("batches impression events and flushes on interval", () => {
    const { result } = renderHook(() => useEngagementTracker());

    act(() => {
      result.current.trackImpression("bookmark", "one");
      result.current.trackImpression("bookmark", "two");
    });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    expect(sendBeaconMock).toHaveBeenCalledWith(
      "/api/engagement",
      expect.stringContaining('"eventType":"impression"'),
    );

    const payload = parseBeaconPayload(sendBeaconMock.mock.calls[0]?.[1]);

    expect(payload.events).toHaveLength(2);
    expect(payload.events.map((event) => event.contentId)).toEqual(["one", "two"]);
  });

  it("tracks dwell duration using elapsed time", () => {
    const nowSpy = vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(1_850);

    const { result } = renderHook(() => useEngagementTracker());

    act(() => {
      const cleanup = result.current.trackDwell("bookmark", "entry-1");
      cleanup();
    });

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    const payload = parseBeaconPayload(sendBeaconMock.mock.calls[0]?.[1]);

    expect(payload.events[0]?.eventType).toBe("dwell");
    expect(payload.events[0]?.durationMs).toBe(1_750);

    nowSpy.mockRestore();
  });
});
