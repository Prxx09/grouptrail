import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, isCoordinate, validateRouteRequest } from '../shared/routing.ts';

test('accepts coordinates including zero', () => assert.equal(isCoordinate([0, 0]), true));
test('rejects invalid coordinates', () => {
  for (const point of [[181, 0], [0, 91], [NaN, 2], ['1', 2], [1, 2, 3], null]) {
    assert.equal(isCoordinate(point), false);
  }
});
test('distance in metres', () => assert.ok(Math.abs(distanceMeters([0, 0], [0, 1]) - 111195) < 10));
test('valid route preserves lon/lat order', () => {
  assert.deepEqual(validateRouteRequest({ origin: [72.8, 19], destination: [72.81, 19.01], profile: 'foot-walking' }).origin, [72.8, 19]);
});
test('rejects distant, identical and unsupported requests', () => {
  for (const data of [
    { origin: [0, 0], destination: [0, 0], profile: 'foot-walking' },
    { origin: [0, 0], destination: [0, 2], profile: 'foot-walking' },
    { origin: [0, 0], destination: [0, 0.01], profile: '../../evil' },
    { origin: [0, 0], destination: [0, 0.01], profile: 'motorcycle' },
  ]) assert.throws(() => validateRouteRequest(data));
});
