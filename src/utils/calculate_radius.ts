export function calculateRadiusFromViewport(viewport: google.maps.LatLngBounds): number {
  const center = viewport.getCenter();
  const northEast = viewport.getNorthEast();
  const radius = google.maps.geometry.spherical.computeDistanceBetween(center, northEast);
  return Math.min(Math.max(radius, 2000), 50000);
}