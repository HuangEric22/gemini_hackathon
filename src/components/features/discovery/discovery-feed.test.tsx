import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DiscoveryFeed } from './discovery-feed';

// Mock the hook so tests don't touch Google
vi.mock('@/hooks/places-search', () => ({
  usePlacesSearch: () => ({
    results: [],
    isLoading: false,
    isLoaded: true,
    searchNearby: vi.fn(),
    searchByText: vi.fn(),
  }),
}));

// Mock the server actions added in the last session
vi.mock('@/app/actions/shadow-save-activities', () => ({
  shadowSaveActivities: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/app/actions/recommend-cities', () => ({
  getRecommendedCities: vi.fn().mockResolvedValue([]),
}));

vi.mock('../search/search-card', () => ({
  SearchCard: ({ onSearch, isLoading }: any) => (
    <div data-testid="mock-search-card">
      <button onClick={() => onSearch('New York')}>Mock Search</button>
      {isLoading && <span>Loading...</span>}
    </div>
  ),
}));

describe('DiscoveryFeed', () => {
  const defaultProps = {
    cityName: 'Los Angeles',
    onSearch: vi.fn(),
    isSearching: false,
    location: null,
  };

  it('renders the correct city name in the heading', () => {
    render(<DiscoveryFeed {...defaultProps} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Los Angeles');
  });

  it('renders all three section headings', () => {
    render(<DiscoveryFeed {...defaultProps} />);

    expect(screen.getByText('Things to do')).toBeInTheDocument();
    expect(screen.getByText('Restaurants')).toBeInTheDocument();
    expect(screen.getByText('Events & Culture')).toBeInTheDocument();
  });

  it('renders skeleton placeholders while loading', () => {
    render(<DiscoveryFeed {...defaultProps} />);

    // Each section shows 5 skeleton cards when results are empty
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  it('passes the search callback to the SearchCard', () => {
    const onSearchSpy = vi.fn();
    render(<DiscoveryFeed {...defaultProps} onSearch={onSearchSpy} />);

    screen.getByText('Mock Search').click();

    expect(onSearchSpy).toHaveBeenCalledWith('New York');
  });

  it('shows loading indicator in SearchCard when isSearching is true', () => {
    render(<DiscoveryFeed {...defaultProps} isSearching={true} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
