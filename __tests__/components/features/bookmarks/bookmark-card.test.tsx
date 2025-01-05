import { render, screen } from '@testing-library/react';
import { BookmarkCardClient } from '../../../../components/features/bookmarks/bookmark-card.client';

describe('BookmarkCardClient', () => {
  const mockBookmark = {
    id: '1',
    url: 'https://example.com',
    title: 'Example Title',
    description: 'Example description text',
    tags: ['tag1', 'tag2'],
    dateBookmarked: '2024-03-20T08:00:00Z',
    datePublished: '2024-03-19T00:00:00Z'
  };

  it('renders bookmark details correctly', () => {
    render(<BookmarkCardClient {...mockBookmark} />);

    // Check title
    expect(screen.getByText('Example Title')).toBeInTheDocument();

    // Check description
    expect(screen.getByText('Example description text')).toBeInTheDocument();

    // Check tags
    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();

    // Check dates (using partial matches due to timezone differences)
    expect(screen.getByText(/Published/)).toBeInTheDocument();
    expect(screen.getByText(/March \d{1,2}, 2024/)).toBeInTheDocument();
    expect(screen.getByText(/Bookmarked/)).toBeInTheDocument();
  });

  it('renders without publish date when not provided', () => {
    const bookmarkWithoutPublishDate = {
      ...mockBookmark,
      datePublished: undefined
    };

    render(<BookmarkCardClient {...bookmarkWithoutPublishDate} />);

    // Should not show published date
    expect(screen.queryByText(/Published/)).not.toBeInTheDocument();
    // Should still show bookmarked date
    expect(screen.getByText(/Bookmarked/)).toBeInTheDocument();
    expect(screen.getByText(/March \d{1,2}, 2024/)).toBeInTheDocument();
  });

  it('renders all tags', () => {
    const bookmarkWithManyTags = {
      ...mockBookmark,
      tags: ['JavaScript', 'React', 'TypeScript', 'NextJS']
    };

    render(<BookmarkCardClient {...bookmarkWithManyTags} />);

    bookmarkWithManyTags.tags.forEach(tag => {
      expect(screen.getByText(tag)).toBeInTheDocument();
    });
  });

  it('uses logo fetching system correctly', () => {
    render(<BookmarkCardClient {...mockBookmark} />);

    const logoImage = screen.getByRole('img');
    // Next.js Image component transforms the URL, so we check for the encoded URL
    expect(logoImage).toHaveAttribute('src', expect.stringContaining(encodeURIComponent('/api/logo?website=')));
  });
});
