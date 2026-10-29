import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { StorageService } from '@/services/storage';
import { AppSplashScreen } from '@/components/splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigation() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [isSplashDone, setIsSplashDone] = useState(false);

  useEffect(() => {
    StorageService.init();
  }, []);

  // Monitora alterações posteriores de autenticação após o splash ter sido concluído
  useEffect(() => {
    if (!isSplashDone) return;

    const currentSegment = segments[0] as string | undefined;
    const isAuthRoute = currentSegment === 'login' || currentSegment === 'cadastro';

    if (!user && !isAuthRoute) {
      router.replace('/login');
    } else if (user && isAuthRoute) {
      router.replace('/(tabs)');
    }
  }, [user, isSplashDone, segments, router]);

  const handleSplashFinish = () => {
    const currentSegment = segments[0] as string | undefined;
    const isAuthRoute = currentSegment === 'login' || currentSegment === 'cadastro';

    if (user) {
      if (isAuthRoute || currentSegment !== '(tabs)') {
        router.replace('/(tabs)');
      }
    } else {
      if (!isAuthRoute) {
        router.replace('/login');
      }
    }

    setIsSplashDone(true);
  };

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: isDark ? '#090D16' : '#F8FAFC' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="cadastro" options={{ headerShown: false }} />
      </Stack>

      {!isSplashDone && (
        <AppSplashScreen
          authLoading={loading}
          onFinish={handleSplashFinish}
        />
      )}
    </>
  );
}

export default function AppLayout() {
  return (
    <AuthProvider>
      <RootNavigation />
    </AuthProvider>
  );
}
