import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapPlace } from '@/shared';

// ── Mock server action ────────────────────────────────────────────────────────
const { mockGeneratePlaceSummary } = vi.hoisted(() => ({
  mockGeneratePlaceSummary: vi.fn(),
}));

vi.mock('@/app/actions/generate-place-summary', () => ({
  generatePlaceSummary: (...args: unknown[]) => mockGeneratePlaceSummary(...args),
}));

// ── Mock framer-motion (strip animation props from DOM elements) ──────────────
vi.mock('framer-motion', async () => {
  const React = (await import('react')).default;
  type MotionMockProps = React.PropsWithChildren<Record<string, unknown>>;
  const stripMotion = (tag: string) =>
    function MotionMock(props: MotionMockProps) {
      delete props.custom;
      delete props.variants;
      delete props.initial;
      delete props.animate;
      delete props.exit;
      delete props.transition;
      const { children, ...domProps } = props;
      return React.createElement(tag, domProps, children);
    };
  return {
    AnimatePresence: ({ children }: React.PropsWithChildren) => children,
    motion: { img: stripMotion('img'), div: stripMotion('div') },
  };
});

// ── Import after mocks ────────────────────────────────────────────────────────
import { PlaceDetailPanel } from './place-detail-panel';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const BASE_PLACE: MapPlace = {
  id: 'place-1',
  name: 'Fushimi Inari',
  lat: 34.967,
  lng: 135.772,
  category: 'attraction',
  rating: 4.8,
  type: 'tourist_attraction',
  address: '68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto',
  description: null,
  images: [],
  imageUrl: null,
  websiteUrl: null,
  openingHoursText: null,
  reviews: null,
};

const PLACE_WITH_DESC: MapPlace = {
  ...BASE_PLACE,
  id: 'place-desc',
  description: 'A famous Shinto shrine with thousands of torii gates.',
};

