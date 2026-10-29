import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Animated,
  useColorScheme,
  Easing,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

interface AppSplashScreenProps {
  authLoading: boolean;
  onFinish: () => void;
}

export function AppSplashScreen({ authLoading, onFinish }: AppSplashScreenProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [progressAnim] = useState(() => new Animated.Value(0));
  const [fadeAnim] = useState(() => new Animated.Value(1));
  const [scaleAnim] = useState(() => new Animated.Value(0.85));
  const [statusText, setStatusText] = useState('Iniciando ContaGiro...');

  const theme = {
    bg: isDark ? '#090D16' : '#F8FAFC',
    card: isDark ? '#141D2E' : '#FFFFFF',
    cardBorder: isDark ? '#1E2D44' : '#E2E8F0',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    accent: '#10B981',
    accentLight: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.12)',
    trackBg: isDark ? '#1E293B' : '#E2E8F0',
  };

  useEffect(() => {
    // Esconde a splash nativa assim que o componente JS estiver montado
    SplashScreen.hideAsync().catch(() => {});

    // Animação de entrada do ícone (zoom suave)
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 40,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // Primeira fase: anima suavemente até 70% enquanto verifica os estados
    Animated.timing(progressAnim, {
      toValue: 0.7,
      duration: 1000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    const timer1 = setTimeout(() => {
      setStatusText('Verificando autenticação...');
    }, 450);

    return () => clearTimeout(timer1);
  }, [progressAnim, scaleAnim]);

  // Segunda fase: quando a autenticação terminar de carregar
  useEffect(() => {
    if (authLoading) return;

    const timer2 = setTimeout(() => {
      setStatusText('Carregando preferências...');

      // Avança de onde estiver até 100% de forma rápida e fluida
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        setStatusText('Tudo pronto!');

        // Pequeno delay para percepção do 100% e transição suave
        setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start(() => {
            onFinish();
          });
        }, 150);
      });
    }, 50);

    return () => clearTimeout(timer2);
  }, [authLoading, fadeAnim, onFinish, progressAnim]);

  const progressInterpolate = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: theme.bg,
          opacity: fadeAnim,
        },
      ]}
    >
      {/* BLOCO CENTRAL: ÍCONE E IDENTIDADE */}
      <View style={styles.centerContent}>
        <Animated.View
          style={[
            styles.iconContainer,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Image
            source={require('../../assets/images/icon.png')}
            style={styles.icon}
            resizeMode="cover"
          />
        </Animated.View>

        <Text style={[styles.brandTitle, { color: theme.text }]}>
          Conta<Text style={{ color: theme.accent }}>Giro</Text>
        </Text>
        <Text style={[styles.brandSubtitle, { color: theme.textMuted }]}>
          Controle Inteligente & Previsão
        </Text>
      </View>

      {/* BLOCO INFERIOR: BARRA DE PROGRESSO & STATUS */}
      <View style={styles.bottomContent}>
        <View style={[styles.progressTrack, { backgroundColor: theme.trackBg }]}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: theme.accent,
                width: progressInterpolate,
              },
            ]}
          />
        </View>

        <Text style={[styles.statusText, { color: theme.textMuted }]}>
          {statusText}
        </Text>
      </View>

      {/* RODAPÉ */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.textMuted }]}>
          Gestão Inteligente de Veículos
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 99999,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 24,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 28,
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 6,
  },
  icon: {
    width: '100%',
    height: '100%',
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  bottomContent: {
    width: '100%',
    maxWidth: 260,
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
