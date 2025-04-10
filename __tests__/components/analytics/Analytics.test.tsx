import { render, screen, waitFor, act } from '@testing-library/react'
import { Analytics } from '@/components/analytics/analytics.client'
import { usePathname } from 'next/navigation'

type UmamiMock = {
  track: jest.Mock
} & jest.Mock

type PlausibleMock = jest.Mock

// Override the window object for tests
declare global {
  // eslint-disable-next-line no-var
  var umami: UmamiMock | undefined
  // eslint-disable-next-line no-var
  var plausible: PlausibleMock | undefined
}

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn()
}))

// Keep track of loaded scripts in the mock scope
const loadedScripts: Record<string, boolean> = {};

// Mock next/script
jest.mock('next/script', () => ({
  __esModule: true,
  // Function to reset loaded state for each test
  __resetMockState: () => {
    loadedScripts.umami = false;
    loadedScripts.plausible = false;
  },
  default: function Script({ id, onLoad, onError }: any) {
    // Only set timeout and call onLoad if not already loaded for this id
    if (!loadedScripts[id]) {
      setTimeout(() => {
        if (id === 'umami') {
          // Mock Umami initialization
        const umamiMock = jest.fn() as UmamiMock
        umamiMock.track = jest.fn()
          global.umami = umamiMock
          loadedScripts[id] = true; // Mark as loaded
          onLoad?.()
        } else if (id === 'plausible') {
          // Mock Plausible initialization
          global.plausible = jest.fn()
          loadedScripts[id] = true; // Mark as loaded
          onLoad?.()
        }
      }, 10) // Reduce timeout for faster tests
    }
    return null
  }
}))

describe('Analytics', () => {
  const originalEnv = process.env
  const mockWebsiteId = 'test-website-id'
  const mockSiteUrl = 'https://williamcallahan.com'

  beforeEach(() => {
    jest.useFakeTimers()

    // Setup environment variables
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: mockWebsiteId,
      NEXT_PUBLIC_SITE_URL: mockSiteUrl
    }

    // Mock pathname
    ;(usePathname as jest.Mock).mockReturnValue('/test-page')

    // Reset the mock script loaded state
    jest.requireMock('next/script').__resetMockState();

    // Reset window objects between tests
    global.umami = undefined
    global.plausible = undefined

    // Clear console mocks
    jest.spyOn(console, 'debug').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  it('initializes analytics scripts correctly', async () => {
    render(<Analytics />)

    // Advance timers to trigger script load
    await act(async () => {
      jest.advanceTimersByTime(20)
    })

    // Wait for scripts to "load"
    await waitFor(() => {
      expect(global.umami).toBeDefined()
      expect(global.umami?.track).toHaveBeenCalled()
      expect(global.plausible).toBeDefined()
    })

    // Verify tracking was called with correct arguments
    expect(global.umami?.track).toHaveBeenCalledWith('pageview', expect.objectContaining({
      path: '/test-page',
      website: mockWebsiteId
    }))
  })

  it('handles blog post paths correctly', async () => {
    // Mock a blog post path
    ;(usePathname as jest.Mock).mockReturnValue('/blog/test-post')

    render(<Analytics />)

    // Advance timers to trigger script load
    await act(async () => {
      jest.advanceTimersByTime(20)
    })

    // Wait specifically for the track function to be called
    await waitFor(() => {
      expect(global.umami?.track).toHaveBeenCalled()
    })

    // Verify path was normalized and tracked correctly
    expect(global.umami?.track).toHaveBeenCalledWith('pageview', expect.objectContaining({
      path: '/blog/:slug'
    }))
  })

  it('does not initialize without required environment variables', () => {
    // Clear environment variables
    process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = ''
    process.env.NEXT_PUBLIC_SITE_URL = ''

    const { container } = render(<Analytics />)
    expect(container.innerHTML).toBe('')
  })

  it('tracks page views on route changes', async () => {
    // Start with initial path
    (usePathname as jest.Mock).mockReturnValue('/initial-path')
    const { rerender } = render(<Analytics />)

    // Advance timers to trigger script load (10ms) AND useEffect timeout (100ms)
    await act(async () => {
      jest.advanceTimersByTime(150) // Ensure all initial effects fire
    })

    // Wait for the initial track calls (could be multiple) to settle
    await waitFor(() => {
      expect(global.umami?.track).toHaveBeenCalled()
    })
    // Verify at least one call was for the initial path
    expect(global.umami?.track).toHaveBeenCalledWith('pageview', expect.objectContaining({
      path: '/initial-path'
    }))

    // Clear the mock for next assertions
    if (global.umami?.track) {
      global.umami.track.mockClear()
    }

    // Change pathname
    (usePathname as jest.Mock).mockReturnValue('/new-path')

    // Re-render the component
    rerender(<Analytics />)

    // Advance timers to allow the timeout in useEffect to trigger
    await act(async () => {
      // Advance timers past the 100ms timeout in the useEffect
      jest.advanceTimersByTime(150) // Give some buffer
    })

    // Wait for the track call triggered by the pathname change
    await waitFor(() => {
      expect(global.umami?.track).toHaveBeenCalledWith('pageview', expect.objectContaining({
        path: '/new-path'
      }))
    })
    // Ensure it was called exactly once after the clear
    expect(global.umami?.track).toHaveBeenCalledTimes(1)
  })

  it('handles script load errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error')

    // Mock Script to simulate error
    jest.requireMock('next/script').default = function Script({ id, onError }: any) {
      setTimeout(() => {
        onError?.(new Error('Failed to load script'))
      }, 10)
      return null
    }

    render(<Analytics />)

    // Advance timers to trigger error
    await act(async () => {
      jest.advanceTimersByTime(20)
    })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Analytics Error] Failed to load Umami script:',
        expect.any(Error)
      )
    })
  })
})
