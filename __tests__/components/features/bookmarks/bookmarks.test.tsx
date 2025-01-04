import { render, screen, fireEvent } from '@testing-library/react';
import { BookmarksClient } from '../../../../components/features/bookmarks/bookmarks.client';

describe('BookmarksClient', () => {
  const mockBookmarks = [
    {
      id: '1',
      url: 'https://example1.com',
      title: 'Example 1',
      description: 'First example description',
      tags: ['tag1'],
      dateBookmarked: '2024-03-20T08:00:00Z',
      preview: <div key="1">Example 1 Preview</div>
    },
    {
      id: '2',
      url: 'https://example2.com',
      title: 'Example 2',
      description: 'Second example description',
      tags: ['tag2'],
      dateBookmarked: '2024-02-15T10:00:00Z',
      preview: <div key="2">Example 2 Preview</div>
    },
    {
      id: '3',
      url: 'https://example3.com',
      title: 'Example 3',
      description: 'Third example description',
      tags: ['tag3'],
      dateBookmarked: '2024-01-05T09:15:00Z',
      preview: <div key="3">Example 3 Preview</div>
    }
  ];

  it('renders empty state when no bookmarks provided', () => {
    render(<BookmarksClient bookmarks={[]} />);
    expect(screen.getByText('No bookmarks to display')).toBeInTheDocument();
  });

  it('renders all bookmarks grouped by month', () => {
    render(<BookmarksClient bookmarks={mockBookmarks} />);

    // Check month headers
    expect(screen.getByText('March 2024')).toBeInTheDocument();
    expect(screen.getByText('February 2024')).toBeInTheDocument();
    expect(screen.getByText('January 2024')).toBeInTheDocument();

    // Check bookmark previews
    mockBookmarks.forEach(bookmark => {
      expect(screen.getByText(`${bookmark.title} Preview`)).toBeInTheDocument();
    });
  });

  it('expands and collapses month groups', () => {
    render(<BookmarksClient bookmarks={mockBookmarks} />);

    // All groups should be expanded by default
    mockBookmarks.forEach(bookmark => {
      expect(screen.getByText(`${bookmark.title} Preview`)).toBeVisible();
    });

    // Click to collapse March group
    fireEvent.click(screen.getByText('March 2024'));

    // March bookmarks should be hidden
    expect(screen.getByText('Example 1 Preview')).not.toBeVisible();
    // Other months should still be visible
    expect(screen.getByText('Example 2 Preview')).toBeVisible();
    expect(screen.getByText('Example 3 Preview')).toBeVisible();
  });

  it('renders introduction text', () => {
    render(<BookmarksClient bookmarks={mockBookmarks} />);

    expect(screen.getByText(/This is my personal collection of bookmarks/)).toBeInTheDocument();
    expect(screen.getByText(/The bookmarks are added through my Telegram bot/)).toBeInTheDocument();
  });

  it('sorts bookmarks by date in descending order', () => {
    render(<BookmarksClient bookmarks={mockBookmarks} />);

    const bookmarkPreviews = screen.getAllByText(/Example \d Preview/);
    expect(bookmarkPreviews[0]).toHaveTextContent('Example 1 Preview');
    expect(bookmarkPreviews[1]).toHaveTextContent('Example 2 Preview');
    expect(bookmarkPreviews[2]).toHaveTextContent('Example 3 Preview');
  });
});
