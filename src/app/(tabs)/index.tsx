import { useAppTheme } from '@/context/theme-context';
import { Calculations } from '@/services/calculations';
import { StorageService } from '@/services/storage';
import { SyncService } from '@/services/sync-service';
import { MaintenanceItem, Refueling, Vehicle } from '@/types/vehicle';
import { formatDateToBR } from '@/utils/date';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DashboardScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isSelectorExpanded, setIsSelectorExpanded] = useState(false);
  const [refuelings, setRefuelings] = useState<Refueling[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Sincronização e Fila Offline
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = React.useRef<any>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  React.useEffect(() => {
    const unsub = SyncService.subscribe((count) => {
      setPendingCount(count);
    });
    return () => {
      unsub();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const handleForceSync = async () => {
    if (isSyncing || pendingCount === 0) return;
    setIsSyncing(true);
    try {
      const result = await SyncService.syncNow();
      if (result.syncedCount > 0) {
        showToast('Dados enviados ao banco de dados com sucesso!');
        await loadData();
      } else if (result.errors.length > 0) {
        Alert.alert(
          'Aviso de Sincronização',
          'Não foi possível enviar todos os dados. Verifique sua conexão com a internet.'
        );
      }
    } catch {
      Alert.alert('Erro', 'Ocorreu um erro ao sincronizar com o banco de dados.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Modal para atualizar odômetro rápido
  const [odometerModalVisible, setOdometerModalVisible] = useState(false);
  const [newOdometerInput, setNewOdometerInput] = useState('');
  const [savingOdometer, setSavingOdometer] = useState(false);

  const loadData = async (preserveVehicleId?: string) => {
    try {
      await StorageService.init();
      const [allVehicles, activeVehId] = await Promise.all([
        StorageService.getVehicles(),
        StorageService.getActiveVehicleId(),
      ]);
      setVehicles(allVehicles);

      const targetId = preserveVehicleId || vehicle?.id || activeVehId;
      let currentVehicle: Vehicle | null = null;

      if (targetId && allVehicles.some((v) => v.id === targetId)) {
        currentVehicle = allVehicles.find((v) => v.id === targetId) || null;
      } else {
        currentVehicle = allVehicles.find((v) => v.id === activeVehId) || allVehicles[0] || null;
      }

      setVehicle(currentVehicle);

      if (currentVehicle) {
        const [refData, mainData] = await Promise.all([
          StorageService.getRefuelings(currentVehicle.id),
          StorageService.getMaintenances(currentVehicle.id),
        ]);
        setRefuelings(refData);
        setMaintenances(mainData);
        setNewOdometerInput(String(currentVehicle.currentOdometer));
      } else {
        setRefuelings([]);
        setMaintenances([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVehicle = async (targetVehicle: Vehicle) => {
    if (vehicle?.id === targetVehicle.id) return;
    setVehicle(targetVehicle);
    setNewOdometerInput(String(targetVehicle.currentOdometer));
    await StorageService.setActiveVehicleId(targetVehicle.id);

    try {
      const [refData, mainData] = await Promise.all([
        StorageService.getRefuelings(targetVehicle.id),
        StorageService.getMaintenances(targetVehicle.id),
      ]);
      setRefuelings(refData);
      setMaintenances(mainData);
    } catch (e) {
      console.error('Erro ao alternar veículo no painel:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleUpdateOdometer = async () => {
    if (!vehicle || savingOdometer) return;
    const km = parseInt(newOdometerInput, 10);
    if (isNaN(km) || km < vehicle.currentOdometer) {
      Alert.alert(
        'Atenção',
        `O odômetro deve ser um número válido e maior ou igual ao atual (${vehicle.currentOdometer.toLocaleString('pt-BR')} km).`
      );
      return;
    }
    setSavingOdometer(true);
    try {
      const updated = { ...vehicle, currentOdometer: km };
      await StorageService.saveVehicle(updated);
      setVehicle(updated);
      setVehicles((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      setOdometerModalVisible(false);
      await loadData(updated.id);
    } catch (err) {
      console.error('Erro ao atualizar odômetro:', err);
      Alert.alert('Erro', 'Não foi possível atualizar o odômetro. Tente novamente.');
    } finally {
      setSavingOdometer(false);
    }
  };

  const stats = vehicle
    ? Calculations.getVehicleStats(vehicle, refuelings, maintenances)
    : null;
  const alerts = vehicle
    ? Calculations.getMaintenanceAlerts(vehicle.currentOdometer, maintenances, vehicle)
    : [];
  const forecast = vehicle
    ? Calculations.calculateFuelForecast(vehicle, refuelings, maintenances)
    : null;

  const urgentAlerts = alerts.filter(
    (a) => a.status === 'vencido' || a.status === 'alerta' || a.status === 'atencao' || a.status === 'proximo'
  );
  const lastRefueling = refuelings[0];

  const theme = {
    bg: isDark ? '#090D16' : '#F8FAFC',
    card: isDark ? '#141D2E' : '#FFFFFF',
    cardBorder: isDark ? '#1E2D44' : '#E2E8F0',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    accent: '#10B981', // Verde Esmeralda
    accentLight: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
    blue: '#3B82F6',
    amber: '#F59E0B',
    amberLight: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
    red: '#EF4444',
    redLight: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      {/* TOAST DE NOTIFICAÇÃO DA SINCRONIZAÇÃO */}
      {toastMessage && (
        <View style={styles.toastContainer} pointerEvents="none">
          <View style={[styles.toastCard, { backgroundColor: '#059669' }]}>
            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      )}

      {/* TOPO FIXO: CABEÇALHO SUPERIOR & SELETOR DE VEÍCULOS */}
      <View style={[styles.fixedHeaderArea, { backgroundColor: theme.bg }]}>
        {/* HEADER SUPERIOR */}
        <View style={styles.header}>
          <View style={{ flex: 1, marginRight: 6 }}>
            <Text style={[styles.brandTitle, { color: theme.accent }]}>ContaGiro</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={[styles.brandSubtitle, { color: theme.textMuted }]}>
                Controle Inteligente
              </Text>
              {loading && (
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

          <View style={styles.headerActionsRow}>
            {/* AVISO / BOTÃO DE SINCRONIZAÇÃO (AO LADO ESQUERDO DO BOTÃO GARAGEM) */}
            {pendingCount > 0 ? (
              <TouchableOpacity
                style={[
                  styles.syncNoticeBtn,
                  {
                    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
                    borderColor: '#F59E0B',
                  },
                ]}
                onPress={handleForceSync}
                disabled={isSyncing}
                activeOpacity={0.7}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#D97706" />
                ) : (
                  <Ionicons name="cloud-upload" size={15} color="#D97706" />
                )}
                <Text style={[styles.syncNoticeText, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                  {isSyncing ? 'Enviando...' : `Sincronizar (${pendingCount})`}
                </Text>
              </TouchableOpacity>
            ) : (
              <View
                style={[
                  styles.syncNoticeBadge,
                  {
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
                    borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
                  },
                ]}
              >
                <Ionicons name="cloud-done" size={14} color="#10B981" />
                <Text style={[styles.syncNoticeText, { color: isDark ? '#34D399' : '#059669' }]}>
                  Sincronizado
                </Text>
              </View>
            )}

            {/* BOTÃO GARAGEM */}
            <TouchableOpacity
              style={[styles.garageBtn, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
              onPress={() => router.push('/garagem')}
            >
              <Ionicons name="car-sport" size={18} color={theme.accent} />
              <Text style={[styles.garageBtnText, { color: theme.text }]}>Garagem</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SELETOR COMPACTO DE VEÍCULOS (FIXO NO TOPO) */}
        {!loading && vehicle && (
          vehicles.length > 1 ? (
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
                      <Text style={[styles.expandedTitle, { color: theme.text }]}>Selecionar Veículo</Text>
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
                    {vehicles.map((v) => {
                      const isSelected = v.id === vehicle.id;
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
                            handleSelectVehicle(v);
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
                    {vehicle.photoUrl ? (
                      <Image source={{ uri: vehicle.photoUrl }} style={styles.compactAvatar} />
                    ) : (
                      <View style={[styles.compactIconCircle, { backgroundColor: theme.accentLight }]}>
                        <Ionicons
                          name={vehicle.vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                          size={14}
                          color={theme.accent}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.compactVehicleName, { color: theme.text }]} numberOfLines={1}>
                        {vehicle.name}
                      </Text>
                      <Text style={[styles.compactVehicleMeta, { color: theme.textMuted }]}>
                        {vehicle.plate} • {vehicle.currentOdometer.toLocaleString('pt-BR')} km
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.compactSwitchBadge, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                    <Text style={[styles.compactSwitchText, { color: theme.accent }]}>
                      Trocar ({vehicles.length})
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={theme.accent} />
                  </View>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* APENAS 1 VEÍCULO CADASTRADO: BARRA SLIM */
            <View style={[styles.singleVehicleSlimBar, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              {vehicle.photoUrl ? (
                <Image source={{ uri: vehicle.photoUrl }} style={styles.compactAvatar} />
              ) : (
                <View style={[styles.compactIconCircle, { backgroundColor: theme.accentLight }]}>
                  <Ionicons
                    name={vehicle.vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                    size={14}
                    color={theme.accent}
                  />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.compactVehicleName, { color: theme.text }]} numberOfLines={1}>
                  {vehicle.name}
                </Text>
                <Text style={[styles.compactVehicleMeta, { color: theme.textMuted }]}>
                  {vehicle.model} • {vehicle.plate}
                </Text>
              </View>
              <View style={styles.singleVehicleKmBadge}>
                <Ionicons name="speedometer-outline" size={11} color={theme.textMuted} />
                <Text style={[styles.singleVehicleKmText, { color: theme.textMuted }]}>
                  {vehicle.currentOdometer.toLocaleString('pt-BR')} km
                </Text>
              </View>
            </View>
          )
        )}
      </View>

      {/* ÁREA ROLÁVEL COM AS INFORMAÇÕES */}
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={[styles.loadingContainer, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={[styles.loadingIconCircle, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
            <Text style={[styles.loadingTitle, { color: theme.text }]}>
              Carregando informações do veículo...
            </Text>
            <Text style={[styles.loadingSubtitle, { color: theme.textMuted }]}>
              Aguarde enquanto sincronizamos consumo, odômetro, previsões e alertas.
            </Text>
          </View>
        ) : vehicle ? (
          <>

            {/* CARD DE ATUALIZAÇÃO DO ODÔMETRO (SEM REDUNDÂNCIAS) */}
            <TouchableOpacity
              style={[styles.odometerCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
              onPress={() => setOdometerModalVisible(true)}
              activeOpacity={0.7}
            >
              <View style={styles.odometerCardLeft}>
                <View style={[styles.odometerIconCircle, { backgroundColor: theme.accentLight }]}>
                  <Ionicons name="speedometer" size={20} color={theme.accent} />
                </View>
                <View>
                  <Text style={[styles.odometerCardLabel, { color: theme.textMuted }]}>
                    Odômetro Atual
                  </Text>
                  <Text style={[styles.odometerCardValue, { color: theme.text }]}>
                    {vehicle.currentOdometer.toLocaleString('pt-BR')}{' '}
                    <Text style={styles.odometerCardUnit}>km</Text>
                  </Text>
                </View>
              </View>

              <View style={[styles.odometerCardAction, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                <Ionicons name="pencil" size={13} color={theme.accent} />
                <Text style={[styles.odometerCardActionText, { color: theme.accent }]}>Atualizar</Text>
              </View>
            </TouchableOpacity>

            {/* ATALHOS RÁPIDOS (ABASTECER, MANUTENÇÃO, CALC FLEX) */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                onPress={() => router.push('/abastecimentos')}
              >
                <Ionicons name="water" size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>+ Abastecer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
                onPress={() => router.push('/manutencoes')}
              >
                <Ionicons name="build" size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>+ Manutenção</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#8B5CF6' }]}
                onPress={() => router.push('/previsao')}
              >
                <Ionicons name="calculator" size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Calc. Flex</Text>
              </TouchableOpacity>
            </View>

            {/* MÉTRICAS PRINCIPAIS (GAUGES & MÉDIAS) */}
            {stats && (
              <View style={styles.metricsGrid}>
                {/* Card Média Consumo */}
                <View style={[styles.metricCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                  <View style={styles.metricHeader}>
                    <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Média de Consumo</Text>
                    <View style={[styles.iconCircle, { backgroundColor: theme.accentLight }]}>
                      <Ionicons name="leaf-outline" size={16} color={theme.accent} />
                    </View>
                  </View>
                  <Text style={[styles.metricBigValue, { color: theme.accent }]}>
                    {stats.averageConsumption} <Text style={styles.metricUnit}>km/L</Text>
                  </Text>
                  <Text style={[styles.metricSub, { color: theme.textMuted }]}>
                    {stats.bestConsumption ? `Melhor: ${stats.bestConsumption} km/L` : 'Baseado em tanques cheios'}
                  </Text>
                </View>

                {/* Card Custo por KM */}
                <View style={[styles.metricCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                  <View style={styles.metricHeader}>
                    <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Custo Médio / km</Text>
                    <View style={[styles.iconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                      <Ionicons name="cash-outline" size={16} color={theme.blue} />
                    </View>
                  </View>
                  <Text style={[styles.metricBigValue, { color: theme.blue }]}>
                    R$ {stats.averageCostPerKm.toFixed(2)} <Text style={styles.metricUnit}>/km</Text>
                  </Text>
                  <Text style={[styles.metricSub, { color: theme.textMuted }]}>
                    Combustível rodado
                  </Text>
                </View>
              </View>
            )}

            {/* ALERTA DE PREVISÃO INTELIGENTE */}
            {forecast && (
              <TouchableOpacity
                style={[styles.forecastBanner, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                onPress={() => router.push('/previsao')}
              >
                <View style={styles.forecastHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="trending-up" size={20} color="#10B981" />
                    <Text style={[styles.forecastTitle, { color: theme.text }]}>Previsão para 30 Dias</Text>
                  </View>
                  <View style={styles.tagBadge}>
                    <Text style={styles.tagBadgeText}>~{forecast.averageDailyKm} km/dia</Text>
                  </View>
                </View>
                <View style={styles.forecastRow}>
                  <View>
                    <Text style={[styles.forecastLabel, { color: theme.textMuted }]}>Custo Estimado Total:</Text>
                    <Text style={[styles.forecastAmount, { color: theme.accent }]}>
                      R$ {forecast.totalProjectedCost30Days.toFixed(2)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.forecastLabel, { color: theme.textMuted }]}>Combustível:</Text>
                    <Text style={[styles.forecastSubAmount, { color: theme.text }]}>
                      R$ {forecast.projected30DaysCost.toFixed(2)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {/* ALERTAS PREVENTIVOS URGENTES */}
            {urgentAlerts.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Alertas de Revisão</Text>
                  <TouchableOpacity onPress={() => router.push('/manutencoes')}>
                    <Text style={[styles.sectionLink, { color: theme.accent }]}>Ver todas</Text>
                  </TouchableOpacity>
                </View>

                {urgentAlerts.slice(0, 2).map((alert, index) => {
                  const isVencido = alert.status === 'vencido';
                  const isAlerta = alert.status === 'alerta';
                  const isRed = isVencido || isAlerta;
                  return (
                    <View
                      key={index}
                      style={[
                        styles.alertCard,
                        {
                          backgroundColor: isRed ? theme.redLight : theme.amberLight,
                          borderColor: isRed ? theme.red : theme.amber,
                        },
                      ]}
                    >
                      <Ionicons
                        name={isRed ? 'alert-circle' : 'warning-outline'}
                        size={22}
                        color={isRed ? theme.red : theme.amber}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.alertTitle, { color: theme.text }]}>{alert.title}</Text>
                        <Text style={[styles.alertDesc, { color: theme.textMuted }]}>
                          {isVencido
                            ? `Atrasado há ${Math.abs(alert.kmRemaining || 0).toLocaleString('pt-BR')} km!`
                            : isAlerta
                              ? `Alerta: faltam apenas ${alert.kmRemaining?.toLocaleString('pt-BR')} km`
                              : `Atenção: faltam ${alert.kmRemaining?.toLocaleString('pt-BR')} km`}
                        </Text>
                      </View>
                      <Text style={[styles.alertCost, { color: theme.text }]}>
                        ~R$ {alert.estimatedCost}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ÚLTIMO ABASTECIMENTO REGISTRADO */}
            {lastRefueling && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Último Abastecimento</Text>
                  <TouchableOpacity onPress={() => router.push('/abastecimentos')}>
                    <Text style={[styles.sectionLink, { color: theme.accent }]}>Histórico</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.historyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                  <View style={styles.historyRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[styles.fuelIconBadge, { backgroundColor: theme.accentLight }]}>
                        <Ionicons name="water" size={18} color={theme.accent} />
                      </View>
                      <View>
                        <Text style={[styles.historyTitle, { color: theme.text }]}>
                          {lastRefueling.fuelType.toUpperCase()} • {lastRefueling.liters.toFixed(2)} L
                        </Text>
                        <Text style={[styles.historySubtitle, { color: theme.textMuted }]}>
                          {formatDateToBR(lastRefueling.date)} • {lastRefueling.odometer.toLocaleString('pt-BR')} km
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.historyAmount, { color: theme.text }]}>
                        R$ {lastRefueling.totalAmount.toFixed(2)}
                      </Text>
                      {lastRefueling.consumptionKmPerLiter && (
                        <Text style={[styles.historyKmPerLiter, { color: theme.accent }]}>
                          {lastRefueling.consumptionKmPerLiter} km/L
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="car-sport-outline" size={52} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhum veículo ativo</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
              Cadastre ou selecione um veículo na Garagem para começar a monitorar seus abastecimentos e manutenções.
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: theme.accent }]}
              onPress={() => router.push('/garagem')}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.emptyBtnText}>Ir para a Garagem</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* MODAL PARA ATUALIZAR ODÔMETRO */}
      <Modal visible={odometerModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Atualizar Odômetro</Text>
            <Text style={[styles.modalDesc, { color: theme.textMuted }]}>
              Insira a quilometragem atual do painel do seu veículo para atualizar as previsões e alertas:
            </Text>

            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
              keyboardType="numeric"
              value={newOdometerInput}
              onChangeText={setNewOdometerInput}
              placeholder="Ex: 38450"
              placeholderTextColor={theme.textMuted}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtnCancel, { borderColor: theme.cardBorder, opacity: savingOdometer ? 0.5 : 1 }]}
                disabled={savingOdometer}
                onPress={() => !savingOdometer && setOdometerModalVisible(false)}
              >
                <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtnConfirm,
                  {
                    backgroundColor: theme.accent,
                    opacity: savingOdometer ? 0.7 : 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  },
                ]}
                disabled={savingOdometer}
                onPress={handleUpdateOdometer}
              >
                {savingOdometer ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Salvando...</Text>
                  </>
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 8,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncNoticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  syncNoticeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  syncNoticeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  garageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  garageBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  vehicleCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  vehicleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vehicleIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehiclePhotoAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  vehicleName: {
    fontSize: 18,
    fontWeight: '800',
  },
  vehicleModel: {
    fontSize: 12,
    marginTop: 2,
  },
  plateBadge: {
    backgroundColor: '#0F172A',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  plateText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  // CARD DE ODÔMETRO (ATUALIZAÇÃO RÁPIDA)
  odometerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  odometerCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  odometerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  odometerCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  odometerCardValue: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 1,
  },
  odometerCardUnit: {
    fontSize: 12,
    fontWeight: '600',
  },
  odometerCardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  odometerCardActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  // VEÍCULO ÚNICO
  singleVehicleCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  singleVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  singleVehicleAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  singleVehicleIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  singleVehicleName: {
    fontSize: 16,
    fontWeight: '800',
  },
  singleVehicleModel: {
    fontSize: 12,
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricBigValue: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  metricUnit: {
    fontSize: 13,
    fontWeight: '600',
  },
  metricSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  forecastBanner: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
  },
  forecastHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forecastTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  tagBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  tagBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  forecastRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  forecastLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  forecastAmount: {
    fontSize: 22,
    fontWeight: '900',
  },
  forecastSubAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionContainer: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  alertDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  alertCost: {
    fontSize: 13,
    fontWeight: '800',
  },
  historyCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fuelIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  historySubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  historyKmPerLiter: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  modalBtnCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalBtnConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
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
  // ÁREA SUPERIOR FIXA
  fixedHeaderArea: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    gap: 8,
    zIndex: 10,
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
  singleVehicleSlimBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  singleVehicleKmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  singleVehicleKmText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyCard: {
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    marginTop: 6,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
