export type MatchType =
  | 'query-match'
  | 'top-rated'
  | 'popular'
  | 'nearby'
  // | 'photo-worthy'
  | 'good-fit';

export interface RankableActivity {
  name: string;
  category?: string | null;
  description?: string | null;
  lat: number;
  lng: number;
  rating?: number | null;
  userRatingCount?: number | null;
  imageUrl?: string | null;
}

export interface RankingContext {
  center: { lat: number; lng: number };
  query?: string;
  radiusMeters?: number;
}

export type RankedActivity<T extends RankableActivity = RankableActivity> = T & {
  score: number;
  distanceMeters: number;
  matchType: MatchType;
  scoreReasons: string[];
};

// Utilize Haversine distance formula
export function getDistanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;

  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function includesQuery(activity: RankableActivity, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return false;

  const searchableText = [
    activity.name,
    activity.category,
    activity.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

function getRatingScore(rating: number | null | undefined) {
  /*
  weighted scoring
  3.5 rating -> 0 points
  4.0 rating -> 9 points
  4.5 rating -> 18 points
  5.0 rating -> 27 points
  */
  
  if (!rating) return 0;
  return Math.max(0, rating - 3.5) * 18;
}

function getPopularityScore(userRatingCount: number | null | undefined) {
  /*
  Diminishing returns
  10 ratings     -> ~6 points
  100 ratings    -> ~12 points
  1,000 ratings  -> ~18 points
  10,000 ratings -> ~22 points, capped
  */
  if (!userRatingCount) return 0;
  return Math.min(22, Math.log10(userRatingCount + 1) * 6);
}

function getDistanceScore(distanceMeters: number, radiusMeters: number) {
  /* nearby is helpful, but not always best */
  if (radiusMeters <= 0) return 0;
  const closeness = Math.max(0, 1 - distanceMeters / radiusMeters);
  return closeness * 18;
}

function getMatchType(activity: RankableActivity, distanceMeters: number, query?: string): MatchType {
  if (query && includesQuery(activity, query)) return 'query-match';
  if ((activity.rating ?? 0) >= 4.6 && (activity.userRatingCount ?? 0) >= 500) return 'top-rated';
  if ((activity.userRatingCount ?? 0) >= 2_000) return 'popular';
  if (distanceMeters <= 1_000) return 'nearby';
  // if (activity.imageUrl) return 'photo-worthy';
  return 'good-fit';
}

function getScoreReasons(activity: RankableActivity, distanceMeters: number, matchType: MatchType) {
  const reasons: string[] = [];

  if (matchType === 'query-match') reasons.push('Matches your search');
  if (matchType === 'top-rated') reasons.push('Top rated');
  if (matchType === 'popular') reasons.push('Popular with travelers');
  if (matchType === 'nearby') reasons.push('Near trip center');
  // if (matchType === 'photo-worthy') reasons.push('Photo-friendly pick');

  // if (activity.rating) reasons.push(`${activity.rating.toFixed(1)} rating`);
  // if (activity.userRatingCount) reasons.push(`${activity.userRatingCount.toLocaleString()} ratings`);
  // reasons.push(`${formatDistance(distanceMeters)} from center`);

  return reasons.slice(0, 3);
}

export function rankActivity<T extends RankableActivity>(
  activity: T,
  context: RankingContext,
): RankedActivity<T> {
  const distanceMeters = getDistanceMeters(context.center, {
    lat: activity.lat,
    lng: activity.lng,
  });
  const radiusMeters = context.radiusMeters ?? 10_000;
  const queryScore = context.query && includesQuery(activity, context.query) ? 24 : 0;
  // const photoScore = activity.imageUrl ? 4 : 0;
  const score =
    queryScore +
    getRatingScore(activity.rating) +
    getPopularityScore(activity.userRatingCount) +
    getDistanceScore(distanceMeters, radiusMeters) 
    // photoScore;
  const matchType = getMatchType(activity, distanceMeters, context.query);

  return {
    ...activity,
    score,
    distanceMeters,
    matchType,
    scoreReasons: getScoreReasons(activity, distanceMeters, matchType),
  };
}

export function rankActivities<T extends RankableActivity>(
  activities: T[],
  context: RankingContext,
): RankedActivity<T>[] {
  return activities
    .map((activity) => rankActivity(activity, context))
    .sort((a, b) => b.score - a.score);
}
