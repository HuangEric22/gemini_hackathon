import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DiscoveryFeed } from '@/components/features/discovery/discovery-feed';

vi.mock('@/hooks/places-search', () => ({
  usePlacesSearch: () => ({
    results: [],
    isLoading: false,
    isLoaded: true,
    searchNearby: vi.fn(),
    searchByText: vi.fn(),
  }),
  extractSnapshot: vi.fn(),
}));

vi.mock('@/hooks/places-autocomplete', () => ({
  usePlacesAutocomplete: () => ({
    searchSuggestions: [],
    loading: false,
    fetchSuggestions: vi.fn(),
    refreshSession: vi.fn(),
  }),
}));

vi.mock('@/app/actions/shadow-save-activities', () => ({
  shadowSaveActivities: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/app/actions/recommend-cities', () => ({
  getRecommendedCities: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/google-maps', () => ({
  LoadPlacesLibrary: vi.fn(),
}));

const KYOTO = { id: 'kyoto-id', name: 'Kyoto', lat: 35.01, lng: 135.76 };
const OSAKA = { id: 'osaka-id', name: 'Osaka', lat: 34.69, lng: 135.50 };

describe('DiscoveryFeed', () => {
  const defaultProps = {
    cities: [KYOTO],
    activeCityId: KYOTO.id,
    onAddCity: vi.fn(),
    onRemoveCity: vi.fn(),
    onSelectCity: vi.fn(),
    onPlacesChange: vi.fn(),
    focusedPlaceId: null,
    onFocusPlace: vi.fn(),
  };

  it('renders the active city as a highlighted tab', () => {
    render(<DiscoveryFeed {...defaultProps} />);
    expect(screen.getByText('Kyoto')).toBeInTheDocument();
  });

  it('renders all four section headings', () => {
    render(<DiscoveryFeed {...defaultProps} />);
    expect(screen.getByText('Things to do')).toBeInTheDocument();
    expect(screen.getByText('Restaurants')).toBeInTheDocument();
    expect(screen.getByText('Events & Culture')).toBeInTheDocument();
    expect(screen.getByText('Hotels')).toBeInTheDocument();
  });

  it('renders no skeletons once the places library is loaded (mock returns isLoaded: true)', () => {
    render(<DiscoveryFeed {...defaultProps} />);
    // The mock returns isLoaded: true so all sections exit the loading state immediately.
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(0);
  });

  it('renders multiple city tabs', () => {
    render(<DiscoveryFeed {...defaultProps} cities={[KYOTO, OSAKA]} />);
    expect(screen.getByText('Kyoto')).toBeInTheDocument();
    expect(screen.getByText('Osaka')).toBeInTheDocument();
  });

  it('renders the add-city input', () => {
    render(<DiscoveryFeed {...defaultProps} />);
    expect(screen.getByPlaceholderText('Add a city…')).toBeInTheDocument();
  });
});
