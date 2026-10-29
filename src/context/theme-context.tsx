import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Appearance, useColorScheme as useRNColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'dark' | 'light' | 'auto';

export interface AppThemeColors {
  bg: string;
  card: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  blue: string;
  red: string;
  warning: string;
  inputBg: string;
}

const DARK_COLORS: AppThemeColors = {
  bg: '#090D16',
  card: '#141D2E',
  cardBorder: '#1E2D44',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  accent: '#10B981',
  accentLight: 'rgba(16, 185, 129, 0.15)',
  blue: '#3B82F6',
  red: '#EF4444',
  warning: '#F59E0B',
  inputBg: '#0A0F1D',
};

const LIGHT_COLORS: AppThemeColors = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  accent: '#10B981',
  accentLight: 'rgba(16, 185, 129, 0.1)',
  blue: '#3B82F6',
  red: '#EF4444',
  warning: '#F59E0B',
  inputBg: '#F1F5F9',
};

interface ThemeContextData {
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
  colorScheme: 'dark' | 'light';
  isDark: boolean;
  theme: AppThemeColors;
}

const THEME_STORAGE_KEY = '@contagiro:theme_preference';

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useRNColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('auto');
  const [currentScheme, setCurrentScheme] = useState<'dark' | 'light'>(
    systemScheme === 'dark' ? 'dark' : 'light'
  );

  const applyScheme = useCallback((pref: ThemePreference) => {
    if (pref === 'auto') {
      Appearance.setColorScheme('auto');
      const active = Appearance.getColorScheme();
      setCurrentScheme(active === 'dark' ? 'dark' : 'light');
    } else {
      Appearance.setColorScheme(pref);
      setCurrentScheme(pref);
    }
  }, []);

  // Inicializa a preferência gravada em cache
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light' || saved === 'auto') {
          if (isMounted) {
            setThemePreferenceState(saved);
            applyScheme(saved);
          }
        } else {
          // Padrão: automático
          applyScheme('auto');
        }
      } catch (e) {
        console.warn('Erro ao carregar preferência de tema:', e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [applyScheme]);

  // Monitora alterações de tema no sistema operacional
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (themePreference === 'auto') {
        const next = colorScheme === 'dark' ? 'dark' : 'light';
        setCurrentScheme(next);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [themePreference]);

  const setThemePreference = async (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    applyScheme(pref);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch (e) {
      console.warn('Erro ao persistir preferência de tema:', e);
    }
  };

  const isDark = currentScheme === 'dark';
  const theme = isDark ? DARK_COLORS : LIGHT_COLORS;

  return (
    <ThemeContext.Provider
      value={{
        themePreference,
        setThemePreference,
        colorScheme: currentScheme,
        isDark,
        theme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme deve ser utilizado dentro de um ThemeProvider');
  }
  return context;
}
