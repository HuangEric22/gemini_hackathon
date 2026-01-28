import '@testing-library/jest-dom';
import { vi } from 'vitest';

global.google = {
  maps: {
    importLibrary: vi.fn().mockResolvedValue({
      AutocompleteSessionToken: vi.fn(),
      AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
      },
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