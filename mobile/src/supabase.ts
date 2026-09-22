import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url?.startsWith('https://') && key && !key.includes('YOUR_') && !url.includes('YOUR_'));
export const supabase = configured ? createClient(url!, key!, {
  auth: {
    storage: {
      getItem: (name: string) => SecureStore.getItemAsync(name),
      setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
      removeItem: (name: string) => SecureStore.deleteItemAsync(name),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
}) : null;
