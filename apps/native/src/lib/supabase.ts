import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabase = createClient(
  'https://xazalbajuvqbqgkgyagf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhemFsYmFqdXZxYnFna2d5YWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMzU3MTMsImV4cCI6MjA4NzkxMTcxM30.2ju4lVaNBBC3LJK3dJdA7LQr43KmsQ2atn9Nd4zFCHY',
  {
    db: { schema: 'intel' },
    auth: {
      storage: {
        getItem: (key: string) => AsyncStorage.getItem(key),
        setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
        removeItem: (key: string) => AsyncStorage.removeItem(key),
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  }
);

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

export default supabase;
