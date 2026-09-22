export type Coordinate = [number, number]; // longitude, latitude
export const profiles = ['foot-walking', 'cycling-regular', 'driving-car'] as const;
export type Profile = typeof profiles[number];
export type RouteRequest = { origin: Coordinate; destination: Coordinate; profile: Profile };

export function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 &&
    value.every(n => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const r = Math.PI / 180;
  const h = Math.sin((b[1] - a[1]) * r / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin((b[0] - a[0]) * r / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function validateRouteRequest(value: unknown): RouteRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid request');
  const data = value as Record<string, unknown>;
  if (!isCoordinate(data.origin) || !isCoordinate(data.destination)) throw new Error('Invalid coordinates');
  if (!profiles.includes(data.profile as Profile)) throw new Error('Unsupported travel mode');
  const distance = distanceMeters(data.origin, data.destination);
  if (distance < 10 || distance > 100000) throw new Error('Choose a destination 10 metres to 100 km away');
  return { origin: data.origin, destination: data.destination, profile: data.profile as Profile };
}
