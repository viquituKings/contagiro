import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme, Platform } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const getColor = (c: unknown): string => {
    return typeof c === 'string' ? c : '#10B981';
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#10B981', // Emerald green
        tabBarInactiveTintColor: isDark ? '#94A3B8' : '#64748B',
        tabBarStyle: {
          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
          borderTopColor: isDark ? '#1E293B' : '#E2E8F0',
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
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
