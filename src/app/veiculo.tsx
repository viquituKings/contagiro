import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { StorageService } from '@/services/storage';
import { useAppTheme } from '@/context/theme-context';
import { Vehicle, FuelType, VehicleType, Refueling, MaintenanceItem } from '@/types/vehicle';
import { formatEngineDisplacement, parseEngineDisplacement } from '@/utils/engine';
import { pickAndOptimizeImage, promptImageSource } from '@/services/image-picker';
import { VehicleMetricChartModal, ChartMetricType } from '@/components/vehicle-metric-chart-modal';
import { exportVehicleReportPdf } from '@/services/vehicle-report';

const FUEL_OPTIONS: { type: FuelType; label: string }[] = [
  { type: 'gasolina', label: 'Gasolina' },
  { type: 'etanol', label: 'Etanol' },
  { type: 'diesel', label: 'Diesel' },
  { type: 'gnv', label: 'GNV' },
];

export default function VehicleDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [refuelings, setRefuelings] = useState<Refueling[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados do Gráfico dos Últimos 12 Meses
  const [chartModalVisible, setChartModalVisible] = useState(false);
  const [selectedChartMetric, setSelectedChartMetric] = useState<ChartMetricType | null>(null);

  // Estado de geração de Relatório PDF
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleOpenChart = (metric: ChartMetricType) => {
    setSelectedChartMetric(metric);
    setChartModalVisible(true);
  };

  const handleExportPdf = async () => {
    if (!vehicle || generatingPdf) return;
    setGeneratingPdf(true);
    try {
      await exportVehicleReportPdf({
        vehicle,
        refuelings,
        maintenances,
      });
    } catch (err: any) {
      console.error('Erro ao gerar relatório em PDF:', err);
      Alert.alert(
        'Erro no Relatório',
        'Não foi possível gerar ou compartilhar o relatório em PDF. Tente novamente.'
      );
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Estados de Compartilhamento do Veículo
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [targetShareEmail, setTargetShareEmail] = useState('');
  const [sharing, setSharing] = useState(false);
  const shareScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const handleOpenShare = () => {
    if (!vehicle) return;
    setTargetShareEmail('');
    setShareModalVisible(true);
  };

  const handleAddShareMember = async () => {
    if (!vehicle || sharing) return;
    const emailToShare = targetShareEmail.trim().toLowerCase();
    if (!emailToShare || !emailToShare.includes('@') || !emailToShare.includes('.')) {
      Alert.alert('E-mail Inválido', 'Insira um e-mail válido para compartilhar o veículo.');
      return;
    }

    const online = await StorageService.checkOnlineStatus(true);
    if (!online) {
      Alert.alert(
        'Modo Offline',
        'Não é possível compartilhar veículos enquanto estiver offline. Conecte-se à internet e tente novamente.'
      );
      return;
    }

    setSharing(true);
    try {
      const res = await StorageService.shareVehicle(vehicle.id, emailToShare);
      setTargetShareEmail('');
      setVehicle((prev) => (prev ? { ...prev, sharedWith: res.sharedWith } : null));
      Alert.alert(
        'Compartilhamento Realizado! 🎉',
        `O veículo "${vehicle.name}" agora está compartilhado com ${emailToShare}. O usuário poderá acompanhar e registrar abastecimentos e manutenções.`
      );
    } catch (err: any) {
      Alert.alert('Erro ao Compartilhar', err?.message || 'Falha ao compartilhar o veículo.');
    } finally {
      setSharing(false);
    }
  };

  const handleRemoveShareMember = (emailToRemove: string) => {
    if (!vehicle || sharing) return;
    Alert.alert(
      'Revogar Acesso',
      `Deseja realmente revogar o compartilhamento deste veículo com ${emailToRemove}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revogar',
          style: 'destructive',
          onPress: async () => {
            setSharing(true);
            try {
              const res = await StorageService.unshareVehicle(vehicle.id, emailToRemove);
              setVehicle((prev) => (prev ? { ...prev, sharedWith: res.sharedWith } : null));
              Alert.alert('Acesso Revogado', `O acesso de ${emailToRemove} foi revogado com sucesso.`);
            } catch (err: any) {
              Alert.alert('Erro ao Revogar', err?.message || 'Falha ao revogar compartilhamento.');
            } finally {
              setSharing(false);
            }
          },
        },
      ]
    );
  };

  const handleLeaveShared = () => {
    if (!vehicle) return;
    Alert.alert(
      'Sair do Compartilhamento',
      `Deseja sair do compartilhamento do veículo "${vehicle.name}" (${vehicle.plate})? Ele deixará de aparecer na sua garagem, mas os dados não serão perdidos para o proprietário (${vehicle.ownerEmail || 'proprietário'}).`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            try {
              await StorageService.leaveSharedVehicle(vehicle.id);
              Alert.alert('Compartilhamento Encerrado', 'Você saiu do compartilhamento deste veículo com sucesso.');
              router.back();
            } catch (err: any) {
              Alert.alert('Erro', err?.message || 'Falha ao sair do compartilhamento.');
            }
          },
        },
      ]
    );
  };

  // Estados de Transferência do Veículo
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  const [transferring, setTransferring] = useState(false);
  const transferScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const handleOpenTransfer = () => {
    if (!vehicle) return;
    setTargetEmail('');
    setTransferModalVisible(true);
  };

  const handleConfirmTransfer = async () => {
    if (!vehicle || transferring) return;

    const emailToTransfer = targetEmail.trim().toLowerCase();
    if (!emailToTransfer || !emailToTransfer.includes('@') || !emailToTransfer.includes('.')) {
      Alert.alert('E-mail Inválido', 'Por favor, insira um e-mail válido para o novo proprietário.');
      return;
    }

    const online = await StorageService.checkOnlineStatus(true);
    if (!online) {
      Alert.alert(
        'Modo Offline',
        'Não é possível transferir veículos enquanto estiver offline. Conecte-se à internet e tente novamente.'
      );
      return;
    }

    Alert.alert(
      'Confirmar Transferência',
      `Tem certeza de que deseja transferir o veículo "${vehicle.name}" (${vehicle.plate}) e todos os dados associados (${refuelings.length} abastecimento(s) e ${maintenances.length} manutenção(ões)) para:\n\n${emailToTransfer}\n\n⚠️ Esta ação é definitiva e removerá o veículo da sua conta.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, Transferir',
          style: 'destructive',
          onPress: async () => {
            setTransferring(true);
            try {
              const result = await StorageService.transferVehicle(vehicle.id, emailToTransfer);
              setTransferModalVisible(false);
              Alert.alert(
                'Transferência Concluída! 🎉',
                `O veículo "${vehicle.name}" (${vehicle.plate}) com ${result.refuelingsCount} abastecimento(s) e ${result.maintenancesCount} manutenção(ões) foi transferido com sucesso para ${emailToTransfer}!`,
                [
                  {
                    text: 'OK',
                    onPress: () => router.back(),
                  },
                ]
              );
            } catch (err: any) {
              Alert.alert(
                'Erro na Transferência',
                err?.message || 'Não foi possível transferir o veículo. Tente novamente mais tarde.'
              );
            } finally {
              setTransferring(false);
            }
          },
        },
      ]
    );
  };

  const formatDisplayDate = (d?: string): string => {
    if (!d) return '--';
    try {
      const [datePart] = d.split('T');
      const parts = datePart.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
      }
      return d;
    } catch {
      return d;
    }
  };

  // Estados de Edição do Veículo
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicleType, setVehicleType] = useState<VehicleType>('carro');
  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [year, setYear] = useState('');
  const [tankCapacity, setTankCapacity] = useState('50');
  const [currentOdometer, setCurrentOdometer] = useState('');
  const [acceptedFuels, setAcceptedFuels] = useState<FuelType[]>(['gasolina', 'etanol']);
  const [engineDisplacement, setEngineDisplacement] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const previewDisplacement = parseEngineDisplacement(engineDisplacement);

  // Controle de teclado e foco para manter campos visíveis
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const modalScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToInput = (yOffset: number) => {
    setTimeout(() => {
      modalScrollRef.current?.scrollTo({ y: yOffset, animated: true });
    }, 100);
  };

  const loadData = useCallback(async (isPull = false) => {
    if (!id) return;
    if (isPull) setRefreshing(true);
    else if (!vehicle) setLoading(true);

    try {
      // 1. Carrega primeiro dados em cache para resposta imediata
      const [cachedVehicles, cachedRefs, cachedMnts] = await Promise.all([
        StorageService.getCachedVehicles(),
        StorageService.getCachedRefuelings(id),
        StorageService.getCachedMaintenances(id),
      ]);
      const foundCached = cachedVehicles.find((v) => v.id === id);
      if (foundCached) {
        setVehicle(foundCached);
      }
      setVehicles(cachedVehicles);
      setRefuelings(cachedRefs);
      setMaintenances(cachedMnts);

      // 2. Busca e sincroniza dados atualizados
      const [allVehicles, curRefs, curMnts] = await Promise.all([
        StorageService.getVehicles(),
        StorageService.getRefuelings(id),
        StorageService.getMaintenances(id),
      ]);

      setVehicles(allVehicles);
      setRefuelings(curRefs);
      setMaintenances(curMnts);

      const found = allVehicles.find((v) => v.id === id);
      if (found) {
        setVehicle(found);
      } else if (!foundCached && !isPull) {
        Alert.alert('Não Encontrado', 'Veículo não localizado na garagem.', [
          { text: 'Voltar', onPress: () => router.back() },
        ]);
      }
    } catch (err) {
      console.error('Erro ao carregar detalhes do veículo:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, vehicle, router]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleOpenEdit = () => {
    if (!vehicle) return;
    setVehicleType(vehicle.vehicleType || 'carro');
    setName(vehicle.name || '');
    setBrand(vehicle.brand || '');
    setPlate(vehicle.plate || '');
    setYear(vehicle.year ? String(vehicle.year) : '');
    setTankCapacity(vehicle.tankCapacity ? String(vehicle.tankCapacity) : '50');
    setCurrentOdometer(vehicle.currentOdometer ? String(vehicle.currentOdometer) : '0');
    setEngineDisplacement(
      vehicle.engineDisplacement
        ? String(parseEngineDisplacement(vehicle.engineDisplacement) ?? vehicle.engineDisplacement)
        : ''
    );
    setPhotoUrl(vehicle.photoUrl || null);
    setAcceptedFuels(
      vehicle.acceptedFuelTypes && vehicle.acceptedFuelTypes.length > 0
        ? vehicle.acceptedFuelTypes
        : [vehicle.fuelType || 'gasolina']
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

  const handleSaveEdit = async () => {
    if (!vehicle || saving) return;

    if (acceptedFuels.length === 0) {
      Alert.alert('Combustível', 'Selecione ao menos um combustível aceito.');
      return;
    }

    setSaving(true);
    try {
      const odomNum = parseInt(currentOdometer, 10) || 0;
      const yearNum = parseInt(year, 10) || vehicle.year || new Date().getFullYear();
      const tankNum = parseInt(tankCapacity, 10) || vehicle.tankCapacity || 50;
      const dispNum = parseEngineDisplacement(engineDisplacement);

      // Marca, modelo e placa são imutáveis na edição
      const updatedVeh: Vehicle = {
        ...vehicle,
        year: yearNum,
        tankCapacity: tankNum,
        currentOdometer: odomNum,
        fuelType: acceptedFuels[0] || 'gasolina',
        acceptedFuelTypes: acceptedFuels,
        engineDisplacement: dispNum,
        photoUrl: photoUrl || undefined,
      };

      await StorageService.saveVehicle(updatedVeh);
      setVehicle(updatedVeh);
      setModalVisible(false);
      Alert.alert('Sucesso', 'Informações do veículo atualizadas com sucesso!');
      await loadData();
    } catch (err) {
      console.error('Erro ao editar veículo:', err);
      Alert.alert('Erro', 'Ocorreu um erro ao atualizar o veículo. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!vehicle) return;

    if (vehicle.isShared) {
      handleLeaveShared();
      return;
    }

    if (vehicles.length <= 1) {
      Alert.alert('Atenção', 'Você precisa ter pelo menos um veículo cadastrado na garagem.');
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

    Alert.alert(
      'Excluir Veículo',
      `Tem certeza que deseja excluir "${vehicle.name}" (${vehicle.plate})? Todos os dados associados serão removidos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await StorageService.deleteVehicle(vehicle.id);
              Alert.alert('Veículo Removido', 'O veículo foi removido da sua garagem com sucesso.');
              router.back();
            } catch (err: any) {
              Alert.alert(
                'Erro na Exclusão',
                err?.message || 'Não foi possível excluir o veículo do banco de dados.'
              );
            }
          },
        },
      ]
    );
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
    blueLight: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
    red: '#EF4444',
    redLight: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
    amber: '#F59E0B',
    amberLight: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
  };

  if (loading && !vehicle) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Carregando dados do veículo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return null;
  }

  const isMoto = vehicle.vehicleType === 'moto';
  const isPreferred = vehicles.length > 0 && vehicles[0]?.id === vehicle.id;
  const fuelsDisplay =
    vehicle.acceptedFuelTypes && vehicle.acceptedFuelTypes.length > 0
      ? vehicle.acceptedFuelTypes.join(' / ')
      : vehicle.fuelType;
  const displayBrandModel =
    vehicle.brand && !vehicle.model?.toLowerCase().includes(vehicle.brand.toLowerCase())
      ? `${vehicle.brand} ${vehicle.model}`
      : vehicle.model || vehicle.name;

  const totalGastoTotal = (vehicle.totalGastoAbast || 0) + (vehicle.gastoManutencao || 0);

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      {/* HEADER */}
      <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
        <TouchableOpacity
          style={[styles.backBtn, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {vehicle.name}
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
            {vehicle.plate} • {isMoto ? 'Moto' : 'Carro'}
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={[
              styles.headerPdfBtn,
              {
                borderColor: theme.accent,
                backgroundColor: theme.accentLight,
              },
            ]}
            onPress={handleExportPdf}
            activeOpacity={0.7}
            disabled={generatingPdf}
            accessibilityLabel="Exportar Relatório PDF"
          >
            {generatingPdf ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Ionicons name="document-text-outline" size={18} color={theme.accent} />
            )}
          </TouchableOpacity>

          {/* TRANSFERIR: APENAS PROPRIETÁRIO */}
          {!vehicle.isShared && (
            <TouchableOpacity
              style={[
                styles.headerTransferBtn,
                {
                  borderColor: '#8B5CF6',
                  backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)',
                },
              ]}
              onPress={handleOpenTransfer}
              activeOpacity={0.7}
              disabled={transferring}
              accessibilityLabel="Transferir Veículo"
            >
              <Ionicons name="swap-horizontal" size={18} color="#8B5CF6" />
            </TouchableOpacity>
          )}

          {/* COMPARTILHAR: APENAS PROPRIETÁRIO */}
          {!vehicle.isShared && (
            <TouchableOpacity
              style={[
                styles.headerShareBtn,
                {
                  borderColor: '#0284C7',
                  backgroundColor: isDark ? 'rgba(2, 132, 199, 0.15)' : 'rgba(2, 132, 199, 0.1)',
                },
              ]}
              onPress={handleOpenShare}
              activeOpacity={0.7}
              disabled={sharing}
              accessibilityLabel="Compartilhar Veículo"
            >
              <Ionicons name="share-social-outline" size={18} color="#0284C7" />
            </TouchableOpacity>
          )}

          {/* EDITAR DADOS CADASTRAIS: APENAS PROPRIETÁRIO */}
          {!vehicle.isShared && (
            <TouchableOpacity
              style={[styles.headerEditBtn, { borderColor: theme.blue, backgroundColor: theme.blueLight }]}
              onPress={handleOpenEdit}
              activeOpacity={0.7}
              accessibilityLabel="Editar Veículo"
            >
              <Ionicons name="create-outline" size={18} color={theme.blue} />
            </TouchableOpacity>
          )}

          {/* EXCLUSÃO / SAIR DO COMPARTILHAMENTO */}
          <TouchableOpacity
            style={[
              styles.headerDeleteBtn,
              {
                borderColor: vehicle.isShared ? '#F59E0B' : theme.red,
                backgroundColor: vehicle.isShared
                  ? isDark
                    ? 'rgba(245, 158, 11, 0.15)'
                    : '#FEF3C7'
                  : theme.redLight,
              },
            ]}
            onPress={vehicle.isShared ? handleLeaveShared : handleDelete}
            activeOpacity={0.7}
            accessibilityLabel={vehicle.isShared ? 'Sair do Compartilhamento' : 'Excluir Veículo'}
          >
            <Ionicons
              name={vehicle.isShared ? 'exit-outline' : 'trash-outline'}
              size={18}
              color={vehicle.isShared ? '#D97706' : theme.red}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        {/* CARD HERO / APRESENTAÇÃO */}
        <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.heroTopRow}>
            {vehicle.photoUrl ? (
              <Image source={{ uri: vehicle.photoUrl }} style={styles.heroPhoto} />
            ) : (
              <View style={[styles.heroPhotoPlaceholder, { backgroundColor: theme.accentLight }]}>
                <Ionicons name={isMoto ? 'bicycle' : 'car-sport'} size={40} color={theme.accent} />
              </View>
            )}

            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[styles.heroVehicleName, { color: theme.text }]} numberOfLines={1}>
                  {vehicle.name}
                </Text>
              </View>

              <Text style={[styles.heroVehicleModel, { color: theme.textMuted }]}>
                {displayBrandModel}
              </Text>

              <View style={styles.heroBadgesRow}>
                <View style={styles.plateBadge}>
                  <Text style={styles.plateText}>{vehicle.plate}</Text>
                </View>

                <View style={[styles.typeBadge, { backgroundColor: isDark ? '#1E293B' : '#EEF2F6' }]}>
                  <Text style={[styles.typeBadgeText, { color: theme.textMuted }]}>
                    {isMoto ? 'Moto' : 'Carro'} • {vehicle.year}
                  </Text>
                </View>

                {vehicle.isShared && (
                  <View
                    style={[
                      styles.sharedHeroBadge,
                      {
                        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
                        borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
                      },
                    ]}
                  >
                    <Ionicons name="people" size={11} color="#3B82F6" />
                    <Text style={styles.sharedHeroBadgeText}>Compartilhado</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* STATUS: COMPARTILHADO OU PREFERIDO */}
          {vehicle.isShared ? (
            <View style={[styles.statusRow, { borderTopColor: theme.cardBorder }]}>
              <View
                style={[
                  styles.preferredTag,
                  { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' },
                ]}
              >
                <Ionicons name="people" size={13} color="#3B82F6" />
                <Text style={[styles.preferredTagText, { color: '#3B82F6' }]}>
                  Compartilhado por {vehicle.ownerEmail || 'outro usuário'}
                </Text>
              </View>
            </View>
          ) : isPreferred ? (
            <View style={[styles.statusRow, { borderTopColor: theme.cardBorder }]}>
              <View style={[styles.preferredTag, { backgroundColor: theme.amberLight }]}>
                <Ionicons name="star" size={13} color={theme.amber} />
                <Text style={[styles.preferredTagText, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                  Veículo Preferido (Topo)
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* SEÇÃO 1: TOTALIZADORES E DESEMPENHO */}
        <View style={styles.sectionHeader}>
          <Ionicons name="stats-chart" size={18} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Totalizadores e Desempenho</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
              Toque em qualquer card para ver o gráfico dos últimos 12 meses
            </Text>
          </View>
        </View>

        <View style={[styles.statsContainer, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {/* GRID 2x2 TOTALIZADORES PRINCIPAIS */}
          <View style={styles.statsGrid}>
            {/* 1. CONSUMO MÉDIO */}
            <TouchableOpacity
              style={[styles.statBox, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}
              onPress={() => handleOpenChart('consumo')}
              activeOpacity={0.7}
            >
              <View style={styles.statBoxHeader}>
                <Ionicons name="speedometer-outline" size={16} color={theme.accent} />
                <Text style={[styles.statBoxLabel, { color: theme.textMuted }]}>Consumo Médio</Text>
                <Ionicons name="bar-chart-outline" size={13} color={theme.accent} style={{ marginLeft: 'auto' }} />
              </View>
              <Text style={[styles.statBoxValue, { color: theme.text }]}>
                {vehicle.mediaGeralKmPorLitro && vehicle.mediaGeralKmPorLitro > 0
                  ? `${vehicle.mediaGeralKmPorLitro.toLocaleString('pt-BR')} km/L`
                  : '--'}
              </Text>
              <Text style={[styles.statBoxSubtext, { color: theme.accent }]}>
                Ver gráfico 12m 📊
              </Text>
            </TouchableOpacity>

            {/* 2. CUSTO POR KM */}
            <TouchableOpacity
              style={[styles.statBox, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}
              onPress={() => handleOpenChart('custo_km')}
              activeOpacity={0.7}
            >
              <View style={styles.statBoxHeader}>
                <Ionicons name="cash-outline" size={16} color={theme.blue} />
                <Text style={[styles.statBoxLabel, { color: theme.textMuted }]}>Custo por km</Text>
                <Ionicons name="bar-chart-outline" size={13} color={theme.blue} style={{ marginLeft: 'auto' }} />
              </View>
              <Text style={[styles.statBoxValue, { color: theme.text }]}>
                {vehicle.custoMedioPorKm && vehicle.custoMedioPorKm > 0
                  ? `R$ ${vehicle.custoMedioPorKm.toFixed(2)}`
                  : '--'}
              </Text>
              <Text style={[styles.statBoxSubtext, { color: theme.blue }]}>
                Ver gráfico 12m 📊
              </Text>
            </TouchableOpacity>

            {/* 3. TOTAL COMBUSTÍVEL */}
            <TouchableOpacity
              style={[styles.statBox, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}
              onPress={() => handleOpenChart('combustivel')}
              activeOpacity={0.7}
            >
              <View style={styles.statBoxHeader}>
                <Ionicons name="flame-outline" size={16} color="#F97316" />
                <Text style={[styles.statBoxLabel, { color: theme.textMuted }]}>Total Combustível</Text>
                <Ionicons name="bar-chart-outline" size={13} color="#F97316" style={{ marginLeft: 'auto' }} />
              </View>
              <Text style={[styles.statBoxValue, { color: theme.text }]}>
                {vehicle.totalGastoAbast != null && vehicle.totalGastoAbast > 0
                  ? `R$ ${vehicle.totalGastoAbast.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : 'R$ 0,00'}
              </Text>
              <Text style={[styles.statBoxSubtext, { color: '#F97316' }]}>
                {vehicle.totalLitrosAbast != null && vehicle.totalLitrosAbast > 0
                  ? `${vehicle.totalLitrosAbast.toLocaleString('pt-BR')} L • Gráfico 📊`
                  : 'Ver gráfico 12m 📊'}
              </Text>
            </TouchableOpacity>

            {/* 4. TOTAL OFICINA */}
            <TouchableOpacity
              style={[styles.statBox, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}
              onPress={() => handleOpenChart('oficina')}
              activeOpacity={0.7}
            >
              <View style={styles.statBoxHeader}>
                <Ionicons name="construct-outline" size={16} color="#8B5CF6" />
                <Text style={[styles.statBoxLabel, { color: theme.textMuted }]}>Total Oficina</Text>
                <Ionicons name="bar-chart-outline" size={13} color="#8B5CF6" style={{ marginLeft: 'auto' }} />
              </View>
              <Text style={[styles.statBoxValue, { color: theme.text }]}>
                {vehicle.gastoManutencao != null && vehicle.gastoManutencao > 0
                  ? `R$ ${vehicle.gastoManutencao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : 'R$ 0,00'}
              </Text>
              <Text style={[styles.statBoxSubtext, { color: '#8B5CF6' }]}>
                {vehicle.qtdManutencoes != null && vehicle.qtdManutencoes > 0
                  ? `${vehicle.qtdManutencoes} registro(s) • Gráfico 📊`
                  : 'Ver gráfico 12m 📊'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* CUSTO TOTAL GERAL CONSOLIDADO */}
          <View style={[styles.totalConsolidatedBox, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
            <View>
              <Text style={[styles.totalConsolidatedLabel, { color: theme.textMuted }]}>
                Gasto Total Consolidado
              </Text>
              <Text style={[styles.totalConsolidatedSub, { color: theme.textMuted }]}>
                Combustível + Manutenções
              </Text>
            </View>
            <Text style={[styles.totalConsolidatedValue, { color: theme.accent }]}>
              R$ {totalGastoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* SEÇÃO 2: DADOS DE CADASTRO DO VEÍCULO */}
        <View style={styles.sectionHeader}>
          <Ionicons name="document-text" size={18} color={theme.accent} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Dados de Cadastro</Text>
        </View>

        <View style={[styles.detailsCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.detailRow}>
            <View style={styles.detailLabelGroup}>
              <Ionicons name={isMoto ? 'bicycle-outline' : 'car-outline'} size={18} color={theme.textMuted} />
              <Text style={[styles.detailItemLabel, { color: theme.textMuted }]}>Tipo de Veículo</Text>
            </View>
            <Text style={[styles.detailItemValue, { color: theme.text }]}>
              {isMoto ? 'Motocicleta' : 'Carro'}
            </Text>
          </View>

          <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />

          <View style={styles.detailRow}>
            <View style={styles.detailLabelGroup}>
              <Ionicons name="business-outline" size={18} color={theme.textMuted} />
              <Text style={[styles.detailItemLabel, { color: theme.textMuted }]}>Marca</Text>
            </View>
            <Text style={[styles.detailItemValue, { color: theme.text }]}>
              {vehicle.brand || '--'}
            </Text>
          </View>

          <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />

          <View style={styles.detailRow}>
            <View style={styles.detailLabelGroup}>
              <Ionicons name="pricetag-outline" size={18} color={theme.textMuted} />
              <Text style={[styles.detailItemLabel, { color: theme.textMuted }]}>Modelo / Versão</Text>
            </View>
            <Text style={[styles.detailItemValue, { color: theme.text }]}>
              {vehicle.model || vehicle.name}
            </Text>
          </View>

          <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />

          <View style={styles.detailRow}>
            <View style={styles.detailLabelGroup}>
              <Ionicons name="card-outline" size={18} color={theme.textMuted} />
              <Text style={[styles.detailItemLabel, { color: theme.textMuted }]}>Placa</Text>
            </View>
            <View style={styles.smallPlateBadge}>
              <Text style={styles.smallPlateText}>{vehicle.plate}</Text>
            </View>
          </View>

          <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />

          <View style={styles.detailRow}>
            <View style={styles.detailLabelGroup}>
              <Ionicons name="calendar-outline" size={18} color={theme.textMuted} />
              <Text style={[styles.detailItemLabel, { color: theme.textMuted }]}>Ano de Fabricação</Text>
            </View>
            <Text style={[styles.detailItemValue, { color: theme.text }]}>
              {vehicle.year}
            </Text>
          </View>

          <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />

          <View style={styles.detailRow}>
            <View style={styles.detailLabelGroup}>
              <Ionicons name="speedometer-outline" size={18} color={theme.textMuted} />
              <Text style={[styles.detailItemLabel, { color: theme.textMuted }]}>Odômetro Atual</Text>
            </View>
            <Text style={[styles.detailItemValue, { color: theme.text, fontWeight: '800' }]}>
              {vehicle.currentOdometer.toLocaleString('pt-BR')} km
            </Text>
          </View>

          <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />

          <View style={styles.detailRow}>
            <View style={styles.detailLabelGroup}>
              <Ionicons name="water-outline" size={18} color={theme.textMuted} />
              <Text style={[styles.detailItemLabel, { color: theme.textMuted }]}>Capacidade do Tanque</Text>
            </View>
            <Text style={[styles.detailItemValue, { color: theme.text }]}>
              {vehicle.tankCapacity} Litros
            </Text>
          </View>

          <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />

          <View style={styles.detailRow}>
            <View style={styles.detailLabelGroup}>
              <Ionicons name="hardware-chip-outline" size={18} color={theme.textMuted} />
              <Text style={[styles.detailItemLabel, { color: theme.textMuted }]}>Motor / Cilindrada</Text>
            </View>
            <Text style={[styles.detailItemValue, { color: theme.text }]}>
              {vehicle.engineDisplacement ? formatEngineDisplacement(vehicle.engineDisplacement) : '--'}
            </Text>
          </View>

          <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />

          <View style={styles.detailRow}>
            <View style={styles.detailLabelGroup}>
              <Ionicons name="color-filter-outline" size={18} color={theme.textMuted} />
              <Text style={[styles.detailItemLabel, { color: theme.textMuted }]}>Combustíveis Aceitos</Text>
            </View>
            <Text style={[styles.detailItemValue, { color: theme.text, textTransform: 'capitalize' }]}>
              {fuelsDisplay}
            </Text>
          </View>

          {/* DATA DE CADASTRO */}
          <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />
          <View style={styles.detailRow}>
            <View style={styles.detailLabelGroup}>
              <Ionicons name="calendar-clear-outline" size={18} color={theme.textMuted} />
              <Text style={[styles.detailItemLabel, { color: theme.textMuted }]}>Data de Cadastro</Text>
            </View>
            <Text style={[styles.detailItemValue, { color: theme.text }]}>
              {formatDisplayDate(vehicle.createdAt)}
            </Text>
          </View>

          {/* DATA DE TRANSFERÊNCIA (CASO TENHA SIDO TRANSFERIDO DE OUTRO USUÁRIO) */}
          {vehicle.transferredAt ? (
            <>
              <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />
              <View style={styles.detailRow}>
                <View style={styles.detailLabelGroup}>
                  <Ionicons name="swap-horizontal" size={18} color="#8B5CF6" />
                  <Text style={[styles.detailItemLabel, { color: '#8B5CF6', fontWeight: '700' }]}>
                    Data de Transferência
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.detailItemValue, { color: '#8B5CF6', fontWeight: '700' }]}>
                    {formatDisplayDate(vehicle.transferredAt)}
                  </Text>
                  {vehicle.transferredFrom ? (
                    <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      De: {vehicle.transferredFrom}
                    </Text>
                  ) : null}
                </View>
              </View>
            </>
          ) : null}

          {/* STATUS DE COMPARTILHAMENTO */}
          {vehicle.isShared && vehicle.ownerEmail ? (
            <>
              <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />
              <View style={styles.detailRow}>
                <View style={styles.detailLabelGroup}>
                  <Ionicons name="person-outline" size={18} color="#3B82F6" />
                  <Text style={[styles.detailItemLabel, { color: '#3B82F6', fontWeight: '700' }]}>
                    Proprietário (Origem)
                  </Text>
                </View>
                <Text style={[styles.detailItemValue, { color: theme.text, fontWeight: '600' }]}>
                  {vehicle.ownerEmail}
                </Text>
              </View>
            </>
          ) : null}

          {!vehicle.isShared && vehicle.sharedWith && vehicle.sharedWith.length > 0 ? (
            <>
              <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />
              <TouchableOpacity
                style={styles.detailRow}
                onPress={handleOpenShare}
                activeOpacity={0.7}
              >
                <View style={styles.detailLabelGroup}>
                  <Ionicons name="people-outline" size={18} color="#0284C7" />
                  <Text style={[styles.detailItemLabel, { color: '#0284C7', fontWeight: '700' }]}>
                    Compartilhado Com
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.detailItemValue, { color: '#0284C7', fontWeight: '700' }]}>
                    {vehicle.sharedWith.length} usuário(s)
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#0284C7" />
                </View>
              </TouchableOpacity>
            </>
          ) : null}

          {/* MANUTENÇÃO PERIÓDICA DO BANCO (SE HOUVER) */}
          {vehicle.cadManPeriodica && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: theme.cardBorder }]} />
              <View style={styles.detailRow}>
                <View style={styles.detailLabelGroup}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={theme.accent} />
                  <Text style={[styles.detailItemLabel, { color: theme.accent, fontWeight: '700' }]}>
                    Plano Periódico
                  </Text>
                </View>
                <Text style={[styles.detailItemValue, { color: theme.accent, fontWeight: '700' }]}>
                  Ativo na Oficina
                </Text>
              </View>

              {vehicle.proxRevKm ? (
                <View style={styles.subDetailRow}>
                  <Text style={[styles.subDetailLabel, { color: theme.textMuted }]}>Próxima Revisão:</Text>
                  <Text style={[styles.subDetailValue, { color: theme.text }]}>
                    {vehicle.proxRevKm.toLocaleString('pt-BR')} km
                  </Text>
                </View>
              ) : null}

              {vehicle.proxTrocaOleoKm ? (
                <View style={styles.subDetailRow}>
                  <Text style={[styles.subDetailLabel, { color: theme.textMuted }]}>Próxima Troca de Óleo:</Text>
                  <Text style={[styles.subDetailValue, { color: theme.text }]}>
                    {vehicle.proxTrocaOleoKm.toLocaleString('pt-BR')} km
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* BOTÕES DE AÇÃO: RELATÓRIO PDF, COMPARTILHAR, TRANSFERIR, EDITAR E EXCLUIR */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[
              styles.pdfActionBtn,
              {
                borderColor: theme.accent,
                backgroundColor: theme.accentLight,
              },
            ]}
            onPress={handleExportPdf}
            activeOpacity={0.8}
            disabled={generatingPdf}
          >
            {generatingPdf ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Ionicons name="document-text-outline" size={20} color={theme.accent} />
            )}
            <Text style={[styles.pdfActionBtnText, { color: theme.accent }]}>
              {generatingPdf ? 'Gerando Relatório PDF...' : 'Gerar Relatório do Veículo em PDF'}
            </Text>
          </TouchableOpacity>

          {/* COMPARTILHAMENTO: APENAS PROPRIETÁRIO */}
          {!vehicle.isShared && (
            <TouchableOpacity
              style={[
                styles.shareActionBtn,
                {
                  borderColor: '#0284C7',
                  backgroundColor: isDark ? 'rgba(2, 132, 199, 0.15)' : 'rgba(2, 132, 199, 0.1)',
                },
              ]}
              onPress={handleOpenShare}
              activeOpacity={0.8}
              disabled={sharing}
            >
              <Ionicons name="people-outline" size={20} color="#0284C7" />
              <Text style={[styles.shareActionBtnText, { color: '#0284C7' }]}>
                Compartilhar Veículo
              </Text>
            </TouchableOpacity>
          )}

          {/* TRANSFERÊNCIA: APENAS PROPRIETÁRIO */}
          {!vehicle.isShared && (
            <TouchableOpacity
              style={[
                styles.transferActionBtn,
                {
                  borderColor: '#8B5CF6',
                  backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)',
                },
              ]}
              onPress={handleOpenTransfer}
              activeOpacity={0.8}
              disabled={transferring}
            >
              <Ionicons name="swap-horizontal" size={20} color="#8B5CF6" />
              <Text style={[styles.transferActionBtnText, { color: '#8B5CF6' }]}>
                Transferir Veículo para Outro Usuário
              </Text>
            </TouchableOpacity>
          )}

          {/* EDIÇÃO CADASTRAL: APENAS PROPRIETÁRIO */}
          {!vehicle.isShared && (
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: theme.accent }]}
              onPress={handleOpenEdit}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={20} color="#FFFFFF" />
              <Text style={styles.primaryActionBtnText}>Editar Informações do Veículo</Text>
            </TouchableOpacity>
          )}

          {/* EXCLUSÃO (PROPRIETÁRIO) OU SAIR DO COMPARTILHAMENTO (DESTINATÁRIO) */}
          {vehicle.isShared ? (
            <TouchableOpacity
              style={[
                styles.deleteActionBtn,
                {
                  borderColor: '#F59E0B',
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
                },
              ]}
              onPress={handleLeaveShared}
              activeOpacity={0.8}
            >
              <Ionicons name="exit-outline" size={18} color="#D97706" />
              <Text style={[styles.deleteActionBtnText, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                Sair do Compartilhamento deste Veículo
              </Text>
            </TouchableOpacity>
          ) : vehicles.length > 1 ? (
            <TouchableOpacity
              style={[styles.deleteActionBtn, { borderColor: theme.red, backgroundColor: theme.redLight }]}
              onPress={handleDelete}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={18} color={theme.red} />
              <Text style={[styles.deleteActionBtnText, { color: theme.red }]}>Excluir Veículo da Garagem</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      {/* MODAL DE EDIÇÃO DO VEÍCULO */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent={true}
        onRequestClose={() => {
          if (!saving) setModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (keyboardVisible) {
                Keyboard.dismiss();
              } else if (!saving) {
                setModalVisible(false);
              }
            }}
          />
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                maxHeight: keyboardVisible ? '92%' : '88%',
                paddingBottom: keyboardVisible ? 16 : Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Editar Veículo
              </Text>
              <TouchableOpacity
                onPress={() => !saving && setModalVisible(false)}
                disabled={saving}
                style={{ opacity: saving ? 0.5 : 1 }}
              >
                <Ionicons name="close-circle" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={modalScrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets={true}
              contentContainerStyle={{
                gap: 12,
                paddingBottom: keyboardVisible ? 140 : Math.max(insets.bottom, 20) + 20,
              }}
            >
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
                        Alterar Foto do Veículo
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

              {/* TIPO DE VEÍCULO (BLOQUEADO NA EDIÇÃO) */}
              <View style={styles.typeSelectorRow}>
                <View
                  style={[
                    styles.typeSelectorBtn,
                    {
                      backgroundColor: vehicleType === 'carro' ? theme.accent : theme.bg,
                      borderColor: theme.cardBorder,
                      opacity: vehicleType !== 'carro' ? 0.4 : 1,
                    },
                  ]}
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
                </View>

                <View
                  style={[
                    styles.typeSelectorBtn,
                    {
                      backgroundColor: vehicleType === 'moto' ? theme.accent : theme.bg,
                      borderColor: theme.cardBorder,
                      opacity: vehicleType !== 'moto' ? 0.4 : 1,
                    },
                  ]}
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
                </View>
              </View>

              {/* MARCA E MODELO (BLOQUEADOS NA EDIÇÃO) */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Marca:</Text>
                    <Ionicons name="lock-closed" size={12} color={theme.textMuted} />
                  </View>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? '#0A0F1D' : '#F1F5F9',
                        color: theme.textMuted,
                        borderColor: theme.cardBorder,
                      },
                    ]}
                    value={brand}
                    editable={false}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1.2 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Modelo / Apelido:</Text>
                    <Ionicons name="lock-closed" size={12} color={theme.textMuted} />
                  </View>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? '#0A0F1D' : '#F1F5F9',
                        color: theme.textMuted,
                        borderColor: theme.cardBorder,
                      },
                    ]}
                    value={name}
                    editable={false}
                  />
                </View>
              </View>

              {/* PLACA (BLOQUEADA NA EDIÇÃO) E ANO */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Placa:</Text>
                    <Ionicons name="lock-closed" size={12} color={theme.textMuted} />
                  </View>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? '#0A0F1D' : '#F1F5F9',
                        color: theme.textMuted,
                        borderColor: theme.cardBorder,
                      },
                    ]}
                    value={plate}
                    editable={false}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Ano:</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                    keyboardType="numeric"
                    value={year}
                    onChangeText={setYear}
                    onFocus={() => scrollToInput(160)}
                    placeholder="Ex: 2022"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>

              <View style={[styles.lockedNoticeRow, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
                <Ionicons name="lock-closed-outline" size={14} color={theme.textMuted} />
                <Text style={[styles.lockedNoticeText, { color: theme.textMuted }]}>
                  Marca, modelo e placa não podem ser alterados na edição.
                </Text>
              </View>

              {/* ODÔMETRO E CAPACIDADE DO TANQUE */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Odômetro Atual (km):</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                    keyboardType="numeric"
                    value={currentOdometer}
                    onChangeText={setCurrentOdometer}
                    onFocus={() => scrollToInput(220)}
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
                    onFocus={() => scrollToInput(220)}
                    placeholder={vehicleType === 'moto' ? '14' : '50'}
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>

              {/* CILINDRADA / MOTOR */}
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
                  onFocus={() => scrollToInput(300)}
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
                onPress={handleSaveEdit}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Salvando Alterações...</Text>
                  </>
                ) : (
                  <Text style={styles.saveBtnText}>Salvar Alterações</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: COMPARTILHAMENTO DE VEÍCULO */}
      <Modal
        visible={shareModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent={true}
        onRequestClose={() => {
          if (!sharing) setShareModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (keyboardVisible) {
                Keyboard.dismiss();
              } else if (!sharing) {
                setShareModalVisible(false);
              }
            }}
          />
          <View
            style={[
              styles.transferModalContainer,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                maxHeight: keyboardVisible ? '92%' : '88%',
              },
            ]}
          >
            {/* Header do Modal */}
            <View style={[styles.transferModalHeader, { borderBottomColor: theme.cardBorder }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={[
                    styles.transferModalIconBox,
                    { backgroundColor: isDark ? 'rgba(2, 132, 199, 0.2)' : '#E0F2FE' },
                  ]}
                >
                  <Ionicons name="people" size={20} color="#0284C7" />
                </View>
                <View>
                  <Text style={[styles.transferModalTitle, { color: theme.text }]}>
                    Compartilhar Veículo
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted }}>
                    Acesso compartilhado com outros usuários
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => !sharing && setShareModalVisible(false)}
                disabled={sharing}
                style={styles.transferModalCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={shareScrollRef}
              style={{ maxHeight: keyboardVisible ? 240 : 440 }}
              contentContainerStyle={{
                padding: 18,
                paddingBottom: keyboardVisible ? 24 : 18,
                gap: 14,
              }}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets={true}
              showsVerticalScrollIndicator={false}
            >
              {/* Resumo do Veículo */}
              <View
                style={[
                  styles.transferVehBanner,
                  { backgroundColor: theme.bg, borderColor: theme.cardBorder },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.transferVehName, { color: theme.text }]}>
                    {vehicle.name}
                  </Text>
                  <Text style={[styles.transferVehSub, { color: theme.textMuted }]}>
                    Placa: {vehicle.plate} • {displayBrandModel}
                  </Text>
                </View>
              </View>

              {/* Box de Informações */}
              <View
                style={[
                  styles.transferAlertBox,
                  {
                    backgroundColor: isDark ? 'rgba(2, 132, 199, 0.12)' : '#F0F9FF',
                    borderColor: isDark ? 'rgba(2, 132, 199, 0.3)' : '#BAE6FD',
                  },
                ]}
              >
                <Ionicons name="information-circle-outline" size={20} color="#0284C7" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.transferAlertTitle, { color: isDark ? '#38BDF8' : '#0369A1' }]}>
                    Acesso Compartilhado Completo
                  </Text>
                  <Text style={[styles.transferAlertText, { color: isDark ? '#BAE6FD' : '#075985' }]}>
                    Os usuários adicionados poderão acompanhar todo o histórico e registrar novos abastecimentos e manutenções do veículo. Apenas você (proprietário) pode alterar o cadastro ou transferir o veículo.
                  </Text>
                </View>
              </View>

              {/* Campo para adicionar novo usuário */}
              <View>
                <Text style={[styles.transferInputLabel, { color: theme.text }]}>
                  Adicionar usuário pelo e-mail
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <TextInput
                    style={[
                      styles.transferInput,
                      {
                        flex: 1,
                        backgroundColor: theme.bg,
                        borderColor: theme.cardBorder,
                        color: theme.text,
                      },
                    ]}
                    placeholder="usuario@email.com"
                    placeholderTextColor={theme.textMuted}
                    value={targetShareEmail}
                    onChangeText={setTargetShareEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!sharing}
                  />
                  <TouchableOpacity
                    style={[
                      styles.shareAddBtn,
                      {
                        backgroundColor: '#0284C7',
                        opacity: sharing || !targetShareEmail.trim() ? 0.6 : 1,
                      },
                    ]}
                    onPress={handleAddShareMember}
                    disabled={sharing || !targetShareEmail.trim()}
                  >
                    {sharing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="person-add" size={16} color="#FFFFFF" />
                        <Text style={styles.shareAddBtnText}>Adicionar</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={[styles.transferInputHelp, { color: theme.textMuted }]}>
                  O usuário precisa possuir cadastro no app ContaGiro com este e-mail.
                </Text>
              </View>

              {/* Lista de Membros Atuais */}
              <View style={{ marginTop: 4 }}>
                <Text style={[styles.transferInputLabel, { color: theme.text, marginBottom: 8 }]}>
                  Usuários com acesso ({vehicle.sharedWith?.length || 0})
                </Text>
                {vehicle.sharedWith && vehicle.sharedWith.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {vehicle.sharedWith.map((memberEmail) => (
                      <View
                        key={memberEmail}
                        style={[
                          styles.sharedMemberCard,
                          { backgroundColor: theme.bg, borderColor: theme.cardBorder },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <View
                            style={[
                              styles.sharedMemberAvatar,
                              { backgroundColor: isDark ? 'rgba(2, 132, 199, 0.2)' : '#E0F2FE' },
                            ]}
                          >
                            <Ionicons name="person" size={14} color="#0284C7" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.sharedMemberEmail, { color: theme.text }]} numberOfLines={1}>
                              {memberEmail}
                            </Text>
                            <Text style={{ fontSize: 11, color: theme.textMuted }}>
                              Pode abastecer e registrar manutenções
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.removeMemberBtn,
                            { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2' },
                          ]}
                          onPress={() => handleRemoveShareMember(memberEmail)}
                          disabled={sharing}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View
                    style={[
                      styles.emptySharedBox,
                      { backgroundColor: theme.bg, borderColor: theme.cardBorder },
                    ]}
                  >
                    <Ionicons name="people-outline" size={24} color={theme.textMuted} />
                    <Text style={[styles.emptySharedText, { color: theme.textMuted }]}>
                      Nenhum usuário adicionado ainda. Insira o e-mail acima para compartilhar.
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Rodapé com botão Concluir */}
            <View
              style={[
                styles.transferModalFooter,
                {
                  borderTopColor: theme.cardBorder,
                  paddingBottom: keyboardVisible ? 12 : Math.max(insets.bottom, 16),
                },
              ]}
            >
              <TouchableOpacity
                style={[styles.closeShareDetailBtn, { backgroundColor: '#0284C7' }]}
                onPress={() => setShareModalVisible(false)}
                disabled={sharing}
              >
                <Text style={styles.closeShareDetailBtnText}>Concluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: TRANSFERÊNCIA DE VEÍCULO */}
      <Modal
        visible={transferModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent={true}
        onRequestClose={() => {
          if (!transferring) setTransferModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (keyboardVisible) {
                Keyboard.dismiss();
              } else if (!transferring) {
                setTransferModalVisible(false);
              }
            }}
          />
          <View
            style={[
              styles.transferModalContainer,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                maxHeight: keyboardVisible ? '92%' : '88%',
              },
            ]}
          >
            {/* Header do Modal */}
            <View style={[styles.transferModalHeader, { borderBottomColor: theme.cardBorder }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={[
                    styles.transferModalIconBox,
                    { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.2)' : '#EDE9FE' },
                  ]}
                >
                  <Ionicons name="swap-horizontal" size={20} color="#8B5CF6" />
                </View>
                <View>
                  <Text style={[styles.transferModalTitle, { color: theme.text }]}>
                    Transferir Veículo
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted }}>
                    Mudança de titularidade do veículo
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => !transferring && setTransferModalVisible(false)}
                disabled={transferring}
                style={styles.transferModalCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={transferScrollRef}
              style={{ maxHeight: keyboardVisible ? 220 : 420 }}
              contentContainerStyle={{
                padding: 18,
                paddingBottom: keyboardVisible ? 24 : 18,
              }}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets={true}
              showsVerticalScrollIndicator={false}
            >
              {/* Resumo do Veículo */}
              <View
                style={[
                  styles.transferVehBanner,
                  { backgroundColor: theme.bg, borderColor: theme.cardBorder },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.transferVehName, { color: theme.text }]}>
                    {vehicle.name}
                  </Text>
                  <Text style={[styles.transferVehSub, { color: theme.textMuted }]}>
                    Placa: {vehicle.plate} • {refuelings.length} abastecimento(s) • {maintenances.length} manutenção(ões)
                  </Text>
                </View>
              </View>

              {/* Box de Alerta Informativo */}
              <View
                style={[
                  styles.transferAlertBox,
                  {
                    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
                    borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
                  },
                ]}
              >
                <Ionicons name="warning-outline" size={20} color="#D97706" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.transferAlertTitle, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                    Ação Definitiva e Irreversível
                  </Text>
                  <Text style={[styles.transferAlertText, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                    Ao confirmar, o cadastro do veículo e todo o histórico de abastecimentos e manutenções serão transferidos diretamente para o novo proprietário. O veículo deixará de aparecer na sua garagem.
                  </Text>
                </View>
              </View>

              {/* Campo de E-mail do Destinatário */}
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.transferInputLabel, { color: theme.text }]}>
                  E-mail do novo proprietário no ContaGiro
                </Text>
                <TextInput
                  style={[
                    styles.transferInput,
                    {
                      backgroundColor: theme.bg,
                      borderColor: theme.cardBorder,
                      color: theme.text,
                    },
                  ]}
                  placeholder="exemplo@email.com"
                  placeholderTextColor={theme.textMuted}
                  value={targetEmail}
                  onChangeText={setTargetEmail}
                  onFocus={() => {
                    setTimeout(() => {
                      transferScrollRef.current?.scrollToEnd({ animated: true });
                    }, 150);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!transferring}
                />
                <Text style={[styles.transferInputHelp, { color: theme.textMuted }]}>
                  O novo proprietário já deve possuir conta cadastrada no app ContaGiro.
                </Text>
              </View>
            </ScrollView>

            {/* Botões de Ação */}
            <View
              style={[
                styles.transferModalFooter,
                {
                  borderTopColor: theme.cardBorder,
                  paddingBottom: keyboardVisible ? 12 : Math.max(insets.bottom, 16),
                },
              ]}
            >
              <TouchableOpacity
                style={[styles.transferCancelBtn, { borderColor: theme.cardBorder }]}
                onPress={() => setTransferModalVisible(false)}
                disabled={transferring}
              >
                <Text style={[styles.transferCancelBtnText, { color: theme.textMuted }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.transferConfirmBtn,
                  { opacity: transferring || !targetEmail.trim() ? 0.6 : 1 },
                ]}
                onPress={handleConfirmTransfer}
                disabled={transferring || !targetEmail.trim()}
              >
                {transferring ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="swap-horizontal" size={18} color="#FFFFFF" />
                    <Text style={styles.transferConfirmBtnText}>Transferir Agora</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* POP-UP DO GRÁFICO DOS ÚLTIMOS 12 MESES */}
      {selectedChartMetric && (
        <VehicleMetricChartModal
          visible={chartModalVisible}
          metricType={selectedChartMetric}
          vehicle={vehicle}
          refuelings={refuelings}
          maintenances={maintenances}
          onClose={() => setChartModalVisible(false)}
          isDark={isDark}
          theme={theme}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerPdfBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerTransferBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerShareBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerEditBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerDeleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 36,
  },
  heroCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroPhoto: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  heroPhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroVehicleName: {
    fontSize: 20,
    fontWeight: '900',
  },
  heroVehicleModel: {
    fontSize: 13,
    fontWeight: '500',
  },
  heroBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  plateBadge: {
    backgroundColor: '#0F172A',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  plateText: {
    color: '#F8FAFC',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
  },
  typeBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusRow: {
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preferredTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  preferredTagText: {
    fontSize: 11,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  statsContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBox: {
    width: '48.5%',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  statBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statBoxLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  statBoxValue: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  statBoxSubtext: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  totalConsolidatedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  totalConsolidatedLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  totalConsolidatedSub: {
    fontSize: 10,
    fontWeight: '500',
  },
  totalConsolidatedValue: {
    fontSize: 17,
    fontWeight: '900',
  },
  detailsCard: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  detailLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailItemLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailItemValue: {
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '55%',
    textAlign: 'right',
  },
  smallPlateBadge: {
    backgroundColor: '#0F172A',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  smallPlateText: {
    color: '#F8FAFC',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
  },
  subDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingLeft: 26,
    paddingRight: 4,
  },
  subDetailLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  subDetailValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  rowDivider: {
    height: 1,
  },
  actionsContainer: {
    gap: 10,
    marginTop: 8,
  },
  pdfActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  pdfActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  transferActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  transferActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  deleteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  deleteActionBtnText: {
    fontSize: 13,
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
    flexShrink: 1,
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
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
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
  transferModalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 16,
  },
  transferModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  transferModalIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferModalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  transferModalCloseBtn: {
    padding: 4,
  },
  transferVehBanner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  transferVehName: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 3,
  },
  transferVehSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  transferAlertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  transferAlertTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  transferAlertText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  transferInputLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  transferInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  transferInputHelp: {
    fontSize: 11,
    marginTop: 6,
    fontWeight: '500',
  },
  transferModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  transferCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  transferCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  transferConfirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8B5CF6',
    paddingVertical: 14,
    borderRadius: 12,
  },
  transferConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  sharedHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  sharedHeroBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  shareActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  shareActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  shareAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  shareAddBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  sharedMemberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sharedMemberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sharedMemberEmail: {
    fontSize: 13,
    fontWeight: '700',
  },
  removeMemberBtn: {
    padding: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySharedBox: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptySharedText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '500',
  },
  closeShareDetailBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeShareDetailBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

