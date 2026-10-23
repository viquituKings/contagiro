import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StorageService } from '@/services/storage';
import { Calculations } from '@/services/calculations';
import { Vehicle, Refueling, MaintenanceItem } from '@/types/vehicle';

export default function ForecastScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [refuelings, setRefuelings] = useState<Refueling[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceItem[]>([]);

  // Calculadora Flex
  const [gasolinePrice, setGasolinePrice] = useState('5.89');
  const [ethanolPrice, setEthanolPrice] = useState('3.89');
  const [customRatio, setCustomRatio] = useState('70'); // %

  const loadData = async () => {
    const curVehicle = await StorageService.getActiveVehicle();
    setVehicle(curVehicle);
    if (curVehicle) {
      const [refData, mainData] = await Promise.all([
        StorageService.getRefuelings(curVehicle.id),
        StorageService.getMaintenances(curVehicle.id),
      ]);
      setRefuelings(refData);
      setMaintenances(mainData);

      // Preencher com o último preço praticado se houver
      const lastGas = refData.find((r) => r.fuelType === 'gasolina');
      const lastEta = refData.find((r) => r.fuelType === 'etanol');
      if (lastGas) setGasolinePrice(String(lastGas.pricePerLiter));
      if (lastEta) setEthanolPrice(String(lastEta.pricePerLiter));
      if (curVehicle.flexEfficiencyRatio) {
        setCustomRatio(String(Math.round(curVehicle.flexEfficiencyRatio * 100)));
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const forecast = vehicle
    ? Calculations.calculateFuelForecast(vehicle, refuelings, maintenances)
    : null;

  const gasNum = parseFloat(gasolinePrice.replace(',', '.')) || 0;
  const etaNum = parseFloat(ethanolPrice.replace(',', '.')) || 0;
  const ratioNum = (parseFloat(customRatio) || 70) / 100;
  const flexResult = Calculations.calculateFlex(
    gasNum,
    etaNum,
    ratioNum,
    vehicle?.tankCapacity || 45
  );

  const theme = {
    bg: isDark ? '#090D16' : '#F8FAFC',
    card: isDark ? '#141D2E' : '#FFFFFF',
    cardBorder: isDark ? '#1E2D44' : '#E2E8F0',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    accent: '#10B981',
    blue: '#3B82F6',
    purple: '#8B5CF6',
    amber: '#F59E0B',
    red: '#EF4444',
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Previsão & Economia</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Estimativas inteligentes com base na sua rotina de direção
          </Text>
        </View>

        {/* CARD MOTOR DE PREVISÃO */}
        {forecast && (
          <View style={[styles.forecastCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.forecastCardHeader}>
              <View style={styles.iconBadge}>
                <Ionicons name="sparkles" size={20} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.forecastCardTitle, { color: theme.text }]}>
                  Projeção Financeira
                </Text>
                <Text style={[styles.forecastCardSub, { color: theme.textMuted }]}>
                  Média calculada: ~{forecast.averageDailyKm} km/dia rodados
                </Text>
              </View>
            </View>

            {/* Total 30 dias em destaque */}
            <View style={[styles.highlightBox, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
              <Text style={[styles.highlightLabel, { color: theme.textMuted }]}>
                Previsão de Gasto Total (Próximos 30 dias):
              </Text>
              <Text style={[styles.highlightAmount, { color: theme.accent }]}>
                R$ {forecast.totalProjectedCost30Days.toFixed(2)}
              </Text>
              <Text style={[styles.highlightDesc, { color: theme.textMuted }]}>
                Inclui combustível estimado + revisões que devem vencer no período
              </Text>
            </View>

            {/* Comparativo 30d, 60d, 90d */}
            <Text style={[styles.subSectionTitle, { color: theme.text }]}>
              Evolução dos Custos com Combustível:
            </Text>

            <View style={styles.projectionsRow}>
              {/* 30 dias */}
              <View style={[styles.periodCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                <Text style={[styles.periodTitle, { color: theme.textMuted }]}>30 Dias</Text>
                <Text style={[styles.periodValue, { color: theme.text }]}>
                  R$ {forecast.projected30DaysCost.toFixed(2)}
                </Text>
                <Text style={[styles.periodKm, { color: theme.accent }]}>
                  ~{forecast.projected30DaysKm} km
                </Text>
              </View>

              {/* 60 dias */}
              <View style={[styles.periodCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                <Text style={[styles.periodTitle, { color: theme.textMuted }]}>60 Dias</Text>
                <Text style={[styles.periodValue, { color: theme.text }]}>
                  R$ {forecast.projected60DaysCost.toFixed(2)}
                </Text>
                <Text style={[styles.periodKm, { color: theme.accent }]}>
                  ~{forecast.projected30DaysKm * 2} km
                </Text>
              </View>

              {/* 90 dias */}
              <View style={[styles.periodCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                <Text style={[styles.periodTitle, { color: theme.textMuted }]}>90 Dias</Text>
                <Text style={[styles.periodValue, { color: theme.text }]}>
                  R$ {forecast.projected90DaysCost.toFixed(2)}
                </Text>
                <Text style={[styles.periodKm, { color: theme.accent }]}>
                  ~{forecast.projected30DaysKm * 3} km
                </Text>
              </View>
            </View>

            {/* Parâmetros do cálculo */}
            <View style={styles.paramsBox}>
              <View style={styles.paramItem}>
                <Ionicons name="speedometer-outline" size={16} color={theme.textMuted} />
                <Text style={[styles.paramText, { color: theme.textMuted }]}>
                  Consumo Médio: <Text style={{ color: theme.text, fontWeight: 'bold' }}>{forecast.averageConsumptionKmPerLiter} km/L</Text>
                </Text>
              </View>
              <View style={styles.paramItem}>
                <Ionicons name="pricetag-outline" size={16} color={theme.textMuted} />
                <Text style={[styles.paramText, { color: theme.textMuted }]}>
                  Preço Médio/L: <Text style={{ color: theme.text, fontWeight: 'bold' }}>R$ {forecast.averagePricePerLiter.toFixed(2)}</Text>
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* CALCULADORA FLEX INTELIGENTE */}
        <View style={[styles.flexCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.forecastCardHeader}>
            <View style={[styles.iconBadge, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
              <Ionicons name="calculator" size={20} color="#8B5CF6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.forecastCardTitle, { color: theme.text }]}>
                Calculadora Flex Inteligente
              </Text>
              <Text style={[styles.forecastCardSub, { color: theme.textMuted }]}>
                Descubra qual combustível compensa mais agora no posto
              </Text>
            </View>
          </View>

          {/* Inputs de Preço */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Gasolina (R$/L):</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                keyboardType="numeric"
                value={gasolinePrice}
                onChangeText={setGasolinePrice}
                placeholder="5.89"
                placeholderTextColor={theme.textMuted}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Etanol (R$/L):</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                keyboardType="numeric"
                value={ethanolPrice}
                onChangeText={setEthanolPrice}
                placeholder="3.89"
                placeholderTextColor={theme.textMuted}
              />
            </View>

            <View style={[styles.inputGroup, { width: 80 }]}>
              <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Regra (%):</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder, textAlign: 'center' }]}
                keyboardType="numeric"
                value={customRatio}
                onChangeText={setCustomRatio}
                placeholder="70"
                placeholderTextColor={theme.textMuted}
              />
            </View>
          </View>

          {/* RESULTADO DA CALCULADORA FLEX */}
          {flexResult.ratio > 0 && (
            <View
              style={[
                styles.resultCard,
                {
                  backgroundColor:
                    flexResult.recommendation === 'etanol'
                      ? 'rgba(16, 185, 129, 0.12)'
                      : 'rgba(239, 68, 68, 0.12)',
                  borderColor:
                    flexResult.recommendation === 'etanol' ? theme.accent : theme.red,
                },
              ]}
            >
              <View style={styles.resultHeader}>
                <Ionicons
                  name={flexResult.recommendation === 'etanol' ? 'leaf' : 'flame'}
                  size={24}
                  color={flexResult.recommendation === 'etanol' ? theme.accent : theme.red}
                />
                <Text
                  style={[
                    styles.resultTitle,
                    {
                      color:
                        flexResult.recommendation === 'etanol' ? theme.accent : theme.red,
                    },
                  ]}
                >
                  ABASTEÇA COM {flexResult.recommendation.toUpperCase()}!
                </Text>
              </View>

              <Text style={[styles.resultParity, { color: theme.text }]}>
                O Etanol está custando{' '}
                <Text style={{ fontWeight: 'bold' }}>{flexResult.ratio}%</Text> da Gasolina
                (o limite de economia é {flexResult.benchmarkRatio}%).
              </Text>

              {flexResult.savingsFullTank > 0 && (
                <View style={styles.savingsBox}>
                  <Text style={[styles.savingsText, { color: theme.text }]}>
                    Economia estimada:{' '}
                    <Text style={{ color: theme.accent, fontWeight: '900' }}>
                      R$ {flexResult.savingsFullTank.toFixed(2)}
                    </Text>{' '}
                    no tanque cheio ({vehicle?.tankCapacity || 45}L).
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  header: {
    marginTop: 4,
    gap: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  forecastCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
  },
  forecastCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  forecastCardTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  forecastCardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  highlightBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  highlightLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  highlightAmount: {
    fontSize: 26,
    fontWeight: '900',
  },
  highlightDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  projectionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  periodCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  periodTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  periodValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  periodKm: {
    fontSize: 11,
    fontWeight: '600',
  },
  paramsBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.15)',
  },
  paramItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paramText: {
    fontSize: 11,
  },
  flexCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    fontWeight: '700',
  },
  resultCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 8,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  resultParity: {
    fontSize: 13,
    lineHeight: 18,
  },
  savingsBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  savingsText: {
    fontSize: 12,
  },
});
