import { render, screen, waitFor } from '@testing-library/react'
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

// Mock next/script
jest.mock('next/script', () => ({
  __esModule: true,
  default: function Script({ id, onLoad, onError }: any) {
    // Simulate script load after a short delay
    setTimeout(() => {
      if (id === 'umami') {
        // Mock Umami initialization
        const umamiMock = jest.fn() as UmamiMock
        umamiMock.track = jest.fn()
        global.umami = umamiMock
        onLoad?.()
      } else if (id === 'plausible') {
        // Mock Plausible initialization
        global.plausible = jest.fn()
      }
    }, 100)
    return null
  }
}))

describe('Analytics', () => {
  const originalEnv = process.env
  const mockWebsiteId = 'test-website-id'
  const mockSiteUrl = 'https://williamcallahan.com'

  beforeEach(() => {
    // Setup environment variables
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: mockWebsiteId,
      NEXT_PUBLIC_SITE_URL: mockSiteUrl
    }

    // Mock pathname
    ;(usePathname as jest.Mock).mockReturnValue('/test-page')

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
  })

  it('initializes analytics scripts correctly', async () => {
    render(<Analytics />)

    // Wait for scripts to "load"
    await waitFor(() => {
      expect(global.umami).toBeDefined()
      expect(global.umami?.track).toHaveBeenCalled() // Wait for the track function itself
      expect(global.plausible).toBeDefined()
    })

    // Verify tracking was called with correct arguments
    expect(global.umami?.track).toHaveBeenCalledWith('pageview', expect.objectContaining({
      path: '/test-page', // Path should be the initial one
      website: mockWebsiteId
    }))
  })

  it('handles blog post paths correctly', async () => {
    // Mock a blog post path
    ;(usePathname as jest.Mock).mockReturnValue('/blog/test-post')

    render(<Analytics />)

    // Wait specifically for the track function to be called
    await waitFor(() => {
      expect(global.umami?.track).toHaveBeenCalled()
    })

    // Verify path was normalized and tracked correctly
    expect(global.umami?.track).toHaveBeenCalledWith('pageview', expect.objectContaining({
      path: '/blog/:slug' // Path should be normalized
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
    const { rerender } = render(<Analytics />)

    // Wait for initial load and track call
    await waitFor(() => {
      expect(global.umami?.track).toHaveBeenCalled()
    })

    // Clear tracking calls AFTER the initial one has happened
    const umamiTrackMock = global.umami?.track as jest.Mock
    umamiTrackMock.mockClear()

    // Simulate route change
    ;(usePathname as jest.Mock).mockReturnValue('/new-page')
    rerender(<Analytics />)

    // Wait for the track function to be called again after rerender/path change
    await waitFor(() => {
      expect(umamiTrackMock).toHaveBeenCalled()
    })

    // Verify new page was tracked
    expect(umamiTrackMock).toHaveBeenCalledWith('pageview', expect.objectContaining({
      path: '/new-page' // Path should be the new one
    }))
  })

  it('handles script load errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error')

    // Mock Script to simulate error
    jest.requireMock('next/script').default = function Script({ id, onError }: any) {
      setTimeout(() => {
        onError?.(new Error('Failed to load script'))
      }, 100)
      return null
    }

    render(<Analytics />)

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Analytics Error] Failed to load Umami script:',
        expect.any(Error)
      )
    })
  })
})
