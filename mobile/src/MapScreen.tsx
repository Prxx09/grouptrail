import React, { useEffect, useRef, useState } from 'react';
import { AppState, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Map, Camera, GeoJSONSource, Layer, type CameraRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import type { Feature, LineString } from 'geojson';
import { supabase } from './supabase';
import { validateRouteRequest, type Coordinate, type Profile } from '../../shared/routing';

type Route = Feature<LineString, { summary: { distance: number; duration: number }; segments: { steps: { instruction: string; distance: number }[] }[] }>;
const modes: [Profile, string][] = [['foot-walking', 'Walk'], ['cycling-regular', 'Cycle'], ['driving-car', 'Drive']];
export function MapScreen({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const camera = useRef<CameraRef>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [mode, setMode] = useState<Profile>('foot-walking');
  const [route, setRoute] = useState<Route | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Tap Locate me, then long-press the map to choose a destination.');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') { request.current?.abort(); setLocation(null); setRoute(null); }
    });
    return () => { sub.remove(); request.current?.abort(); };
  }, []);
  async function locate() {
    setBusy(true); setRoute(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Location permission is needed for route preview. You can still browse the map.');
      if (!await Location.hasServicesEnabledAsync()) throw new Error('Enable device location services, then retry.');
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(result);
      camera.current?.flyTo({ center: [result.coords.longitude, result.coords.latitude], zoom: 15, duration: 800 });
      setNotice(`Location found (accuracy ±${Math.round(result.coords.accuracy ?? 0)} m). Long-press to choose a destination.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not locate device'); }
    finally { setBusy(false); }
  }
  async function preview() {
    if (!location || !destination || !supabase || busy) return;
    setBusy(true); setRoute(null);
    try {
      if (Date.now() - location.timestamp > 60000) throw new Error('Your location is older than a minute. Tap Locate me again.');
      const body = validateRouteRequest({ origin: [location.coords.longitude, location.coords.latitude], destination, profile: mode });
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw new Error('Session expired. Sign in again.');
      const controller = new AbortController(); request.current = controller;
      const timeout = setTimeout(() => controller.abort(), 20000);
      let response: Response;
      try {
        response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/routes`, {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } finally { clearTimeout(timeout); }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Route service is not deployed or configured yet.');
      const feature = payload.features?.[0] as Route | undefined;
      if (feature?.geometry?.type !== 'LineString' || !feature.properties?.summary) throw new Error('No usable route returned');
      setRoute(feature); setNotice('Route preview only — live guidance is not implemented yet. Check signs and local conditions.');
    } catch (error) { setNotice(error instanceof Error && error.name !== 'AbortError' ? error.message : 'Request stopped or timed out. Try again.'); }
    finally { setBusy(false); request.current = null; }
  }
  const point = (coordinates: Coordinate): Feature => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: {} });
  return <SafeAreaView style={s.page}>
    <View style={s.header}><View><Text style={s.brand}>GroupTrail</Text><Text style={s.small}>MAP & ROUTE PREVIEW</Text></View>
      <Button disabled={busy} color="#087f6f" title="Sign out" onPress={() => { void onSignOut().catch(() => setNotice('Sign-out failed. Please retry.')); }} /></View>
    <Map style={s.map} mapStyle={process.env.EXPO_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty'}
      onDidFailLoadingMap={() => setNotice('Map unavailable. Check your internet connection.')}
      onLongPress={event => { if (!busy) { setDestination(event.nativeEvent.lngLat as Coordinate); setRoute(null); } }}>
      <Camera ref={camera} initialViewState={{ center: [72.8777, 19.076], zoom: 11 }} />
      {location && <GeoJSONSource id="self" data={point([location.coords.longitude, location.coords.latitude])}><Layer id="self-dot" type="circle" paint={{ 'circle-radius': 8, 'circle-color': '#087f6f', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 }} /></GeoJSONSource>}
      {destination && <GeoJSONSource id="destination" data={point(destination)}><Layer id="destination-dot" type="circle" paint={{ 'circle-radius': 9, 'circle-color': '#ea8044', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 }} /></GeoJSONSource>}
      {route && <GeoJSONSource id="route" data={route}><Layer id="route-line" type="line" paint={{ 'line-width': 5, 'line-color': '#087f6f', 'line-opacity': 0.8 }} /></GeoJSONSource>}
    </Map>
    <View style={s.panel}>
      <Text accessibilityLiveRegion="polite" style={s.note}>{notice}</Text>
      <View style={s.row}>{modes.map(([value, label]) => <Button disabled={busy} key={value} color={mode === value ? '#087f6f' : '#667c76'} title={label} onPress={() => { setMode(value); setRoute(null); }} />)}</View>
      <View style={s.row}><Button disabled={busy} color="#087f6f" title="Locate me" onPress={() => void locate()} />
        <Button disabled={busy || !location || !destination} color="#087f6f" title={busy ? 'Please wait…' : 'Preview route'} onPress={() => void preview()} /></View>
      {route && <ScrollView style={s.instructions}>
        <Text style={s.small}>Routing © openrouteservice / HeiGIT · © OpenStreetMap contributors</Text>
        <Text style={s.brand}>{(route.properties.summary.distance / 1000).toFixed(1)} km · {Math.ceil(route.properties.summary.duration / 60)} min</Text>
        {route.properties.segments.flatMap(segment => segment.steps).map((step, i) => <Text key={i} style={s.step}>{i + 1}. {step.instruction} · {Math.round(step.distance)} m</Text>)}
      </ScrollView>}
      <Text style={s.small}>Location stays on-device until a route is requested. No group tracking yet.</Text>
    </View>
  </SafeAreaView>;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: '#f2f7f4' }, header: { padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { fontSize: 23, fontWeight: '800', color: '#102e2a' }, small: { fontSize: 10, color: '#516660', marginTop: 5 }, map: { flex: 1 }, panel: { padding: 18, gap: 12 }, note: { color: '#334f48', lineHeight: 20 }, row: { flexDirection: 'row', gap: 10 }, instructions: { maxHeight: 150 }, step: { paddingVertical: 8, color: '#334f48' } });
