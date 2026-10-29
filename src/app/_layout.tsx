import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { ThemeProvider, useAppTheme } from '@/context/theme-context';
import { StorageService } from '@/services/storage';
import { AppSplashScreen } from '@/components/splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigation() {
  const { isDark, theme } = useAppTheme();
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
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="cadastro" options={{ headerShown: false }} />
        <Stack.Screen
          name="configuracoes"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
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
    <ThemeProvider>
      <AuthProvider>
        <RootNavigation />
      </AuthProvider>
    </ThemeProvider>
  );
}
