import {
  BigShouldersDisplay_800ExtraBold,
  BigShouldersDisplay_900Black,
} from '@expo-google-fonts/big-shoulders-display';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  useFonts,
} from '@expo-google-fonts/instrument-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { fonts, usePalette } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { session, ready } = useAuth();
  const c = usePalette();
  const scheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    BigShouldersDisplay_800ExtraBold,
    BigShouldersDisplay_900Black,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    IBMPlexMono_500Medium,
  });

  useEffect(() => {
    if (ready && fontsLoaded) SplashScreen.hideAsync();
  }, [ready, fontsLoaded]);

  if (!ready || !fontsLoaded) return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 22 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
        }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="index" options={{ title: 'THE RUT' }} />
          <Stack.Screen name="profile" options={{ title: 'PROFILE' }} />
          <Stack.Screen name="league/new" options={{ title: 'NEW LEAGUE', presentation: 'modal' }} />
          <Stack.Screen name="league/join" options={{ title: 'JOIN LEAGUE', presentation: 'modal' }} />
          <Stack.Screen name="league/[id]/index" options={{ title: 'LEAGUE' }} />
          <Stack.Screen name="league/[id]/settings" options={{ title: 'LEAGUE SETTINGS' }} />
          <Stack.Screen name="league/[id]/new-match" options={{ title: 'NEW MATCH' }} />
          <Stack.Screen name="match/[id]" options={{ title: 'MATCH' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootStack />
    </AuthProvider>
  );
}
