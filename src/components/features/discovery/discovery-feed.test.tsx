import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DiscoveryFeed } from './discovery-feed';

// 1. Mock the child component to isolate the test
// This ensures we aren't testing Google Maps logic inside the Feed test
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
  };

  it('renders the correct city name in the heading', () => {
    render(<DiscoveryFeed {...defaultProps} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Los Angeles');
  });

  it('renders all three blueprint sections', () => {
    render(<DiscoveryFeed {...defaultProps} />);
    
    expect(screen.getByText('Things to do')).toBeInTheDocument();
    expect(screen.getByText('Restaurants')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('renders the correct number of placeholder items in each section', () => {
    render(<DiscoveryFeed {...defaultProps} />);
    
    // Find the "Things to do" section specifically
    const section = screen.getByText('Things to do').closest('section');
    
    // Check that it contains 10 placeholder divs (as defined in your code)
    // We use querySelectorAll here because the divs have no text/role
    const placeholders = section?.querySelectorAll('.min-w-\\[200px\\]');
    expect(placeholders).toHaveLength(10);
  });

  it('passes the search callback to the SearchCard', async () => {
    const onSearchSpy = vi.fn();
    render(<DiscoveryFeed {...defaultProps} onSearch={onSearchSpy} />);
    
    // Interact with the mocked SearchCard
    const mockSearchButton = screen.getByText('Mock Search');
    mockSearchButton.click();
    
    expect(onSearchSpy).toHaveBeenCalledWith('New York');
  });

  it('shows loading state when isSearching is true', () => {
    render(<DiscoveryFeed {...defaultProps} isSearching={true} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});