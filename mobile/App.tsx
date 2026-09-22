import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './src/supabase';
import { MapScreen } from './src/MapScreen';

function Main() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) { setSession(data.session); setLoading(false); if (error) setMessage(error.message); }
    }).catch(() => { if (active) { setLoading(false); setMessage('Unable to restore session. Sign in again.'); } });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { if (active) setSession(next); });
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') supabase?.auth.startAutoRefresh(); else supabase?.auth.stopAutoRefresh();
    });
    return () => { active = false; data.subscription.unsubscribe(); sub.remove(); supabase?.auth.stopAutoRefresh(); };
  }, []);
  async function authenticate(signup: boolean) {
    if (!supabase || busy) return;
    if (!email.trim() || password.length < 8) { setMessage('Enter an email and a password of at least 8 characters.'); return; }
    setBusy(true); setMessage('');
    try {
      const credentials = { email: email.trim(), password };
      const result = signup ? await supabase.auth.signUp(credentials) : await supabase.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      setPassword('');
      if (signup && !result.data.session) setMessage('Check your email to confirm your account, then sign in.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed. Please retry.'); }
    finally { setBusy(false); }
  }
  if (loading) return <View style={s.center}><ActivityIndicator color="#087f6f" /><Text>Restoring session…</Text></View>;
  if (session) return <MapScreen onSignOut={async () => {
    const result = await supabase!.auth.signOut(); if (result.error) throw result.error;
  }} />;
  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.eyebrow}>TRAVEL TOGETHER</Text><Text style={s.title}>GroupTrail</Text>
    <Text style={s.subtitle}>One map. Your next adventure.</Text>
    <View style={s.card}>
      <Text style={s.heading}>Welcome aboard</Text>
      <Text style={s.note}>Developer preview · Sign in to test the map and route preview. Group sharing is coming next.</Text>
      {!configured ? <Text style={s.error}>Copy mobile/.env.example to mobile/.env and fill in your Supabase URL and publishable key. Restart Metro afterward.</Text> : <>
        <Text>Email</Text><TextInput accessibilityLabel="Email" style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Text>Password</Text><TextInput accessibilityLabel="Password" style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="password" />
        <Button disabled={busy} color="#087f6f" title={busy ? 'Please wait…' : 'Sign in'} onPress={() => void authenticate(false)} />
        <Button disabled={busy} color="#516660" title="Create account" onPress={() => void authenticate(true)} />
      </>}
      {!!message && <Text accessibilityLiveRegion="polite" style={s.error}>{message}</Text>}
    </View>
    <Text style={s.note}>No Google billing. Open-source maps. Location access starts only when you request it.</Text>
  </ScrollView></SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><Main /></SafeAreaProvider>; }
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f2f7f4' }, content: { padding: 26, paddingTop: 60, gap: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  eyebrow: { color: '#087f6f', fontWeight: '700', letterSpacing: 3, fontSize: 12 },
  title: { fontSize: 44, fontWeight: '800', color: '#102e2a' }, subtitle: { color: '#516660', fontSize: 19 },
  card: { marginVertical: 16, backgroundColor: '#fff', borderRadius: 22, padding: 22, gap: 12 },
  heading: { fontSize: 23, fontWeight: '700', color: '#102e2a' }, note: { color: '#516660', lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#cad9d3', borderRadius: 12, padding: 14, fontSize: 16 }, error: { color: '#9b3e23', lineHeight: 21 },
});
