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
import { Platform, useWindowDimensions, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { BackButton } from '@/ui/BackButton';
import { HeaderTitle } from '@/ui/components';
import { ThemeProvider, usePalette, useScheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { session, ready } = useAuth();
  const c = usePalette();
  const scheme = useScheme();
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
          headerTitle: ({ children }) => <HeaderTitle title={children} />,
          headerShadowVisible: false,
          headerLeft: () => <BackButton />,
          contentStyle: { backgroundColor: c.bg },
        }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="league/new" options={{ title: 'New league', presentation: 'modal' }} />
          <Stack.Screen name="league/join" options={{ title: 'Join league', presentation: 'modal' }} />
          <Stack.Screen name="league/[id]/index" options={{ title: 'League' }} />
          <Stack.Screen name="league/[id]/settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="league/[id]/new-match" options={{ title: 'New match' }} />
          <Stack.Screen name="match/new" options={{ title: 'New match' }} />
          <Stack.Screen name="match/join" options={{ title: 'Join match', presentation: 'modal' }} />
          <Stack.Screen name="match/[id]/index" options={{ title: 'Match' }} />
          <Stack.Screen name="league/[id]/stats" options={{ title: 'Season stats' }} />
          <Stack.Screen name="player/[id]" options={{ title: 'Player' }} />
          <Stack.Screen name="calendar" options={{ title: 'Calendar' }} />
          <Stack.Screen name="stats/[id]" options={{ title: 'Stats' }} />
          <Stack.Screen name="achievements/[id]" options={{ title: 'Badges' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** On a wide browser window, show the app inside a phone-sized frame so it can be tried on a computer. */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < 600) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: '#E78F25', alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 400,
          height: Math.min(860, height - 48),
          borderRadius: 36,
          borderWidth: 10,
          borderColor: '#0B2A1F',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(11, 42, 31, 0.35)',
        }}>
        {children}
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <PhoneFrame>
      <ThemeProvider>
        <AuthProvider>
          <RootStack />
        </AuthProvider>
      </ThemeProvider>
    </PhoneFrame>
  );
}
