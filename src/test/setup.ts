import '@testing-library/jest-dom';
import { vi } from 'vitest';

const mockAutocompleteSuggestion = {
  fetchAutocompleteSuggestions: vi.fn()
};

const mockAutocompleteSessionToken = vi.fn();

global.google = {
  maps: {
importLibrary: vi.fn().mockImplementation(async (lib) => {
  if (lib === 'places') {
    return {
      AutocompleteSuggestion: mockAutocompleteSuggestion,
      AutocompleteSessionToken: mockAutocompleteSessionToken,
    };
  }
}),
  },
} as any;

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));