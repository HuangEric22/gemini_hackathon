export const CATEGORY_KEYWORDS = {
  All: [
    'Restaurants', 'Cafes', 'Parks', 'Museums', 'Art galleries',
    'Shopping', 'Hiking', 'Bars', 'Night clubs', 'Spas',
    'Beaches', 'Historical sites', 'Temples', 'Markets',
    'Viewpoints', 'Botanical gardens', 'Aquariums', 'Zoos',
    'Theme parks', 'Street food', 'Local cuisine', 'Tours',
  ],

  Outdoor: [
    'Parks',
    'Hiking',
    'Beaches',
    'Viewpoints',
    'Botanical gardens',
    'Zoos',
    'Aquariums',
    'Theme parks',
    'Scenic drives',
    'Water sports',
    'Camping',
    'Nature reserves',
    'Sunset spots',
  ],

  Food: [
    'Restaurants',
    'Cafes',
    'Street food',
    'Local cuisine',
    'Food markets',
    'Dessert spots',
    'Brunch',
    'Fine dining',
    'Food tours',
    'Bakeries',
  ],

  Culture: [
    'Museums',
    'Art galleries',
    'Historical sites',
    'Temples',
    'Markets',
    'Cultural centers',
    'Landmarks',
    'Architecture',
    'Festivals',
    'Exhibitions',
  ],

  Nightlife: [
    'Bars',
    'Night clubs',
    'Live music',
    'Rooftop bars',
    'Beach bars',
    'Night markets',
    'Comedy clubs',
    'Late-night food',
    'Lounges',
  ],
} as const;

export type KeywordCategory = keyof typeof CATEGORY_KEYWORDS;

// Flat deduplicated union of every category name + every keyword value
export const ALL_KEYWORDS: string[] = [
  ...new Set([
    ...Object.keys(CATEGORY_KEYWORDS),
    ...(Object.values(CATEGORY_KEYWORDS) as unknown as string[][]).flat(),
  ]),
];

export const PROMPT_SUGGESTIONS = (dayCount: number = 3): string[] => [
  `Perfect ${dayCount}-day plan`,
  'Best sunset spots',
  'Hidden gems locals love',
  'Top-rated restaurants',
  'Family-friendly activities',
  'Most instagrammable spots',
  'Local street food guide',
  'Must-see landmarks',
];
