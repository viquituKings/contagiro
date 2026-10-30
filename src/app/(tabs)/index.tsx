import { ConsumptionBarChart, ProportionDonutChart } from '@/components/dashboard-charts';
import { useAppTheme } from '@/context/theme-context';
import { Calculations } from '@/services/calculations';
import { NotificationService } from '@/services/notifications';
import { StorageService } from '@/services/storage';
import { SyncService } from '@/services/sync-service';
import { MaintenanceItem, Refueling, Vehicle } from '@/types/vehicle';
import { formatDateToBR } from '@/utils/date';
import { formatEngineDisplacement } from '@/utils/engine';
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
  const toastTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const online = await StorageService.checkOnlineStatus(true);
      if (!online) {
        Alert.alert(
          'Sem Conexão',
          'Você ainda está offline. Seus dados estão seguros no aparelho e poderão ser sincronizados assim que houver conexão com a internet.'
        );
        return;
      }

      const result = await SyncService.syncNow();
      if (result.syncedCount > 0) {
        showToast('Dados sincronizados com a nuvem com sucesso!');
        await StorageService.preloadOfflineData(true);
        await loadData();
      } else if (result.errors.length > 0) {
        Alert.alert(
          'Aviso de Sincronização',
          'Não foi possível enviar todos os dados. Verifique sua conexão com a internet e tente novamente.'
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
      SyncService.getPendingCount().then(setPendingCount).catch(() => { });

      // 1. Carrega primeiro do cache local do aparelho para exibição instantânea (especialmente offline)
      const [cachedVehicles, activeVehId] = await Promise.all([
        StorageService.getCachedVehicles(),
        StorageService.getActiveVehicleId(),
      ]);

      if (cachedVehicles.length > 0) {
        setVehicles(cachedVehicles);
        const targetCachedId = preserveVehicleId || vehicle?.id || activeVehId;
        const currentCachedVehicle =
          cachedVehicles.find((v) => v.id === targetCachedId) ||
          cachedVehicles.find((v) => v.id === activeVehId) ||
          cachedVehicles[0] ||
          null;

        if (currentCachedVehicle) {
          setVehicle(currentCachedVehicle);
          setNewOdometerInput(String(currentCachedVehicle.currentOdometer));
          const [cachedRefs, cachedMnts] = await Promise.all([
            StorageService.getCachedRefuelings(currentCachedVehicle.id),
            StorageService.getCachedMaintenances(currentCachedVehicle.id),
          ]);
          setRefuelings(cachedRefs);
          setMaintenances(cachedMnts);
          setLoading(false);
        }
      }

      // 2. Sincroniza/atualiza com o StorageService (que preserva dados offline e atualiza o cache de 5 registros e totalizadores)
      await StorageService.init();
      const [allVehicles, latestActiveId] = await Promise.all([
        StorageService.getVehicles(),
        StorageService.getActiveVehicleId(),
      ]);
      setVehicles(allVehicles);

      const targetId = preserveVehicleId || vehicle?.id || latestActiveId;
      let currentVehicle: Vehicle | null = null;

      if (targetId && allVehicles.some((v) => v.id === targetId)) {
        currentVehicle = allVehicles.find((v) => v.id === targetId) || null;
      } else {
        currentVehicle =
          allVehicles.find((v) => v.id === latestActiveId) || allVehicles[0] || null;
      }

      setVehicle(currentVehicle);

      if (currentVehicle) {
        const [refData, mainData] = await Promise.all([
          StorageService.getRefuelings(currentVehicle.id),
          StorageService.getMaintenances(currentVehicle.id),
        ]);
        // Recarrega o veículo atualizado com os totalizadores calculados
        const refreshedVehicles = await StorageService.getCachedVehicles();
        const refreshedCurrent =
          refreshedVehicles.find((v) => v.id === currentVehicle?.id) || currentVehicle;
        setVehicles(refreshedVehicles);
        setVehicle(refreshedCurrent);
        setRefuelings(refData);
        setMaintenances(mainData);
        setNewOdometerInput(String(refreshedCurrent.currentOdometer));
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
      // Exibe imediatamente os 5 últimos do cache local do veículo selecionado
      const [cachedRefs, cachedMnts] = await Promise.all([
        StorageService.getCachedRefuelings(targetVehicle.id),
        StorageService.getCachedMaintenances(targetVehicle.id),
      ]);
      setRefuelings(cachedRefs);
      setMaintenances(cachedMnts);

      // E atualiza com o banco se estiver online
      const [refData, mainData] = await Promise.all([
        StorageService.getRefuelings(targetVehicle.id),
        StorageService.getMaintenances(targetVehicle.id),
      ]);
      const refreshedVehicles = await StorageService.getCachedVehicles();
      const refreshedTarget =
        refreshedVehicles.find((v) => v.id === targetVehicle.id) || targetVehicle;
      setVehicles(refreshedVehicles);
      setVehicle(refreshedTarget);
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
      NotificationService.syncMaintenanceNotifications().catch(() => { });
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
    (a) =>
      a.status === 'vencido' ||
      a.status === 'alerta' ||
      a.status === 'atencao' ||
      a.status === 'proximo'
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
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safeArea, { backgroundColor: theme.bg }]}
    >
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
              style={[
                styles.garageBtn,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
              onPress={() => router.push('/garagem')}
            >
              <Ionicons name="car-sport" size={18} color={theme.accent} />
              <Text style={[styles.garageBtnText, { color: theme.text }]}>Garagem</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* AVISO DE DADOS OFFLINE PENDENTES DE SINCRONIZAÇÃO COM A NUVEM */}
        {pendingCount > 0 && (
          <TouchableOpacity
            style={[
              styles.offlinePendingBanner,
              {
                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
                borderColor: '#F59E0B',
              },
            ]}
            onPress={handleForceSync}
            disabled={isSyncing}
            activeOpacity={0.8}
          >
            <View style={styles.offlinePendingIconBox}>
              {isSyncing ? (
                <ActivityIndicator size="small" color="#D97706" />
              ) : (
                <Ionicons name="cloud-offline-outline" size={18} color="#D97706" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.offlinePendingTitle,
                  { color: isDark ? '#FBBF24' : '#92400E' },
                ]}
              >
                {pendingCount === 1
                  ? 'Existe 1 registro salvo offline aguardando sincronização'
                  : `Existem ${pendingCount} registros salvos offline aguardando sincronização`}
              </Text>
              <Text
                style={[
                  styles.offlinePendingSubtitle,
                  { color: isDark ? '#FDE68A' : '#B45309' },
                ]}
              >
                Toque aqui ou no botão &quot;Sincronizar&quot; acima quando estiver conectado à internet.
              </Text>
            </View>
            <Ionicons
              name="sync-circle"
              size={22}
              color={isDark ? '#FBBF24' : '#D97706'}
            />
          </TouchableOpacity>
        )}

        {/* SELETOR COMPACTO DE VEÍCULOS (FIXO NO TOPO) */}
        {!loading &&
          vehicle &&
          (vehicles.length > 1 ? (
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
                      <Text style={[styles.expandedTitle, { color: theme.text }]}>
                        Selecionar Veículo
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setIsSelectorExpanded(false)}
                      style={[
                        styles.collapseBtn,
                        { backgroundColor: theme.bg, borderColor: theme.cardBorder },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.collapseBtnText, { color: theme.textMuted }]}>
                        Fechar
                      </Text>
                      <Ionicons name="chevron-up" size={12} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.compactVerticalList}>
                    {vehicles.map((v, index) => {
                      const isSelected = v.id === vehicle.id;
                      const isPreferred = v.isPreferred || index === 0;
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
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <Text
                                style={[
                                  styles.compactVehicleName,
                                  { color: isSelected ? theme.accent : theme.text },
                                ]}
                                numberOfLines={1}
                              >
                                {v.name}
                              </Text>
                              {isPreferred && (
                                <Ionicons name="star" size={12} color="#F59E0B" />
                              )}
                            </View>
                            <Text
                              style={[styles.compactVehicleMeta, { color: theme.textMuted }]}
                              numberOfLines={1}
                            >
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
                      <View
                        style={[
                          styles.compactIconCircle,
                          { backgroundColor: theme.accentLight },
                        ]}
                      >
                        <Ionicons
                          name={vehicle.vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                          size={14}
                          color={theme.accent}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Text
                          style={[styles.compactVehicleName, { color: theme.text }]}
                          numberOfLines={1}
                        >
                          {vehicle.name}
                        </Text>
                        {(vehicle.isPreferred || vehicles[0]?.id === vehicle.id) && (
                          <Ionicons name="star" size={12} color="#F59E0B" />
                        )}
                      </View>
                      <Text style={[styles.compactVehicleMeta, { color: theme.textMuted }]}>
                        {vehicle.plate} • {vehicle.currentOdometer.toLocaleString('pt-BR')} km
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.compactSwitchBadge,
                      { backgroundColor: theme.bg, borderColor: theme.cardBorder },
                    ]}
                  >
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
            <View
              style={[
                styles.singleVehicleSlimBar,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
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
                <Text
                  style={[styles.compactVehicleName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {vehicle.name}
                </Text>
                <Text style={[styles.compactVehicleMeta, { color: theme.textMuted }]}>
                  {vehicle.model} • {vehicle.plate}{vehicle.engineDisplacement ? ` • ${formatEngineDisplacement(vehicle.engineDisplacement)}` : ''}
                </Text>
              </View>
              <View style={styles.singleVehicleKmBadge}>
                <Ionicons name="speedometer-outline" size={11} color={theme.textMuted} />
                <Text style={[styles.singleVehicleKmText, { color: theme.textMuted }]}>
                  {vehicle.currentOdometer.toLocaleString('pt-BR')} km
                </Text>
              </View>
            </View>
          ))}
      </View>

      {/* ÁREA ROLÁVEL COM AS INFORMAÇÕES */}
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View
            style={[
              styles.loadingContainer,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <View
              style={[
                styles.loadingIconCircle,
                {
                  backgroundColor: isDark
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(16, 185, 129, 0.1)',
                },
              ]}
            >
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
            {/* CARD DE ATUALIZAÇÃO DO ODÔMETRO */}
            <TouchableOpacity
              style={[
                styles.odometerCard,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
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

              <View
                style={[
                  styles.odometerCardAction,
                  { backgroundColor: theme.bg, borderColor: theme.cardBorder },
                ]}
              >
                <Ionicons name="pencil" size={13} color={theme.accent} />
                <Text style={[styles.odometerCardActionText, { color: theme.accent }]}>
                  Atualizar
                </Text>
              </View>
            </TouchableOpacity>

            {/* ATALHOS RÁPIDOS (ABASTECER, MANUTENÇÃO, CALC FLEX) */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#8B5CF6' }]}
                onPress={() => router.push('/previsao')}
              >
                <Ionicons name="calculator" size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Calc. Flex</Text>
              </TouchableOpacity>
            </View>

            {/* DASHBOARD: MÉTRICAS, TOTALIZADORES E GRÁFICOS (ONLINE E OFFLINE) */}
            {stats && (
              <>
                {/* 1. CARD MÉDIA DE CONSUMO (GRÁFICO DE BARRAS VERTICAIS COMPARATIVO) */}
                <View
                  style={[
                    styles.dashboardCard,
                    { backgroundColor: theme.card, borderColor: theme.cardBorder },
                  ]}
                >
                  <View style={styles.metricHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[styles.iconCircle, { backgroundColor: theme.accentLight }]}>
                        <Ionicons name="leaf-outline" size={16} color={theme.accent} />
                      </View>
                      <View>
                        <Text style={[styles.metricLabel, { color: theme.textMuted }]}>
                          Média de Consumo
                        </Text>
                        <Text style={[styles.metricSub, { color: theme.textMuted }]}>
                          {stats.bestConsumption
                            ? `Melhor: ${stats.bestConsumption} km/L`
                            : stats.averageConsumption > 0
                              ? 'Baseado em tanques cheios'
                              : 'Aguardando 2º abastecimento'}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.metricBigValue,
                        {
                          color: stats.averageConsumption > 0 ? theme.accent : theme.textMuted,
                          fontSize: stats.averageConsumption > 0 ? 20 : 16,
                        },
                      ]}
                    >
                      {stats.averageConsumption > 0 ? (
                        <>
                          {stats.averageConsumption} <Text style={styles.metricUnit}>km/L</Text>
                        </>
                      ) : (
                        'Sem média'
                      )}
                    </Text>
                  </View>

                  {stats.averageConsumption === 0 && (
                    <View
                      style={[
                        styles.noticeBanner,
                        {
                          backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
                          borderColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FCD34D',
                        },
                      ]}
                    >
                      <Ionicons name="information-circle-outline" size={16} color="#D97706" />
                      <Text style={[styles.noticeBannerText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                        Por não ter um segundo abastecimento, este veículo ainda não possui média calculada.
                      </Text>
                    </View>
                  )}

                  {/* Gráfico de barras verticais: relação do veículo selecionado com os demais */}
                  <ConsumptionBarChart
                    vehicles={vehicles}
                    activeVehicleId={vehicle.id}
                    activeConsumption={stats.averageConsumption}
                    bestConsumption={stats.bestConsumption ?? undefined}
                    theme={theme}
                    isDark={isDark}
                  />
                </View>

                {/* 2. CARD CUSTO MÉDIO / KM (GRÁFICO DE PIZZA / DONUT) */}
                <View
                  style={[
                    styles.dashboardCard,
                    { backgroundColor: theme.card, borderColor: theme.cardBorder },
                  ]}
                >
                  <View style={styles.metricHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View
                        style={[
                          styles.iconCircle,
                          { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
                        ]}
                      >
                        <Ionicons name="cash-outline" size={16} color={theme.blue} />
                      </View>
                      <View>
                        <Text style={[styles.metricLabel, { color: theme.textMuted }]}>
                          Custo Médio / km
                        </Text>
                        <Text style={[styles.metricSub, { color: theme.textMuted }]}>
                          {stats.averageCostPerKm > 0
                            ? 'Combustível rodado'
                            : 'Aguardando 2º abastecimento'}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.metricBigValue,
                        {
                          color: stats.averageCostPerKm > 0 ? theme.blue : theme.textMuted,
                          fontSize: stats.averageCostPerKm > 0 ? 20 : 16,
                        },
                      ]}
                    >
                      {stats.averageCostPerKm > 0 ? (
                        <>
                          R$ {stats.averageCostPerKm.toFixed(2)}{' '}
                          <Text style={styles.metricUnit}>/km</Text>
                        </>
                      ) : (
                        'Sem média'
                      )}
                    </Text>
                  </View>

                  {/* Gráfico de pizza / donut: fatia do custo médio na frota */}
                  <ProportionDonutChart
                    vehicles={vehicles}
                    activeVehicleId={vehicle.id}
                    activeValue={stats.averageCostPerKm}
                    valueType="cost"
                    activeColor="#3B82F6"
                    theme={theme}
                    isDark={isDark}
                  />
                </View>

                {/* 3. CARD TOTAL ABASTECIDO */}
                <TouchableOpacity
                  style={[
                    styles.dashboardCard,
                    { backgroundColor: theme.card, borderColor: theme.cardBorder },
                  ]}
                  onPress={() => router.push('/abastecimentos')}
                  activeOpacity={0.75}
                >
                  <View style={styles.metricHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[styles.iconCircle, { backgroundColor: theme.accentLight }]}>
                        <Ionicons name="water-outline" size={16} color={theme.accent} />
                      </View>
                      <View>
                        <Text style={[styles.metricLabel, { color: theme.textMuted }]}>
                          Total Abastecido
                        </Text>
                        <Text style={[styles.metricSub, { color: theme.textMuted }]}>
                          {stats.totalLiters.toFixed(1)} L em {stats.refuelingsCount} abastecimento(s)
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.metricBigValue, { color: theme.text }]}>
                      R$ {stats.totalFuelSpent.toFixed(2)}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* 4. CARD GASTO COM MANUTENÇÃO (GRÁFICO DE PIZZA / DONUT) */}
                <TouchableOpacity
                  style={[
                    styles.dashboardCard,
                    { backgroundColor: theme.card, borderColor: theme.cardBorder },
                  ]}
                  onPress={() => router.push('/manutencoes')}
                  activeOpacity={0.75}
                >
                  <View style={styles.metricHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[styles.iconCircle, { backgroundColor: theme.amberLight }]}>
                        <Ionicons name="construct-outline" size={16} color={theme.amber} />
                      </View>
                      <View>
                        <Text style={[styles.metricLabel, { color: theme.textMuted }]}>
                          Gasto em Manutenção
                        </Text>
                        <Text style={[styles.metricSub, { color: theme.textMuted }]}>
                          {stats.maintenancesCount} serviço(s) registrado(s)
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.metricBigValue, { color: theme.amber }]}>
                      R$ {stats.totalMaintenanceSpent.toFixed(2)}
                    </Text>
                  </View>

                  {/* Gráfico de pizza / donut: fatia do gasto em manutenção na frota */}
                  <ProportionDonutChart
                    vehicles={vehicles}
                    activeVehicleId={vehicle.id}
                    activeValue={stats.totalMaintenanceSpent}
                    valueType="maintenance"
                    activeColor="#F59E0B"
                    theme={theme}
                    isDark={isDark}
                  />
                </TouchableOpacity>
              </>
            )}

            {/* ALERTA DE PREVISÃO INTELIGENTE */}
            {forecast && (
              <TouchableOpacity
                style={[
                  styles.forecastBanner,
                  { backgroundColor: theme.card, borderColor: theme.cardBorder },
                ]}
                onPress={() => router.push('/previsao')}
              >
                <View style={styles.forecastHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons
                      name="trending-up"
                      size={20}
                      color={forecast.isInactive ? theme.textMuted : '#10B981'}
                    />
                    <Text style={[styles.forecastTitle, { color: theme.text }]}>
                      Previsão para 30 Dias (Mês Ant.)
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.tagBadge,
                      forecast.isInactive && {
                        backgroundColor: isDark ? 'rgba(148, 163, 184, 0.15)' : '#E2E8F0',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tagBadgeText,
                        forecast.isInactive && { color: theme.textMuted },
                      ]}
                    >
                      {forecast.isInactive ? 'Inativo (30d)' : `~${forecast.averageDailyKm} km/dia`}
                    </Text>
                  </View>
                </View>
                <View style={styles.forecastRow}>
                  <View>
                    <Text style={[styles.forecastLabel, { color: theme.textMuted }]}>
                      Custo Estimado Total:
                    </Text>
                    <Text
                      style={[
                        styles.forecastAmount,
                        { color: forecast.isInactive ? theme.textMuted : theme.accent },
                      ]}
                    >
                      R$ {forecast.totalProjectedCost30Days.toFixed(2)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.forecastLabel, { color: theme.textMuted }]}>
                      {forecast.isInactive ? 'Status:' : 'Combustível:'}
                    </Text>
                    <Text
                      style={[
                        styles.forecastSubAmount,
                        { color: forecast.isInactive ? theme.textMuted : theme.text },
                      ]}
                    >
                      {forecast.isInactive ? 'Gastos pausados' : `R$ ${forecast.projected30DaysCost.toFixed(2)}`}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {/* ALERTAS PREVENTIVOS URGENTES */}
            {urgentAlerts.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Alertas de Revisão
                  </Text>
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
                        <Text style={[styles.alertTitle, { color: theme.text }]}>
                          {alert.title}
                        </Text>
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
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Último Abastecimento
                  </Text>
                  <TouchableOpacity onPress={() => router.push('/abastecimentos')}>
                    <Text style={[styles.sectionLink, { color: theme.accent }]}>Histórico</Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={[
                    styles.historyCard,
                    { backgroundColor: theme.card, borderColor: theme.cardBorder },
                  ]}
                >
                  <View style={styles.historyRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={[styles.fuelIconBadge, { backgroundColor: theme.accentLight }]}
                      >
                        <Ionicons name="water" size={18} color={theme.accent} />
                      </View>
                      <View>
                        <Text style={[styles.historyTitle, { color: theme.text }]}>
                          {lastRefueling.fuelType.toUpperCase()} •{' '}
                          {lastRefueling.liters.toFixed(2)} L
                        </Text>
                        <Text style={[styles.historySubtitle, { color: theme.textMuted }]}>
                          {formatDateToBR(lastRefueling.date)} •{' '}
                          {lastRefueling.odometer.toLocaleString('pt-BR')} km
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
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Ionicons name="car-sport-outline" size={52} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhum veículo ativo</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
              Cadastre ou selecione um veículo na Garagem para começar a monitorar seus
              abastecimentos e manutenções.
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
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>Atualizar Odômetro</Text>
            <Text style={[styles.modalDesc, { color: theme.textMuted }]}>
              Insira a quilometragem atual do painel do seu veículo para atualizar as previsões e
              alertas:
            </Text>

            <TextInput
              style={[
                styles.modalInput,
                { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder },
              ]}
              keyboardType="numeric"
              value={newOdometerInput}
              onChangeText={setNewOdometerInput}
              placeholder="Ex: 38450"
              placeholderTextColor={theme.textMuted}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[
                  styles.modalBtnCancel,
                  { borderColor: theme.cardBorder, opacity: savingOdometer ? 0.5 : 1 },
                ]}
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
  offlinePendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  offlinePendingIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlinePendingTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  offlinePendingSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
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
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 2,
    marginBottom: 4,
  },
  noticeBannerText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  dashboardCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
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
    fontSize: 20,
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
  fixedHeaderArea: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    gap: 8,
    zIndex: 10,
  },
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
