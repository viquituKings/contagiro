import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { StorageService } from '@/services/storage';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import { Vehicle, FuelType, VehicleType } from '@/types/vehicle';
import { formatEngineDisplacement, parseEngineDisplacement } from '@/utils/engine';
import { pickAndOptimizeImage, promptImageSource } from '@/services/image-picker';

export function formatPlate(text: string): string {
  // Converte para maiúsculo, remove tudo que não for alfanumérico e limita a 7 caracteres
  const raw = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  if (raw.length > 3) {
    return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  }
  return raw;
}

const FUEL_OPTIONS: { type: FuelType; label: string }[] = [
  { type: 'gasolina', label: 'Gasolina' },
  { type: 'etanol', label: 'Etanol' },
  { type: 'diesel', label: 'Diesel' },
  { type: 'gnv', label: 'GNV' },
];

export default function GarageScreen() {
  const { isDark } = useAppTheme();
  const { user, logout } = useAuth();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);

  // Formulário de Cadastro / Edição
  const [vehicleType, setVehicleType] = useState<VehicleType>('carro');
  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [year, setYear] = useState('');
  const [tankCapacity, setTankCapacity] = useState('50');
  const [currentOdometer, setCurrentOdometer] = useState('');
  const [acceptedFuels, setAcceptedFuels] = useState<FuelType[]>(['gasolina', 'etanol']);
  const [engineDisplacement, setEngineDisplacement] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const previewDisplacement = parseEngineDisplacement(engineDisplacement);

  const loadData = async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);
    try {
      // 1. Exibe imediatamente todos os cadastros, avatares e totalizadores em cache
      const [cachedList, cachedActive] = await Promise.all([
        StorageService.getCachedVehicles(),
        StorageService.getActiveVehicleId(),
      ]);
      if (cachedList.length > 0) {
        setVehicles(cachedList);
        setActiveId(cachedActive || (cachedList[0]?.id ?? null));
        setLoading(false);
      }

      // 2. Sincroniza/atualiza com preservação de dados offline
      const list = await StorageService.getVehicles();
      const curActive = await StorageService.getActiveVehicleId();
      setVehicles(list);
      setActiveId(curActive || (list[0]?.id ?? null));
    } catch (err) {
      console.error('Erro ao carregar veículos:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const handleSelectActive = async (id: string) => {
    await StorageService.setActiveVehicleId(id);
    setActiveId(id);
  };

  const handleSetPreferred = async (id: string) => {
    try {
      const updatedList = await StorageService.setPreferredVehicle(id);
      setVehicles(updatedList);
      setActiveId(id);
    } catch (err) {
      console.error('Erro ao definir veículo preferido:', err);
    }
  };

  const handleMoveVehicle = async (id: string, direction: 'up' | 'down') => {
    try {
      const updatedList = await StorageService.moveVehicle(id, direction);
      setVehicles(updatedList);
      if (updatedList.length > 0) {
        setActiveId(updatedList[0].id);
      }
    } catch (err) {
      console.error('Erro ao mover veículo:', err);
    }
  };

  const handleOpenAdd = () => {
    setEditingVehicle(null);
    setVehicleType('carro');
    setName('');
    setModel('');
    setBrand('');
    setPlate('');
    setYear('');
    setTankCapacity('50');
    setCurrentOdometer('');
    setEngineDisplacement('');
    setAcceptedFuels(['gasolina', 'etanol']);
    setPhotoUrl(null);
    setModalVisible(true);
  };

  const handleOpenEdit = (veh: Vehicle) => {
    setEditingVehicle(veh);
    setVehicleType(veh.vehicleType || 'carro');
    setName(veh.name);
    setModel(veh.model);
    setBrand(veh.brand || '');
    setPlate(veh.plate);
    setYear(veh.year ? String(veh.year) : '');
    setTankCapacity(veh.tankCapacity ? String(veh.tankCapacity) : '50');
    setCurrentOdometer(veh.currentOdometer ? String(veh.currentOdometer) : '0');
    setEngineDisplacement(veh.engineDisplacement ? String(parseEngineDisplacement(veh.engineDisplacement) ?? veh.engineDisplacement) : '');
    setPhotoUrl(veh.photoUrl || null);
    setAcceptedFuels(
      veh.acceptedFuelTypes && veh.acceptedFuelTypes.length > 0
        ? veh.acceptedFuelTypes
        : [veh.fuelType || 'gasolina']
    );
    setModalVisible(true);
  };

  const handleSelectVehiclePhoto = async () => {
    const source = await promptImageSource();
    if (!source) return;
    setPhotoLoading(true);
    try {
      const result = await pickAndOptimizeImage(source, { targetSize: 320, compress: 0.7 });
      if (result) {
        setPhotoUrl(result.base64Uri);
      }
    } finally {
      setPhotoLoading(false);
    }
  };

  const toggleFuel = (type: FuelType) => {
    setAcceptedFuels((prev) => {
      if (prev.includes(type)) {
        if (prev.length === 1) {
          Alert.alert('Combustível Obrigatório', 'Selecione ao menos um tipo de combustível que o veículo aceita.');
          return prev;
        }
        return prev.filter((item) => item !== type);
      }
      return [...prev, type];
    });
  };

  const handleSave = async () => {
    if (saving) return;

    if (!editingVehicle && !name.trim()) {
      Alert.alert('Campo Obrigatório', 'Informe o modelo ou apelido do veículo.');
      return;
    }
    if (!editingVehicle && !plate.trim()) {
      Alert.alert('Campo Obrigatório', 'Informe a placa do veículo.');
      return;
    }
    if (acceptedFuels.length === 0) {
      Alert.alert('Combustível', 'Selecione ao menos um combustível aceito.');
      return;
    }

    setSaving(true);
    try {
      const odomNum = parseInt(currentOdometer, 10) || 0;
      const yearNum = parseInt(year, 10) || new Date().getFullYear();
      const tankNum = parseInt(tankCapacity, 10) || (vehicleType === 'moto' ? 14 : 50);
      const dispNum = parseEngineDisplacement(engineDisplacement);

      if (editingVehicle) {
        // Modo Edição: marca, modelo e placa não podem ser alterados!
        // Preserva informações de manutenção periódica já existentes
        const updatedVeh: Vehicle = {
          ...editingVehicle,
          name: editingVehicle.name,
          model: editingVehicle.model,
          brand: editingVehicle.brand,
          plate: editingVehicle.plate,
          year: yearNum,
          tankCapacity: tankNum,
          currentOdometer: odomNum,
          fuelType: acceptedFuels[0] || 'gasolina',
          acceptedFuelTypes: acceptedFuels,
          vehicleType: editingVehicle.vehicleType || vehicleType,
          engineDisplacement: dispNum,
          photoUrl: photoUrl || undefined,
          cadManPeriodica: editingVehicle.cadManPeriodica,
          revisaoKm: editingVehicle.revisaoKm,
          trocaOleoKm: editingVehicle.trocaOleoKm,
          proxRevKm: editingVehicle.proxRevKm,
          proxTrocaOleoKm: editingVehicle.proxTrocaOleoKm,
          gastoManutencao: editingVehicle.gastoManutencao,
        };

        await StorageService.saveVehicle(updatedVeh);
        Alert.alert('Sucesso', 'Informações do veículo atualizadas com sucesso!');
      } else {
        // Modo Criação:
        // O ciclo de manutenção periódica será cadastrado futuramente na tela Oficina
        const formattedPlate = formatPlate(plate);
        const newVeh: Vehicle = {
          id: 'veh-' + Date.now(),
          name: name.trim(),
          model: model.trim() || (brand ? `${brand} ${name}`.trim() : name.trim()),
          brand: brand.trim(),
          plate: formattedPlate,
          year: yearNum,
          tankCapacity: tankNum,
          currentOdometer: odomNum,
          fuelType: acceptedFuels[0] || 'gasolina',
          acceptedFuelTypes: acceptedFuels,
          vehicleType,
          engineDisplacement: dispNum,
          photoUrl: photoUrl || undefined,
          flexEfficiencyRatio: 0.70,
          cadManPeriodica: false,
          gastoManutencao: 0,
        };

        await StorageService.saveVehicle(newVeh);
        await StorageService.setActiveVehicleId(newVeh.id);
      }

      setModalVisible(false);
      await loadData();
    } catch (err) {
      console.error('Erro ao salvar veículo:', err);
      Alert.alert('Erro', 'Ocorreu um erro ao salvar o veículo. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (vehicles.length <= 1) {
      Alert.alert('Atenção', 'Você precisa ter pelo menos um veículo cadastrado.');
      return;
    }
    const online = await StorageService.checkOnlineStatus(true);
    if (!online) {
      Alert.alert(
        'Modo Offline',
        'Não é possível excluir veículos do banco de dados enquanto estiver offline. Conecte-se à internet e tente novamente.'
      );
      return;
    }
    Alert.alert('Remover Veículo', 'Deseja excluir este veículo da sua garagem e do banco de dados?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await StorageService.deleteVehicle(id);
            await loadData();
          } catch (err: any) {
            Alert.alert(
              'Modo Offline',
              err?.message || 'Não é possível excluir informações do banco de dados enquanto estiver offline.'
            );
          }
        },
      },
    ]);
  };

  const theme = {
    bg: isDark ? '#090D16' : '#F8FAFC',
    card: isDark ? '#141D2E' : '#FFFFFF',
    cardBorder: isDark ? '#1E2D44' : '#E2E8F0',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    accent: '#10B981',
    accentLight: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
    blue: '#3B82F6',
    red: '#EF4444',
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Minha Garagem</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              {vehicles.length} {vehicles.length === 1 ? 'veículo sincronizado' : 'veículos sincronizados'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.accent }]}
            onPress={handleOpenAdd}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>+ Veículo</Text>
          </TouchableOpacity>
        </View>

        {/* PERFIL / CONTA DO USUÁRIO */}
        <View style={[styles.userCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <TouchableOpacity
            style={styles.userInfo}
            onPress={() => router.push('/configuracoes' as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.userAvatar, { backgroundColor: theme.accentLight }]}>
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.userAvatarImage} />
              ) : (
                <Ionicons name="person" size={20} color={theme.accent} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
                {user?.displayName || 'Motorista'}
              </Text>
              <Text style={[styles.userEmail, { color: theme.textMuted }]} numberOfLines={1}>
                {user?.email || 'Conectado'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.userCardActions}>
            <TouchableOpacity
              style={[styles.settingsBtn, { borderColor: theme.cardBorder, backgroundColor: theme.bg }]}
              onPress={() => router.push('/configuracoes' as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={16} color={theme.text} />
              <Text style={[styles.settingsBtnText, { color: theme.text }]}>Configurar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.logoutBtn, { borderColor: theme.red + '44' }]}
              onPress={() => {
                Alert.alert('Sair da Conta', 'Deseja encerrar a sessão atual?', [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Sair',
                    style: 'destructive',
                    onPress: async () => {
                      await logout();
                    },
                  },
                ]);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={16} color={theme.red} />
            </TouchableOpacity>
          </View>
        </View>

        {/* LOADING INDICATOR QUANDO ABERTO PELA PRIMEIRA VEZ */}
        {loading && vehicles.length === 0 ? (
          <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>
              Buscando veículos no Firestore...
            </Text>
          </View>
        ) : (
          /* LISTA DE VEÍCULOS */
          <FlatList
            data={vehicles}
            keyExtractor={(item) => item.id}
            style={{ flex: 1, backgroundColor: theme.bg }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadData(true)}
                tintColor={theme.accent}
                colors={[theme.accent]}
              />
            }
            ListEmptyComponent={
              <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <Ionicons name="car-outline" size={48} color={theme.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhum veículo cadastrado</Text>
                <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                  {'Toque no botão "+ Veículo" acima para adicionar seu primeiro carro ou moto à garagem.'}
                </Text>
              </View>
            }
            ListHeaderComponent={
              vehicles.length > 1 ? (
                <View
                  style={[
                    styles.orderTipBox,
                    {
                      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.08)' : '#FFFBEB',
                      borderColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FDE68A',
                    },
                  ]}
                >
                  <Ionicons name="sparkles" size={14} color="#D97706" />
                  <Text style={[styles.orderTipText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                    {'O veículo no topo é o preferido do app. Use ▲ / ▼ ou "Tornar Topo" para reordenar.'}
                  </Text>
                </View>
              ) : undefined
            }
            renderItem={({ item, index }) => {
              const isActive = item.id === activeId;
              const isPreferred = index === 0;
              const isMoto = item.vehicleType === 'moto';
              const fuelsDisplay = item.acceptedFuelTypes && item.acceptedFuelTypes.length > 0
                ? item.acceptedFuelTypes.join(' / ')
                : item.fuelType;
              const displayBrandModel = item.brand && !item.model?.toLowerCase().includes(item.brand.toLowerCase())
                ? `${item.brand} ${item.model}`
                : (item.model || item.name);

              return (
                <TouchableOpacity
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.card,
                      borderColor: isActive ? theme.accent : theme.cardBorder,
                      borderWidth: isActive ? 2 : 1,
                    },
                  ]}
                  onPress={() => handleSelectActive(item.id)}
                >
                  <View style={styles.cardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      {item.photoUrl ? (
                        <Image source={{ uri: item.photoUrl }} style={styles.carPhotoBadge} />
                      ) : (
                        <View style={[styles.carIconBadge, { backgroundColor: theme.accentLight }]}>
                          <Ionicons
                            name={isMoto ? 'bicycle' : 'car-sport'}
                            size={22}
                            color={theme.accent}
                          />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.carName, { color: theme.text }]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <View style={[styles.motoBadge, { backgroundColor: isDark ? '#1E293B' : '#EEF2F6' }]}>
                            <Text style={[styles.motoBadgeText, { color: theme.textMuted }]}>
                              {isMoto ? 'Moto' : 'Carro'}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.carModel, { color: theme.textMuted }]} numberOfLines={1}>
                          {displayBrandModel} • {item.year} {item.engineDisplacement ? `• ${formatEngineDisplacement(item.engineDisplacement)}` : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={styles.plateBadge}>
                        <Text style={styles.plateText}>{item.plate}</Text>
                      </View>
                      {isPreferred ? (
                        <View
                          style={[
                            styles.preferredBadge,
                            {
                              backgroundColor: isDark
                                ? 'rgba(245, 158, 11, 0.16)'
                                : '#FEF3C7',
                            },
                          ]}
                        >
                          <Ionicons name="star" size={11} color="#D97706" />
                          <Text
                            style={[
                              styles.preferredBadgeText,
                              { color: isDark ? '#FBBF24' : '#B45309' },
                            ]}
                          >
                            Preferido
                          </Text>
                        </View>
                      ) : (
                        vehicles.length > 1 && (
                          <TouchableOpacity
                            style={[
                              styles.makePreferredBtn,
                              { borderColor: isDark ? '#334155' : '#E2E8F0' },
                            ]}
                            onPress={() => handleSetPreferred(item.id)}
                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          >
                            <Ionicons name="star-outline" size={11} color={theme.textMuted} />
                            <Text style={[styles.makePreferredBtnText, { color: theme.textMuted }]}>
                              Tornar Topo
                            </Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  </View>

                  <View style={styles.cardMidRow}>
                    <View style={styles.detailItem}>
                      <Ionicons name="speedometer-outline" size={16} color={theme.textMuted} />
                      <Text style={[styles.detailText, { color: theme.text }]}>
                        {item.currentOdometer.toLocaleString('pt-BR')} km
                      </Text>
                    </View>

                    <View style={styles.detailItem}>
                      <Ionicons name="water-outline" size={16} color={theme.textMuted} />
                      <Text style={[styles.detailText, { color: theme.text }]}>
                        Tanque: {item.tankCapacity}L
                      </Text>
                    </View>

                    <View style={styles.detailItem}>
                      <Ionicons name="flame-outline" size={16} color={theme.textMuted} />
                      <Text style={[styles.detailText, { color: theme.text, textTransform: 'capitalize' }]}>
                        {fuelsDisplay}
                      </Text>
                    </View>
                  </View>

                  {/* INFORMAÇÕES DE MANUTENÇÃO PERIÓDICA DO BANCO */}
                  {item.cadManPeriodica && (
                    <View style={[styles.periodicaRow, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#ECFDF5' }]}>
                      <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                      <Text style={[styles.periodicaText, { color: isDark ? '#34D399' : '#059669' }]}>
                        {item.proxRevKm
                          ? `Próx. Revisão: ${item.proxRevKm.toLocaleString('pt-BR')} km`
                          : `Revisão a cada ${item.revisaoKm?.toLocaleString('pt-BR')} km`}
                        {item.proxTrocaOleoKm
                          ? ` • Próx. Óleo: ${item.proxTrocaOleoKm.toLocaleString('pt-BR')} km`
                          : ''}
                      </Text>
                    </View>
                  )}

                  {/* TOTALIZADORES DO VEÍCULO (DISPONÍVEIS OFFLINE) */}
                  <View style={[styles.statsGridRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderColor: theme.cardBorder }]}>
                    <View style={styles.statMiniCol}>
                      <Text style={[styles.statMiniLabel, { color: theme.textMuted }]}>Consumo</Text>
                      <Text style={[styles.statMiniValue, { color: theme.text }]} numberOfLines={1}>
                        {item.mediaGeralKmPorLitro && item.mediaGeralKmPorLitro > 0
                          ? `${item.mediaGeralKmPorLitro.toLocaleString('pt-BR')} km/L`
                          : '--'}
                      </Text>
                    </View>

                    <View style={[styles.statMiniDivider, { backgroundColor: theme.cardBorder }]} />

                    <View style={styles.statMiniCol}>
                      <Text style={[styles.statMiniLabel, { color: theme.textMuted }]}>Custo/km</Text>
                      <Text style={[styles.statMiniValue, { color: theme.text }]} numberOfLines={1}>
                        {item.custoMedioPorKm && item.custoMedioPorKm > 0
                          ? `R$ ${item.custoMedioPorKm.toFixed(2)}`
                          : '--'}
                      </Text>
                    </View>

                    <View style={[styles.statMiniDivider, { backgroundColor: theme.cardBorder }]} />

                    <View style={styles.statMiniCol}>
                      <Text style={[styles.statMiniLabel, { color: theme.textMuted }]}>Combustível</Text>
                      <Text style={[styles.statMiniValue, { color: theme.text }]} numberOfLines={1}>
                        {item.totalGastoAbast != null && item.totalGastoAbast > 0
                          ? `R$ ${item.totalGastoAbast.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : '--'}
                      </Text>
                    </View>

                    <View style={[styles.statMiniDivider, { backgroundColor: theme.cardBorder }]} />

                    <View style={styles.statMiniCol}>
                      <Text style={[styles.statMiniLabel, { color: theme.textMuted }]}>Oficina</Text>
                      <Text style={[styles.statMiniValue, { color: theme.text }]} numberOfLines={1}>
                        {item.gastoManutencao != null && item.gastoManutencao > 0
                          ? `R$ ${item.gastoManutencao.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : '--'}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.cardFooter, { borderTopColor: theme.cardBorder }]}>
                    {isActive ? (
                      <View style={styles.activeTag}>
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                        <Text style={styles.activeTagText}>Veículo Ativo</Text>
                      </View>
                    ) : (
                      <Text style={[styles.selectPrompt, { color: theme.textMuted }]}>
                        Toque para ativar este veículo
                      </Text>
                    )}

                    <View style={styles.cardActionsRow}>
                      {/* BOTOES DE ORDENAÇÃO */}
                      {vehicles.length > 1 && (
                        <View style={styles.reorderButtonsGroup}>
                          <TouchableOpacity
                            style={[
                              styles.reorderArrowBtn,
                              {
                                borderColor: theme.cardBorder,
                                opacity: index === 0 ? 0.25 : 1,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
                              },
                            ]}
                            disabled={index === 0}
                            onPress={() => handleMoveVehicle(item.id, 'up')}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                          >
                            <Ionicons name="chevron-up" size={15} color={theme.text} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.reorderArrowBtn,
                              {
                                borderColor: theme.cardBorder,
                                opacity: index === vehicles.length - 1 ? 0.25 : 1,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
                              },
                            ]}
                            disabled={index === vehicles.length - 1}
                            onPress={() => handleMoveVehicle(item.id, 'down')}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                          >
                            <Ionicons name="chevron-down" size={15} color={theme.text} />
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* BOTÃO EDITAR */}
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: theme.cardBorder }]}
                        onPress={() => handleOpenEdit(item)}
                      >
                        <Ionicons name="create-outline" size={15} color={theme.blue} />
                        <Text style={[styles.actionBtnText, { color: theme.blue }]}>Editar</Text>
                      </TouchableOpacity>

                      {/* BOTÃO EXCLUIR */}
                      {vehicles.length > 1 && (
                        <TouchableOpacity
                          style={[styles.actionBtn, { borderColor: theme.cardBorder }]}
                          onPress={() => handleDelete(item.id)}
                        >
                          <Ionicons name="trash-outline" size={15} color={theme.red} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* MODAL ADICIONAR / EDITAR VEÍCULO */}
        <Modal visible={modalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {editingVehicle ? 'Editar Veículo' : 'Adicionar Veículo'}
                </Text>
                <TouchableOpacity
                  onPress={() => !saving && setModalVisible(false)}
                  disabled={saving}
                  style={{ opacity: saving ? 0.5 : 1 }}
                >
                  <Ionicons name="close-circle" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {/* FOTO / AVATAR DO VEÍCULO */}
                <View style={styles.vehiclePhotoPickerContainer}>
                  <TouchableOpacity
                    style={[
                      styles.vehiclePhotoBox,
                      {
                        backgroundColor: theme.bg,
                        borderColor: photoUrl ? theme.accent : theme.cardBorder,
                      },
                    ]}
                    onPress={handleSelectVehiclePhoto}
                    disabled={photoLoading || saving}
                    activeOpacity={0.8}
                  >
                    {photoLoading ? (
                      <ActivityIndicator size="small" color={theme.accent} />
                    ) : photoUrl ? (
                      <Image source={{ uri: photoUrl }} style={styles.vehiclePhotoPreview} />
                    ) : (
                      <View style={{ alignItems: 'center', gap: 6 }}>
                        <Ionicons
                          name={vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                          size={34}
                          color={theme.textMuted}
                        />
                        <Text style={[styles.vehiclePhotoHint, { color: theme.textMuted }]}>
                          Adicionar Foto do Veículo
                        </Text>
                      </View>
                    )}
                    <View style={[styles.photoCameraBadge, { backgroundColor: theme.accent }]}>
                      <Ionicons name="camera" size={13} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>

                  {photoUrl && (
                    <TouchableOpacity
                      onPress={() => setPhotoUrl(null)}
                      style={{ marginTop: 6 }}
                      disabled={saving}
                    >
                      <Text style={styles.removePhotoText}>Remover foto do veículo</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* SELETOR CARRO / MOTO */}
                <View style={styles.typeSelectorRow}>
                  <TouchableOpacity
                    disabled={Boolean(editingVehicle)}
                    style={[
                      styles.typeSelectorBtn,
                      {
                        backgroundColor: vehicleType === 'carro' ? theme.accent : theme.bg,
                        borderColor: theme.cardBorder,
                        opacity: editingVehicle && vehicleType !== 'carro' ? 0.4 : 1,
                      },
                    ]}
                    onPress={() => {
                      setVehicleType('carro');
                      if (!editingVehicle) setTankCapacity('50');
                    }}
                  >
                    <Ionicons
                      name="car-sport"
                      size={18}
                      color={vehicleType === 'carro' ? '#FFFFFF' : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.typeSelectorText,
                        { color: vehicleType === 'carro' ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      Carro
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={Boolean(editingVehicle)}
                    style={[
                      styles.typeSelectorBtn,
                      {
                        backgroundColor: vehicleType === 'moto' ? theme.accent : theme.bg,
                        borderColor: theme.cardBorder,
                        opacity: editingVehicle && vehicleType !== 'moto' ? 0.4 : 1,
                      },
                    ]}
                    onPress={() => {
                      setVehicleType('moto');
                      if (!editingVehicle) setTankCapacity('14');
                    }}
                  >
                    <Ionicons
                      name="bicycle"
                      size={18}
                      color={vehicleType === 'moto' ? '#FFFFFF' : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.typeSelectorText,
                        { color: vehicleType === 'moto' ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      Moto
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* MARCA E MODELO (BLOQUEADOS NA EDIÇÃO) */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Marca:</Text>
                      {editingVehicle && (
                        <Ionicons name="lock-closed" size={12} color={theme.textMuted} />
                      )}
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: editingVehicle ? (isDark ? '#0A0F1D' : '#F1F5F9') : theme.bg,
                          color: editingVehicle ? theme.textMuted : theme.text,
                          borderColor: theme.cardBorder,
                        },
                      ]}
                      value={brand}
                      onChangeText={setBrand}
                      placeholder="Ex: Volkswagen"
                      placeholderTextColor={theme.textMuted}
                      editable={!editingVehicle}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1.2 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Modelo / Apelido:</Text>
                      {editingVehicle && (
                        <Ionicons name="lock-closed" size={12} color={theme.textMuted} />
                      )}
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: editingVehicle ? (isDark ? '#0A0F1D' : '#F1F5F9') : theme.bg,
                          color: editingVehicle ? theme.textMuted : theme.text,
                          borderColor: theme.cardBorder,
                        },
                      ]}
                      value={name}
                      onChangeText={setName}
                      placeholder="Ex: Gol 1.0"
                      placeholderTextColor={theme.textMuted}
                      editable={!editingVehicle}
                    />
                  </View>
                </View>

                {/* PLACA (BLOQUEADA NA EDIÇÃO) E ANO */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Placa:</Text>
                      {editingVehicle && (
                        <Ionicons name="lock-closed" size={12} color={theme.textMuted} />
                      )}
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: editingVehicle ? (isDark ? '#0A0F1D' : '#F1F5F9') : theme.bg,
                          color: editingVehicle ? theme.textMuted : theme.text,
                          borderColor: theme.cardBorder,
                        },
                      ]}
                      value={plate}
                      onChangeText={(val) => setPlate(formatPlate(val))}
                      placeholder="Ex: ABC-1234"
                      autoCapitalize="characters"
                      maxLength={8}
                      editable={!editingVehicle}
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Ano:</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={year}
                      onChangeText={setYear}
                      placeholder="Ex: 2022"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>
                </View>

                {editingVehicle && (
                  <View style={[styles.lockedNoticeRow, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
                    <Ionicons name="lock-closed-outline" size={14} color={theme.textMuted} />
                    <Text style={[styles.lockedNoticeText, { color: theme.textMuted }]}>
                      Marca, modelo e placa não podem ser alterados na edição.
                    </Text>
                  </View>
                )}

                {/* ODÔMETRO E CAPACIDADE DO TANQUE */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Odômetro Atual (km):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={currentOdometer}
                      onChangeText={setCurrentOdometer}
                      placeholder="Ex: 85000"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Tanque (Litros):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={tankCapacity}
                      onChangeText={setTankCapacity}
                      placeholder={vehicleType === 'moto' ? '14' : '50'}
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>
                </View>

                {/* CILINDRADA / MOTOR (CARROS E MOTOS) */}
                <View style={styles.inputGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
                      Cilindrada / Motor:
                    </Text>
                    {previewDisplacement ? (
                      <View style={[styles.dispPreviewBadge, { backgroundColor: theme.accentLight }]}>
                        <Text style={[styles.dispPreviewText, { color: theme.accent }]}>
                          Salvará: {previewDisplacement}cc
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                    keyboardType="decimal-pad"
                    value={engineDisplacement}
                    onChangeText={setEngineDisplacement}
                    placeholder={
                      vehicleType === 'moto'
                        ? 'Ex: 160, 250 ou 1000'
                        : 'Ex: 1.0, 1.6, 1.8 ou 1000, 1600'
                    }
                    placeholderTextColor={theme.textMuted}
                  />
                  <Text style={[styles.inputHint, { color: theme.textMuted }]}>
                    {vehicleType === 'moto'
                      ? 'Aceita cilindradas em cc (ex: 160, 250, 1000).'
                      : 'Aceita em litros (ex: 1.0, 1.6, 1.8) ou cilindradas (ex: 1000, 1600, 1800).'}
                  </Text>
                </View>

                {/* COMBUSTÍVEIS ACEITOS (CHECKBOX) */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
                    Combustíveis Aceitos pelo Veículo:
                  </Text>
                  <View style={styles.fuelOptionsRow}>
                    {FUEL_OPTIONS.map((opt) => {
                      const isSelected = acceptedFuels.includes(opt.type);
                      return (
                        <TouchableOpacity
                          key={opt.type}
                          style={[
                            styles.fuelOptionChip,
                            {
                              backgroundColor: isSelected
                                ? (isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.12)')
                                : theme.bg,
                              borderColor: isSelected ? theme.accent : theme.cardBorder,
                            },
                          ]}
                          onPress={() => toggleFuel(opt.type)}
                        >
                          <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={isSelected ? theme.accent : theme.textMuted}
                          />
                          <Text
                            style={[
                              styles.fuelOptionText,
                              { color: isSelected ? theme.accent : theme.text },
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>



                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    {
                      backgroundColor: theme.accent,
                      opacity: saving ? 0.7 : 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    },
                  ]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.saveBtnText}>
                        {editingVehicle ? 'Salvando Alterações...' : 'Cadastrando Veículo...'}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {editingVehicle ? 'Salvar Alterações' : 'Cadastrar Veículo'}
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 0,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    gap: 12,
    paddingBottom: 8,
  },
  emptyCard: {
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    padding: 16,
    borderRadius: 18,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  carIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carName: {
    fontSize: 17,
    fontWeight: '800',
  },
  motoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  motoBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  carModel: {
    fontSize: 12,
    marginTop: 2,
  },
  plateBadge: {
    backgroundColor: '#0F172A',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  plateText: {
    color: '#F8FAFC',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
  },
  cardMidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailText: {
    fontSize: 12,
    fontWeight: '600',
  },
  periodicaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  periodicaText: {
    fontSize: 11,
    fontWeight: '700',
  },
  gastoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: -4,
  },
  gastoText: {
    fontSize: 11,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  activeTagText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 12,
  },
  selectPrompt: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    maxHeight: '88%',
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  typeSelectorBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  typeSelectorText: {
    fontSize: 13,
    fontWeight: '700',
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  dispPreviewBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dispPreviewText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inputHint: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    fontWeight: '700',
  },
  fuelOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  fuelOptionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  fuelOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  lockedNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: -4,
    marginBottom: 2,
  },
  lockedNoticeText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 12,
  },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: 12,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '700',
  },
  userCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  settingsBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  carPhotoBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  userAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  userAvatarEditBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  vehiclePhotoPickerContainer: {
    alignItems: 'center',
    marginBottom: 6,
  },
  vehiclePhotoBox: {
    width: '100%',
    height: 120,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  vehiclePhotoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoCameraBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  vehiclePhotoHint: {
    fontSize: 12,
    fontWeight: '600',
  },
  removePhotoText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  statsGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 4,
  },
  statMiniCol: {
    flex: 1,
    alignItems: 'center',
  },
  statMiniLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  statMiniValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  statMiniDivider: {
    width: 1,
    height: 18,
  },
  orderTipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  orderTipText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  preferredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  preferredBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  makePreferredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  makePreferredBtnText: {
    fontSize: 10,
    fontWeight: '600',
  },
  reorderButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 2,
  },
  reorderArrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
