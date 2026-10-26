import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const getColor = (c: unknown): string => {
    return typeof c === 'string' ? c : '#10B981';
  };

  // Garante que o padding inferior respeite os botões/gestos de navegação do Android e a barra do iOS
  const bottomPadding = insets.bottom > 0 ? insets.bottom + 6 : (Platform.OS === 'ios' ? 24 : 10);
  const tabHeight = 54 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#10B981', // Emerald green
        tabBarInactiveTintColor: isDark ? '#94A3B8' : '#64748B',
        tabBarStyle: {
          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
          borderTopColor: isDark ? '#1E293B' : '#E2E8F0',
          height: tabHeight,
          paddingBottom: bottomPadding,
          paddingTop: 8,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
        },
        sceneStyle: {
          backgroundColor: isDark ? '#090D16' : '#F8FAFC',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Painel',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'speedometer' : 'speedometer-outline'}
              size={22}
              color={getColor(color)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="abastecimentos"
        options={{
          title: 'Abastecer',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'water' : 'water-outline'}
              size={22}
              color={getColor(color)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="manutencoes"
        options={{
          title: 'Oficina',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'build' : 'build-outline'}
              size={22}
              color={getColor(color)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="previsao"
        options={{
          title: 'Previsão',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'trending-up' : 'trending-up-outline'}
              size={22}
              color={getColor(color)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="garagem"
        options={{
          title: 'Garagem',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'car-sport' : 'car-sport-outline'}
              size={22}
              color={getColor(color)}
            />
          ),
        }}
      />
    </Tabs>
  );
}
