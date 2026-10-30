import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  useColorScheme,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StorageService } from '@/services/storage';
import { Calculations } from '@/services/calculations';
import { Vehicle, Refueling, MaintenanceItem, FuelForecast, FuelPrices } from '@/types/vehicle';

export function isFlexVehicle(v: Vehicle | null): boolean {
  if (!v) return false;
  if (v.acceptedFuelTypes && v.acceptedFuelTypes.length > 0) {
    return v.acceptedFuelTypes.includes('gasolina') && v.acceptedFuelTypes.includes('etanol');
  }
  return v.fuelType === 'etanol' || (v.flexEfficiencyRatio != null && v.flexEfficiencyRatio > 0);
}

export default function ForecastScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('all');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [allRefuelings, setAllRefuelings] = useState<Refueling[]>([]);
  const [allMaintenances, setAllMaintenances] = useState<MaintenanceItem[]>([]);
  const [refuelings, setRefuelings] = useState<Refueling[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSelectorExpanded, setIsSelectorExpanded] = useState(false);
  const [latestFuelPrices, setLatestFuelPrices] = useState<FuelPrices | null>(null);

  // Calculadora Flex (valores globais praticados mais recentes)
  const [gasolinePrice, setGasolinePrice] = useState('5.89');
  const [ethanolPrice, setEthanolPrice] = useState('3.89');
  const [customRatio, setCustomRatio] = useState('70'); // %

  const loadData = async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. Exibe imediatamente os dados do cache local do aparelho
      const [cachedVehicles, cachedActiveId, cachedRefs, cachedMnts] = await Promise.all([
        StorageService.getCachedVehicles(),
        StorageService.getActiveVehicleId(),
        StorageService.getCachedRefuelings(),
        StorageService.getCachedMaintenances(),
      ]);
      if (cachedVehicles.length > 0) {
        setVehicles(cachedVehicles);
        setAllRefuelings(cachedRefs);
        setAllMaintenances(cachedMnts);
        let cachedTargetId = selectedVehicleId;
        if (cachedTargetId !== 'all' && !cachedVehicles.some((v) => v.id === cachedTargetId)) {
          cachedTargetId = cachedActiveId || 'all';
        } else if (!cachedTargetId) {
          cachedTargetId = cachedActiveId || 'all';
        }
        setSelectedVehicleId(cachedTargetId);
        if (cachedTargetId !== 'all') {
          const found = cachedVehicles.find((v) => v.id === cachedTargetId) || null;
          setVehicle(found);
          setRefuelings(cachedRefs.filter((r) => r.vehicleId === cachedTargetId));
          setMaintenances(cachedMnts.filter((m) => m.vehicleId === cachedTargetId));
          if (found?.flexEfficiencyRatio) {
            setCustomRatio(String(Math.round(found.flexEfficiencyRatio * 100)));
          }
        } else {
          setVehicle(null);
          setRefuelings(cachedRefs);
          setMaintenances(cachedMnts);
        }
        setLoading(false);
      }

      // 2. Sincroniza / atualiza com preservação offline
      const [vehiclesList, curActiveId, allRefs, allMnts, fuelPrices] = await Promise.all([
        StorageService.getVehicles(),
        StorageService.getActiveVehicleId(),
        StorageService.getRefuelings(),
        StorageService.getMaintenances(),
        StorageService.getLatestFuelPrices(),
      ]);
      setVehicles(vehiclesList);
      setAllRefuelings(allRefs);
      setAllMaintenances(allMnts);
      setLatestFuelPrices(fuelPrices);

      // Define os valores praticados no app a partir do documento global mais recente
      if (fuelPrices) {
        setGasolinePrice(fuelPrices.gasolina > 0 ? fuelPrices.gasolina.toFixed(2) : '5.89');
        setEthanolPrice(fuelPrices.etanol > 0 ? fuelPrices.etanol.toFixed(2) : '3.89');
      }

      // Determinar seleção ativa
      let targetId = selectedVehicleId;
      if (targetId !== 'all' && !vehiclesList.some((v) => v.id === targetId)) {
        targetId = curActiveId || 'all';
      } else if (!targetId) {
        targetId = curActiveId || 'all';
      }
      setSelectedVehicleId(targetId);

      if (targetId !== 'all') {
        const found = vehiclesList.find((v) => v.id === targetId) || null;
        setVehicle(found);
        const vRefs = allRefs.filter((r) => r.vehicleId === targetId);
        const vMnts = allMnts.filter((m) => m.vehicleId === targetId);
        setRefuelings(vRefs);
        setMaintenances(vMnts);
        if (found?.flexEfficiencyRatio) {
          setCustomRatio(String(Math.round(found.flexEfficiencyRatio * 100)));
        }
      } else {
        setVehicle(null);
        setRefuelings(allRefs);
        setMaintenances(allMnts);
      }
    } catch (e) {
      console.warn('Erro ao carregar dados de previsão:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const handleSelectVehicle = (id: string) => {
    setIsSelectorExpanded(false);
    setSelectedVehicleId(id);
    if (id !== 'all') {
      const target = vehicles.find((v) => v.id === id) || null;
      setVehicle(target);
      StorageService.setActiveVehicleId(id);
      const vRefs = allRefuelings.filter((r) => r.vehicleId === id);
      const vMnts = allMaintenances.filter((m) => m.vehicleId === id);
      setRefuelings(vRefs);
      setMaintenances(vMnts);
      // Mantém os preços globais de combustível inalterados, apenas ajusta a regra flex do veículo
      if (target?.flexEfficiencyRatio) {
        setCustomRatio(String(Math.round(target.flexEfficiencyRatio * 100)));
      }
    } else {
      setVehicle(null);
      setRefuelings(allRefuelings);
      setMaintenances(allMaintenances);
    }
  };

  const handleGasolinePriceChange = (val: string) => {
    setGasolinePrice(val);
    const num = parseFloat(val.replace(',', '.'));
    if (num > 0) {
      StorageService.saveLatestFuelPrice('gasolina', num);
    }
  };

  const handleEthanolPriceChange = (val: string) => {
    setEthanolPrice(val);
    const num = parseFloat(val.replace(',', '.'));
    if (num > 0) {
      StorageService.saveLatestFuelPrice('etanol', num);
    }
  };

  // Preços efetivos combinados para projeção
  const gasNum = parseFloat(gasolinePrice.replace(',', '.')) || 0;
  const etaNum = parseFloat(ethanolPrice.replace(',', '.')) || 0;
  const effectiveFuelPrices: FuelPrices = {
    gasolina: gasNum > 0 ? gasNum : latestFuelPrices?.gasolina || 5.89,
    etanol: etaNum > 0 ? etaNum : latestFuelPrices?.etanol || 3.89,
    diesel: latestFuelPrices?.diesel || 6.09,
    gnv: latestFuelPrices?.gnv || 4.79,
  };

  // Motor de Previsão: Cálculo Consolidado (Todos) ou Individual
  const isAllSelected = selectedVehicleId === 'all';
  const forecast: FuelForecast | null = isAllSelected
    ? vehicles.length > 0
      ? Calculations.calculateFleetForecast(vehicles, allRefuelings, allMaintenances, effectiveFuelPrices)
      : null
    : vehicle
    ? Calculations.calculateFuelForecast(vehicle, refuelings, maintenances, effectiveFuelPrices)
    : null;

  // Calculadora Flex (somente para veículo individual flex)
  const isFlex = !isAllSelected && isFlexVehicle(vehicle);
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
    accent: '#10B981', // Verde Esmeralda
    accentLight: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)',
    blue: '#3B82F6',
    blueLight: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
    purple: '#8B5CF6',
    purpleLight: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.12)',
    amber: '#F59E0B',
    amberLight: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.12)',
    red: '#EF4444',
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      {/* CABEÇALHO & SELETOR DE VEÍCULOS FIXOS NO TOPO */}
      <View style={[styles.fixedHeaderArea, { backgroundColor: theme.bg }]}>
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Previsão & Economia</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              Estimativas inteligentes com base na sua rotina de direção
            </Text>
            {loading && !refreshing && (
              <View
                style={[
                  styles.loadingBadge,
                  {
                    backgroundColor: isDark
                      ? 'rgba(16, 185, 129, 0.2)'
                      : 'rgba(16, 185, 129, 0.12)',
                  },
                ]}
              >
                <Text style={[styles.loadingBadgeText, { color: theme.accent }]}>
                  Carregando...
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* SELETOR COMPACTO DE VEÍCULOS NO TOPO (COM OPÇÃO 'TODOS OS VEÍCULOS') */}
        {!loading && vehicles.length > 0 && (
          <View
            style={[
              styles.compactSelectorCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            {isSelectorExpanded ? (
              /* MODO EXPANDIDO: LISTA VERTICAL COMPACTA */
              <View style={styles.expandedContainer}>
                <View style={styles.expandedHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="car-sport" size={14} color={theme.accent} />
                    <Text style={[styles.expandedTitle, { color: theme.text }]}>Selecionar Veículo ou Frota</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setIsSelectorExpanded(false)}
                    style={[styles.collapseBtn, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.collapseBtnText, { color: theme.textMuted }]}>Fechar</Text>
                    <Ionicons name="chevron-up" size={12} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.compactVerticalList}>
                  {/* OPÇÃO 1: TODOS OS VEÍCULOS */}
                  <TouchableOpacity
                    style={[
                      styles.compactVehicleRow,
                      {
                        backgroundColor: isAllSelected
                          ? isDark
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(16, 185, 129, 0.08)'
                          : theme.bg,
                        borderColor: isAllSelected ? theme.accent : theme.cardBorder,
                        borderWidth: isAllSelected ? 1.5 : 1,
                      },
                    ]}
                    onPress={() => {
                      handleSelectVehicle('all');
                      setIsSelectorExpanded(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.compactIconCircle,
                        {
                          backgroundColor: isAllSelected
                            ? isDark
                              ? 'rgba(16, 185, 129, 0.25)'
                              : 'rgba(16, 185, 129, 0.15)'
                            : isDark
                            ? '#1E293B'
                            : '#E2E8F0',
                        },
                      ]}
                    >
                      <Ionicons
                        name="layers-outline"
                        size={15}
                        color={isAllSelected ? theme.accent : theme.textMuted}
                      />
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          styles.compactVehicleName,
                          { color: isAllSelected ? theme.accent : theme.text },
                        ]}
                        numberOfLines={1}
                      >
                        Todos os Veículos
                      </Text>
                      <Text style={[styles.compactVehicleMeta, { color: theme.textMuted }]} numberOfLines={1}>
                        Visão consolidada da frota • {vehicles.length} veículo{vehicles.length > 1 ? 's' : ''}
                      </Text>
                    </View>

                    {isAllSelected ? (
                      <Ionicons name="checkmark-circle" size={18} color={theme.accent} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={16} color={theme.textMuted} />
                    )}
                  </TouchableOpacity>

                  {/* OPÇÕES INDIVIDUAIS: CADA VEÍCULO */}
                  {vehicles.map((v) => {
                    const isSelected = v.id === selectedVehicleId;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={[
                          styles.compactVehicleRow,
                          {
                            backgroundColor: isSelected
                              ? isDark
                                ? 'rgba(16, 185, 129, 0.12)'
                                : 'rgba(16, 185, 129, 0.08)'
                              : theme.bg,
                            borderColor: isSelected ? theme.accent : theme.cardBorder,
                            borderWidth: isSelected ? 1.5 : 1,
                          },
                        ]}
                        onPress={() => {
                          handleSelectVehicle(v.id);
                          setIsSelectorExpanded(false);
                        }}
                        activeOpacity={0.7}
                      >
                        {v.photoUrl ? (
                          <Image source={{ uri: v.photoUrl }} style={styles.compactAvatar} />
                        ) : (
                          <View
                            style={[
                              styles.compactIconCircle,
                              {
                                backgroundColor: isSelected
                                  ? isDark
                                    ? 'rgba(16, 185, 129, 0.25)'
                                    : 'rgba(16, 185, 129, 0.15)'
                                  : isDark
                                  ? '#1E293B'
                                  : '#E2E8F0',
                              },
                            ]}
                          >
                            <Ionicons
                              name={v.vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                              size={14}
                              color={isSelected ? theme.accent : theme.textMuted}
                            />
                          </View>
                        )}

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={[
                              styles.compactVehicleName,
                              { color: isSelected ? theme.accent : theme.text },
                            ]}
                            numberOfLines={1}
                          >
                            {v.name}
                          </Text>
                          <Text style={[styles.compactVehicleMeta, { color: theme.textMuted }]} numberOfLines={1}>
                            {v.plate} • {v.currentOdometer.toLocaleString('pt-BR')} km
                          </Text>
                        </View>

                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={18} color={theme.accent} />
                        ) : (
                          <Ionicons name="ellipse-outline" size={16} color={theme.textMuted} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              /* MODO COMPACTO (PADRÃO): UMA LINHA ELEGANTE */
              <TouchableOpacity
                style={styles.compactTriggerRow}
                onPress={() => setIsSelectorExpanded(true)}
                activeOpacity={0.7}
              >
                <View style={styles.compactTriggerLeft}>
                  {isAllSelected ? (
                    <View style={[styles.compactIconCircle, { backgroundColor: theme.accentLight }]}>
                      <Ionicons name="layers-outline" size={15} color={theme.accent} />
                    </View>
                  ) : vehicle?.photoUrl ? (
                    <Image source={{ uri: vehicle.photoUrl }} style={styles.compactAvatar} />
                  ) : (
                    <View style={[styles.compactIconCircle, { backgroundColor: theme.accentLight }]}>
                      <Ionicons
                        name={vehicle?.vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                        size={14}
                        color={theme.accent}
                      />
                    </View>
                  )}

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.compactVehicleName, { color: theme.text }]} numberOfLines={1}>
                      {isAllSelected ? 'Todos os Veículos' : vehicle?.name}
                    </Text>
                    <Text style={[styles.compactVehicleMeta, { color: theme.textMuted }]}>
                      {isAllSelected
                        ? `Frota consolidada • ${vehicles.length} veículo${vehicles.length > 1 ? 's' : ''}`
                        : `${vehicle?.plate} • ${vehicle?.currentOdometer.toLocaleString('pt-BR')} km`}
                    </Text>
                  </View>
                </View>

                <View style={[styles.compactSwitchBadge, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                  <Text style={[styles.compactSwitchText, { color: theme.accent }]}>
                    Trocar ({vehicles.length + 1})
                  </Text>
                  <Ionicons name="chevron-down" size={12} color={theme.accent} />
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* ÁREA ROLÁVEL COM AS INFORMAÇÕES */}
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor={theme.accent}
          />
        }
      >

        {loading && !refreshing ? (
          <View style={[styles.loadingContainer, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={[styles.loadingIconCircle, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
            <Text style={[styles.loadingTitle, { color: theme.text }]}>
              Calculando projeções financeiras...
            </Text>
            <Text style={[styles.loadingSubtitle, { color: theme.textMuted }]}>
              Aguarde enquanto analisamos consumo médio, projeções para 30 dias e calculadora flex.
            </Text>
          </View>
        ) : vehicles.length === 0 ? (
          /* ESTADO SEM VEÍCULOS */
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="car-sport-outline" size={48} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhum veículo cadastrado</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
              Cadastre um veículo na aba Garagem para visualizar projeções inteligentes de combustível e manutenções.
            </Text>
          </View>
        ) : forecast ? (
          <>
            {/* CARD MOTOR DE PREVISÃO FINANCEIRA */}
            <View style={[styles.forecastCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.forecastCardHeader}>
                <View style={styles.iconBadge}>
                  <Ionicons name="sparkles" size={20} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.forecastCardTitle, { color: theme.text }]}>
                    {isAllSelected ? 'Projeção Financeira Consolidada' : `Projeção: ${vehicle?.name}`}
                  </Text>
                  <Text style={[styles.forecastCardSub, { color: theme.textMuted }]}>
                    {isAllSelected
                      ? `Média da frota: ~${forecast.averageDailyKm} km/dia somados (${vehicles.length} veículos)`
                      : `Média calculada: ~${forecast.averageDailyKm} km/dia rodados`}
                  </Text>
                </View>
                {isAllSelected && (
                  <View style={[styles.fleetTag, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}>
                    <Text style={[styles.fleetTagText, { color: theme.accent }]}>Frota Total</Text>
                  </View>
                )}
              </View>

              {/* Total 30 dias em destaque */}
              <View style={[styles.highlightBox, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                <Text style={[styles.highlightLabel, { color: theme.textMuted }]}>
                  {isAllSelected
                    ? 'Previsão de Gasto Total Consolidado (Próximos 30 dias):'
                    : `Previsão de Gasto Total (Próximos 30 dias):`}
                </Text>
                <Text style={[styles.highlightAmount, { color: theme.accent }]}>
                  R$ {forecast.totalProjectedCost30Days.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={[styles.highlightDesc, { color: theme.textMuted }]}>
                  Inclui combustível estimado + revisões programadas no período
                </Text>
              </View>

              {/* Comparativo de Custos: 30d, 60d, 90d */}
              <Text style={[styles.subSectionTitle, { color: theme.text }]}>
                Evolução dos Custos com Combustível:
              </Text>

              <View style={styles.projectionsRow}>
                {/* 30 dias */}
                <View style={[styles.periodCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                  <Text style={[styles.periodTitle, { color: theme.textMuted }]}>30 Dias</Text>
                  <Text style={[styles.periodValue, { color: theme.text }]}>
                    R$ {forecast.projected30DaysCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text style={[styles.periodKm, { color: theme.accent }]}>
                    ~{forecast.projected30DaysKm.toLocaleString('pt-BR')} km
                  </Text>
                </View>

                {/* 60 dias */}
                <View style={[styles.periodCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                  <Text style={[styles.periodTitle, { color: theme.textMuted }]}>60 Dias</Text>
                  <Text style={[styles.periodValue, { color: theme.text }]}>
                    R$ {forecast.projected60DaysCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text style={[styles.periodKm, { color: theme.accent }]}>
                    ~{(forecast.projected30DaysKm * 2).toLocaleString('pt-BR')} km
                  </Text>
                </View>

                {/* 90 dias */}
                <View style={[styles.periodCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                  <Text style={[styles.periodTitle, { color: theme.textMuted }]}>90 Dias</Text>
                  <Text style={[styles.periodValue, { color: theme.text }]}>
                    R$ {forecast.projected90DaysCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text style={[styles.periodKm, { color: theme.accent }]}>
                    ~{(forecast.projected30DaysKm * 3).toLocaleString('pt-BR')} km
                  </Text>
                </View>
              </View>

              {/* Parâmetros do cálculo */}
              <View style={styles.paramsBox}>
                <View style={styles.paramItem}>
                  <Ionicons name="speedometer-outline" size={16} color={theme.textMuted} />
                  <Text style={[styles.paramText, { color: theme.textMuted }]}>
                    {isAllSelected ? 'Consumo Médio Ponderado: ' : 'Consumo Médio: '}
                    <Text style={{ color: theme.text, fontWeight: 'bold' }}>
                      {forecast.averageConsumptionKmPerLiter} km/L
                    </Text>
                  </Text>
                </View>
                <View style={styles.paramItem}>
                  <Ionicons name="pricetag-outline" size={16} color={theme.textMuted} />
                  <Text style={[styles.paramText, { color: theme.textMuted }]}>
                    Preço Médio/L:{' '}
                    <Text style={{ color: theme.text, fontWeight: 'bold' }}>
                      R$ {forecast.averagePricePerLiter.toFixed(2)}
                    </Text>
                  </Text>
                </View>
              </View>

              {/* DETALHAMENTO INDIVIDUAL POR VEÍCULO QUANDO "TODOS OS VEÍCULOS" ESTÁ SELECIONADO */}
              {isAllSelected && forecast.vehicleBreakdowns && forecast.vehicleBreakdowns.length > 0 && (
                <View style={styles.breakdownSection}>
                  <Text style={[styles.breakdownTitle, { color: theme.text }]}>
                    Detalhamento por Veículo (Próximos 30 dias):
                  </Text>
                  <View style={styles.breakdownList}>
                    {forecast.vehicleBreakdowns.map((b) => (
                      <View
                        key={b.vehicle.id}
                        style={[
                          styles.breakdownCard,
                          { backgroundColor: theme.bg, borderColor: theme.cardBorder },
                        ]}
                      >
                        <View style={styles.breakdownCardTop}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons
                              name={b.vehicle.vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                              size={16}
                              color={theme.accent}
                            />
                            <Text style={[styles.breakdownVehName, { color: theme.text }]}>
                              {b.vehicle.name}
                            </Text>
                            <Text style={[styles.breakdownVehPlate, { color: theme.textMuted }]}>
                              ({b.vehicle.plate})
                            </Text>
                          </View>
                          <Text style={[styles.breakdownTotal, { color: theme.accent }]}>
                            R$ {b.forecast.totalProjectedCost30Days.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </View>
                        <View style={styles.breakdownDetailsRow}>
                          <Text style={[styles.breakdownDetailText, { color: theme.textMuted }]}>
                            Combustível:{' '}
                            <Text style={{ color: theme.text, fontWeight: '600' }}>
                              R$ {b.forecast.projected30DaysCost.toFixed(2)}
                            </Text>{' '}
                            (~{b.forecast.projected30DaysKm} km)
                          </Text>
                          <Text style={[styles.breakdownDetailText, { color: theme.textMuted }]}>
                            Manutenções:{' '}
                            <Text style={{ color: theme.text, fontWeight: '600' }}>
                              R$ {b.forecast.upcomingMaintenancesCost30Days.toFixed(2)}
                            </Text>
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* CALCULADORA FLEX INTELIGENTE (EXIBIDA APENAS QUANDO O VEÍCULO ESPECÍFICO ACEITA GASOLINA E ETANOL) */}
            {isFlex && (
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
                      Análise para {vehicle?.name}: descubra qual combustível compensa mais
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
                      onChangeText={handleGasolinePriceChange}
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
                      onChangeText={handleEthanolPriceChange}
                      placeholder="3.89"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={[styles.inputGroup, { width: 85 }]}>
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
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  fixedHeaderArea: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    gap: 8,
    zIndex: 10,
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 14,
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
  // SELETOR COMPACTO DE VEÍCULOS
  compactSelectorCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  compactTriggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 36,
  },
  compactTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  compactAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0F172A',
  },
  compactIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactVehicleName: {
    fontSize: 13,
    fontWeight: '800',
  },
  compactVehicleMeta: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  compactSwitchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  compactSwitchText: {
    fontSize: 11,
    fontWeight: '700',
  },
  expandedContainer: {
    gap: 6,
    paddingVertical: 2,
  },
  expandedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  expandedTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  collapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
  },
  collapseBtnText: {
    fontSize: 10,
    fontWeight: '600',
  },
  compactVerticalList: {
    gap: 5,
  },
  compactVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 8,
  },
  loadingContainer: {
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 12,
  },
  loadingIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 290,
    lineHeight: 18,
  },
  loadingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  loadingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyCard: {
    padding: 30,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
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
  fleetTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  fleetTagText: {
    fontSize: 11,
    fontWeight: '800',
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
    fontSize: 14,
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
  breakdownSection: {
    marginTop: 4,
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.15)',
  },
  breakdownTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  breakdownList: {
    gap: 8,
  },
  breakdownCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  breakdownCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownVehName: {
    fontSize: 13,
    fontWeight: '800',
  },
  breakdownVehPlate: {
    fontSize: 11,
  },
  breakdownTotal: {
    fontSize: 14,
    fontWeight: '900',
  },
  breakdownDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  breakdownDetailText: {
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