const PLACE_WITH_REVIEWS: MapPlace = {
  ...BASE_PLACE,
  id: 'place-reviews',
  reviews: [
    { author: 'Alice', authorPhoto: null, rating: 5, text: 'Absolutely breathtaking!', relativeTime: '1 week ago' },
    { author: 'Bob', authorPhoto: 'https://example.com/bob.jpg', rating: 4, text: 'Very peaceful.', relativeTime: '2 weeks ago' },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('PlaceDetailPanel', () => {
  beforeEach(() => {
    mockGeneratePlaceSummary.mockClear();
    mockGeneratePlaceSummary.mockResolvedValue('');
  });

  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders the place name', () => {
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    expect(screen.getByText('Fushimi Inari')).toBeInTheDocument();
  });

  it('renders the rating', () => {
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    expect(screen.getByText('4.8')).toBeInTheDocument();
  });

  it('renders the place type with underscores replaced by spaces', () => {
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    expect(screen.getByText('tourist attraction')).toBeInTheDocument();
  });

  it('renders Overview and Reviews tabs', () => {
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reviews/i })).toBeInTheDocument();
  });

  it('renders as a compact card when variant="card"', () => {
    const { container } = render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} variant="card" />);
    expect(container.firstChild).toHaveClass('w-80');
  });

  it('renders as a full-height panel when variant="panel" (default)', () => {
    const { container } = render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    expect(container.firstChild).toHaveClass('w-[560px]');
  });

  it('renders the address on the overview tab', () => {
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    expect(screen.getByText('68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto')).toBeInTheDocument();
  });

  it('renders opening hours when provided', () => {
    const place = { ...BASE_PLACE, openingHoursText: ['Mon: 9am–5pm', 'Tue: 9am–5pm'] };
    render(<PlaceDetailPanel place={place} onClose={vi.fn()} />);
    expect(screen.getByText('Mon: 9am–5pm')).toBeInTheDocument();
    expect(screen.getByText('Tue: 9am–5pm')).toBeInTheDocument();
  });

  it('renders a website link when provided', () => {
    const place = { ...BASE_PLACE, websiteUrl: 'https://example.com' };
    render(<PlaceDetailPanel place={place} onClose={vi.fn()} />);
    const link = screen.getByRole('link', { name: /visit website/i });
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  // ── AI Summary generation ────────────────────────────────────────────────────

  it('calls generatePlaceSummary when the place has no description', async () => {
    mockGeneratePlaceSummary.mockResolvedValue('Stunning vermilion gates wind through the mountain.');
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGeneratePlaceSummary).toHaveBeenCalledTimes(1));
    expect(mockGeneratePlaceSummary).toHaveBeenCalledWith({
      name: 'Fushimi Inari',
      type: 'tourist_attraction',
      address: '68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto',
      reviews: [],
    });
  });

  it('does NOT call generatePlaceSummary when the place already has a description', () => {
    render(<PlaceDetailPanel place={PLACE_WITH_DESC} onClose={vi.fn()} />);
    expect(mockGeneratePlaceSummary).not.toHaveBeenCalled();
  });

  it('renders the existing description when available', () => {
    render(<PlaceDetailPanel place={PLACE_WITH_DESC} onClose={vi.fn()} />);
    expect(screen.getByText('A famous Shinto shrine with thousands of torii gates.')).toBeInTheDocument();
  });

  it('renders the AI-generated summary after it loads', async () => {
    mockGeneratePlaceSummary.mockResolvedValue('Thousands of gates create a mesmerizing tunnel of red.');
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText('Thousands of gates create a mesmerizing tunnel of red.')).toBeInTheDocument()
    );
  });

  it('shows a "Generated by Gemini" badge for AI summaries', async () => {
    mockGeneratePlaceSummary.mockResolvedValue('An iconic destination.');
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/generated by gemini/i)).toBeInTheDocument());
  });

  it('does NOT show the Gemini badge when using a Google-provided description', () => {
    render(<PlaceDetailPanel place={PLACE_WITH_DESC} onClose={vi.fn()} />);
    expect(screen.queryByText(/generated by gemini/i)).not.toBeInTheDocument();
  });

  it('shows a skeleton loader while the AI summary is fetching', () => {
    // Never resolves — keeps loading state active
    mockGeneratePlaceSummary.mockReturnValue(new Promise(() => {}));
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows "No description available" when AI summary returns empty string', async () => {
    mockGeneratePlaceSummary.mockResolvedValue('');
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/no description available/i)).toBeInTheDocument()
    );
  });

  it('passes reviews to generatePlaceSummary', async () => {
    render(<PlaceDetailPanel place={PLACE_WITH_REVIEWS} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGeneratePlaceSummary).toHaveBeenCalled());
    expect(mockGeneratePlaceSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        reviews: [
          { author: 'Alice', rating: 5, text: 'Absolutely breathtaking!' },
          { author: 'Bob', rating: 4, text: 'Very peaceful.' },
        ],
      })
    );
  });

  // ── State reset when place changes ───────────────────────────────────────────

  it('resets to the overview tab when the place changes', async () => {
    mockGeneratePlaceSummary.mockResolvedValue('First summary.');
    const { rerender } = render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('First summary.'));

    // Navigate to Reviews tab
    await userEvent.click(screen.getByRole('button', { name: /reviews/i }));

    // Swap to a different place — should reset to Overview
    const PLACE_2: MapPlace = { ...BASE_PLACE, id: 'place-2', name: 'Kinkaku-ji' };
    mockGeneratePlaceSummary.mockResolvedValue('Second summary.');
    rerender(<PlaceDetailPanel place={PLACE_2} onClose={vi.fn()} />);

    await waitFor(() => screen.getByText('Second summary.'));
    // Overview content (address) should be visible, not hidden behind Reviews tab
    expect(screen.getByText('68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto')).toBeInTheDocument();
    expect(screen.queryByText('First summary.')).not.toBeInTheDocument();
  });

  it('fetches a new AI summary when switching to a different place without a description', async () => {
    mockGeneratePlaceSummary.mockResolvedValue('First summary.');
    const { rerender } = render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGeneratePlaceSummary).toHaveBeenCalledTimes(1));

    const PLACE_2: MapPlace = { ...BASE_PLACE, id: 'place-2', description: null };
    mockGeneratePlaceSummary.mockResolvedValue('Second summary.');
    rerender(<PlaceDetailPanel place={PLACE_2} onClose={vi.fn()} />);

    await waitFor(() => expect(mockGeneratePlaceSummary).toHaveBeenCalledTimes(2));
  });

  it('does NOT fetch a new summary when switching to a place that has a description', async () => {
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    await waitFor(() => expect(mockGeneratePlaceSummary).toHaveBeenCalledTimes(1));

    const { rerender } = render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    mockGeneratePlaceSummary.mockClear();

    rerender(<PlaceDetailPanel place={PLACE_WITH_DESC} onClose={vi.fn()} />);
    // Give it a tick to ensure no async call was made
    await act(async () => { await Promise.resolve(); });
    expect(mockGeneratePlaceSummary).not.toHaveBeenCalled();
  });

  // ── Reviews tab ──────────────────────────────────────────────────────────────

  it('shows review author and text on the Reviews tab', async () => {
    render(<PlaceDetailPanel place={PLACE_WITH_REVIEWS} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /reviews/i }));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Absolutely breathtaking!')).toBeInTheDocument();
    expect(screen.getByText('1 week ago')).toBeInTheDocument();
  });

  it('renders reviewer photos with no-referrer policy when authorPhoto is provided', async () => {
    render(<PlaceDetailPanel place={PLACE_WITH_REVIEWS} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /reviews/i }));
    const photos = document.querySelectorAll('img[referrerpolicy="no-referrer"]');
    expect(photos.length).toBeGreaterThan(0);
    expect((photos[0] as HTMLImageElement).src).toContain('bob.jpg');
  });

  it('shows "No reviews available" on the Reviews tab when there are none', async () => {
    render(<PlaceDetailPanel place={BASE_PLACE} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /reviews/i }));
    expect(screen.getByText(/no reviews available/i)).toBeInTheDocument();
  });
});
