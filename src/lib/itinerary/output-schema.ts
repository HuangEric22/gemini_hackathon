export const ITINERARY_SCHEMA = {
  type: 'object' as const,
  properties: {
    days: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          day_number: { type: 'integer' as const },
          brief_description: { type: 'string' as const },
          items: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                title: { type: 'string' as const },
                description: { type: 'string' as const },
                start_time: { type: 'string' as const },
                end_time: { type: 'string' as const },
                type: { type: 'string' as const },
                commute_info: { type: 'string' as const },
                commute_seconds: { type: 'integer' as const },
                is_suggested: { type: 'boolean' as const },
                lat: { type: 'number' as const },
                lng: { type: 'number' as const },
              },
              required: ['title', 'start_time', 'end_time', 'type', 'is_suggested', 'lat', 'lng'],
            },
          },
        },
        required: ['day_number', 'brief_description', 'items'],
      },
    },
  },
  required: ['days'],
};

