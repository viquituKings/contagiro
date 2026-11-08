import { StorageService } from '@/services/storage';
import { FuelType, Refueling, Vehicle } from '@/types/vehicle';
import { compareDatesDesc, formatDateToBR } from '@/utils/date';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RefuelingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [refuelings, setRefuelings] = useState<Refueling[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSwitchingVehicle, setIsSwitchingVehicle] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isSelectorExpanded, setIsSelectorExpanded] = useState(false);
  const latestSwitchRequestId = useRef(0);

  // Detalhes do Abastecimento e Edição
  const [selectedRefuelingDetails, setSelectedRefuelingDetails] = useState<Refueling | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [editingRefuelingId, setEditingRefuelingId] = useState<string | null>(null);

  // Formulário de Abastecimento
  const [odometer, setOdometer] = useState('');
  const [fuelType, setFuelType] = useState<FuelType>('gasolina');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [liters, setLiters] = useState('');
  const [isFullTank, setIsFullTank] = useState(true);
  const [isAdditivated, setIsAdditivated] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

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

  const getLocalDateString = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDisplayDate = (d: Date): string => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const isToday = new Date().toDateString() === d.toDateString();
    return `${day}/${month}/${year}${isToday ? ' (Hoje)' : ''}`;
  };

  const loadData = async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);
    try {
      const allVehicles = await StorageService.getVehicles();
      setVehicles(allVehicles);

      const curVehicle = await StorageService.getActiveVehicle();
      setVehicle(curVehicle);

      if (curVehicle) {
        const list = await StorageService.getRefuelings(curVehicle.id);
        setRefuelings(list);
        setOdometer(String(curVehicle.currentOdometer));
        if (curVehicle.acceptedFuelTypes && curVehicle.acceptedFuelTypes.length > 0) {
          setFuelType(curVehicle.acceptedFuelTypes[0]);
        }
      } else {
        setRefuelings([]);
      }
    } catch (err) {
      console.error('Erro ao carregar abastecimentos:', err);
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

  const handleSelectVehicle = async (veh: Vehicle) => {
    setIsSelectorExpanded(false);
    if (veh.id === vehicle?.id && !isSwitchingVehicle) return;

    const requestId = ++latestSwitchRequestId.current;
    setIsSwitchingVehicle(true);
    setVehicle(veh);
    setOdometer(String(veh.currentOdometer));
    if (veh.acceptedFuelTypes && veh.acceptedFuelTypes.length > 0) {
      setFuelType(veh.acceptedFuelTypes[0]);
    }
    setRefuelings([]);

    try {
      await StorageService.setActiveVehicleId(veh.id);
      const list = await StorageService.getRefuelings(veh.id);
      if (requestId === latestSwitchRequestId.current) {
        setRefuelings(list);
      }
    } catch (err) {
      console.error('Erro ao trocar de veículo:', err);
    } finally {
      if (requestId === latestSwitchRequestId.current) {
        setIsSwitchingVehicle(false);
      }
    }
  };

  // Cálculo dinâmico entre Litros e Valor Total ao digitar
  const handlePriceChange = (val: string) => {
    setPricePerLiter(val);
    const p = parseFloat(val.replace(',', '.'));
    const t = parseFloat(totalAmount.replace(',', '.'));
    if (!isNaN(p) && p > 0 && !isNaN(t) && t > 0) {
      setLiters((t / p).toFixed(2));
    }
  };

  const handleTotalChange = (val: string) => {
    setTotalAmount(val);
    const t = parseFloat(val.replace(',', '.'));
    const p = parseFloat(pricePerLiter.replace(',', '.'));
    if (!isNaN(t) && !isNaN(p) && p > 0) {
      setLiters((t / p).toFixed(2));
    }
  };

  const handleLitersChange = (val: string) => {
    setLiters(val);
    const l = parseFloat(val.replace(',', '.'));
    const p = parseFloat(pricePerLiter.replace(',', '.'));
    if (!isNaN(l) && !isNaN(p) && p > 0) {
      setTotalAmount((l * p).toFixed(2));
    }
  };

  const handleSelectFuelType = async (f: FuelType) => {
    setFuelType(f);
    try {
      const prices = await StorageService.getLatestFuelPrices();
      if (prices && prices[f] > 0) {
        setPricePerLiter(prices[f].toFixed(2).replace('.', ','));
        if (totalAmount) {
          const tot = parseFloat(totalAmount.replace(',', '.'));
          if (tot > 0) {
            setLiters((tot / prices[f]).toFixed(2).replace('.', ','));
          }
        }
      }
    } catch {
      // Ignora erro
    }
  };

  const handleOpenDetails = (item: Refueling) => {
    setSelectedRefuelingDetails(item);
    setDetailsModalVisible(true);
  };

  const handleEditRefueling = (item: Refueling) => {
    if (isSwitchingVehicle) return;
    setDetailsModalVisible(false);
    setEditingRefuelingId(item.id);
    setOdometer(String(item.odometer));
    setFuelType(item.fuelType);
    setPricePerLiter(item.pricePerLiter ? item.pricePerLiter.toFixed(2).replace('.', ',') : '');
    setTotalAmount(item.totalAmount ? item.totalAmount.toFixed(2).replace('.', ',') : '');
    setLiters(item.liters ? item.liters.toFixed(2).replace('.', ',') : '');
    setIsFullTank(item.isFullTank);
    setIsAdditivated(Boolean(item.isAdditivated));
    setNotes(item.notes || item.gasStation || '');
    if (item.date) {
      try {
        const [y, m, d] = item.date.split('T')[0].split('-');
        setSelectedDate(new Date(Number(y), Number(m) - 1, Number(d)));
      } catch {
        setSelectedDate(new Date());
      }
    }
    setShowDatePicker(false);
    setModalVisible(true);
  };

  const handleOpenModal = async () => {
    if (isSwitchingVehicle) return;
    if (!vehicle) {
      Alert.alert('Atenção', 'Cadastre ou selecione um veículo na Garagem antes de abastecer.');
      return;
    }
    setEditingRefuelingId(null);
    setOdometer(String(vehicle.currentOdometer || ''));
    const initialFuel =
      vehicle.acceptedFuelTypes && vehicle.acceptedFuelTypes.length > 0
        ? vehicle.acceptedFuelTypes[0]
        : 'gasolina';
    setFuelType(initialFuel);

    try {
      const prices = await StorageService.getLatestFuelPrices();
      if (prices && prices[initialFuel] > 0) {
        setPricePerLiter(prices[initialFuel].toFixed(2).replace('.', ','));
      } else {
        setPricePerLiter('');
      }
    } catch {
      setPricePerLiter('');
    }

    setTotalAmount('');
    setLiters('');
    setIsFullTank(true);
    setIsAdditivated(false);
    setNotes('');
    setSelectedDate(new Date());
    setShowDatePicker(false);
    setModalVisible(true);
  };

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'set' && date) {
      setSelectedDate(date);
    }
  };

  const saveRefuelingItem = async (
    odomNum: number,
    priceNum: number,
    totalNum: number,
    litersNum: number
  ) => {
    if (!vehicle || saving) return;

    setSaving(true);
    try {
      const calculatedLiters =
        isNaN(litersNum) || litersNum <= 0
          ? Number((totalNum / priceNum).toFixed(2))
          : litersNum;

      const newRef: Refueling = {
        id: editingRefuelingId || ('ref-' + Date.now()),
        vehicleId: vehicle.id,
        plate: vehicle.plate,
        date: getLocalDateString(selectedDate),
        odometer: odomNum,
        fuelType,
        pricePerLiter: priceNum,
        totalAmount: totalNum,
        liters: calculatedLiters,
        isFullTank,
        isAdditivated,
        notes: notes.trim() || undefined,
        gasStation: notes.trim() || undefined,
        registeredBy: editingRefuelingId
          ? selectedRefuelingDetails?.registeredBy
          : undefined,
      };

      await StorageService.addRefueling(newRef);
      setModalVisible(false);
      setEditingRefuelingId(null);
      await loadData();
    } catch (err) {
      console.error('Erro ao salvar abastecimento:', err);
      Alert.alert('Erro', 'Ocorreu um erro ao salvar o abastecimento. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!vehicle || saving) return;

    const odomNum = parseInt(odometer, 10);
    const priceNum = parseFloat(pricePerLiter.replace(',', '.'));
    const totalNum = parseFloat(totalAmount.replace(',', '.'));
    const litersNum = parseFloat(liters.replace(',', '.'));

    if (isNaN(odomNum) || odomNum <= 0) {
      Alert.alert('Erro', 'Insira uma quilometragem válida.');
      return;
    }
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Erro', 'Insira um preço por litro válido.');
      return;
    }
    if (isNaN(totalNum) || totalNum <= 0) {
      Alert.alert('Erro', 'Insira o valor total abastecido.');
      return;
    }

    if (!editingRefuelingId && odomNum < vehicle.currentOdometer) {
      Alert.alert(
        'Atenção',
        `A quilometragem informada (${odomNum} km) é menor que a atual (${vehicle.currentOdometer} km). Deseja continuar?`,
        [
          { text: 'Corrigir', style: 'cancel' },
          {
            text: 'Continuar',
            onPress: () => saveRefuelingItem(odomNum, priceNum, totalNum, litersNum),
          },
        ]
      );
      return;
    }

    await saveRefuelingItem(odomNum, priceNum, totalNum, litersNum);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Excluir Abastecimento', 'Deseja realmente remover este registro do histórico e do banco de dados?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setDetailsModalVisible(false);
          await StorageService.deleteRefueling(id, vehicle?.id);
          await loadData();
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
    amber: '#F59E0B',
  };

  const getFuelBadgeColor = (type: FuelType) => {
    switch (type) {
      case 'gasolina':
        return '#EF4444';
      case 'etanol':
        return '#10B981';
      case 'diesel':
        return '#3B82F6';
      case 'gnv':
        return '#8B5CF6';
    }
  };

  // Métricas agregadas do veículo selecionado
  const totalSpent = refuelings.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalLiters = refuelings.reduce((sum, r) => sum + r.liters, 0);
  const validConsumptions = refuelings
    .map((r) => r.consumptionKmPerLiter)
    .filter((c): c is number => typeof c === 'number' && c > 0 && c < 50);
  const avgConsumption =
    validConsumptions.length > 0
      ? (validConsumptions.reduce((a, b) => a + b, 0) / validConsumptions.length).toFixed(2)
      : null;

  // Combustíveis aceitos pelo veículo (limita no cadastro)
  const availableFuels: FuelType[] =
    vehicle?.acceptedFuelTypes && vehicle.acceptedFuelTypes.length > 0
      ? vehicle.acceptedFuelTypes
      : ['gasolina', 'etanol'];

  // Registros em ordem decrescente (do mais recente para o mais antigo)
  const sortedRefuelings = useMemo(() => {
    return [...refuelings].sort(compareDatesDesc);
  }, [refuelings]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Abastecimentos</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                {vehicle ? `${vehicle.name} (${vehicle.plate})` : 'Nenhum veículo ativo'}
              </Text>
              {isSwitchingVehicle && (
                <View
                  style={[
                    styles.switchingBadge,
                    {
                      backgroundColor: isDark
                        ? 'rgba(16, 185, 129, 0.2)'
                        : 'rgba(16, 185, 129, 0.12)',
                    },
                  ]}
                >
                  <Text style={[styles.switchingBadgeText, { color: theme.accent }]}>
                    Carregando...
                  </Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity
            disabled={isSwitchingVehicle}
            style={[
              styles.addBtn,
              { backgroundColor: theme.accent, opacity: isSwitchingVehicle ? 0.6 : 1 },
            ]}
            onPress={handleOpenModal}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Abastecer</Text>
          </TouchableOpacity>
        </View>

        {/* SELETOR COMPACTO DE VEÍCULOS */}
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
                          disabled={isSwitchingVehicle}
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
                              opacity: isSwitchingVehicle && !isSelected ? 0.6 : 1,
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
                  disabled={isSwitchingVehicle}
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

        {/* RESUMO GERAL DO VEÍCULO (KPIS) */}
        {!isSwitchingVehicle && !loading && refuelings.length > 0 && (
          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>Média Geral</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                <Text style={[styles.kpiValue, { color: theme.accent }]}>
                  {avgConsumption ?? '--'}
                </Text>
                <Text style={[styles.kpiUnit, { color: theme.textMuted }]}>km/L</Text>
              </View>
            </View>

            <View style={[styles.kpiDivider, { backgroundColor: theme.cardBorder }]} />

            <View style={styles.kpiItem}>
              <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>Total Gasto</Text>
              <Text style={[styles.kpiValue, { color: theme.text }]}>
                R$ {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Text>
            </View>

            <View style={[styles.kpiDivider, { backgroundColor: theme.cardBorder }]} />

            <View style={styles.kpiItem}>
              <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>Total Litros</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                <Text style={[styles.kpiValue, { color: theme.text }]}>
                  {totalLiters.toFixed(0)}
                </Text>
                <Text style={[styles.kpiUnit, { color: theme.textMuted }]}>L</Text>
              </View>
            </View>
          </View>
        )}

        {/* LOADING (INICIAL OU DURANTE TROCA DE VEÍCULO) */}
        {loading || isSwitchingVehicle ? (
          <View style={[styles.loadingContainer, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={[styles.loadingIconCircle, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
            <Text style={[styles.loadingTitle, { color: theme.text }]}>
              {isSwitchingVehicle
                ? `Carregando dados de ${vehicle?.name || 'veículo'}...`
                : 'Carregando abastecimentos...'}
            </Text>
            <Text style={[styles.loadingSubtitle, { color: theme.textMuted }]}>
              {isSwitchingVehicle
                ? 'Aguarde enquanto os abastecimentos e médias estão sendo preparados.'
                : 'Sincronizando com o banco de dados...'}
            </Text>
          </View>
        ) : (
          /* LISTA DE ABASTECIMENTOS */
          <FlatList
            data={sortedRefuelings}
            keyExtractor={(item) => item.id}
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
              <View style={[styles.emptyContainer, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <Ionicons name="water-outline" size={48} color={theme.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhum abastecimento encontrado</Text>
                <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                  {'Toque no botão "+ Abastecer" acima para registrar seu primeiro abastecimento.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleOpenDetails(item)}
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
              >
                <View style={styles.cardTopRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                    <View
                      style={[
                        styles.fuelBadge,
                        { backgroundColor: getFuelBadgeColor(item.fuelType) + '22' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.fuelBadgeText,
                          { color: getFuelBadgeColor(item.fuelType) },
                        ]}
                      >
                        {item.fuelType.toUpperCase()}
                      </Text>
                    </View>

                    {item.isAdditivated && (
                      <View style={[styles.additivatedBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF' }]}>
                        <Ionicons name="flash" size={11} color="#3B82F6" />
                        <Text style={[styles.additivatedText, { color: '#3B82F6' }]}>Aditivado</Text>
                      </View>
                    )}

                    <Text style={[styles.dateText, { color: theme.textMuted }]}>{formatDateToBR(item.date)}</Text>

                    {item.isFullTank && (
                      <View style={styles.fullTankBadge}>
                        <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                        <Text style={styles.fullTankText}>Tanque Cheio</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleDelete(item.id);
                    }}
                  >
                    <Ionicons name="trash-outline" size={17} color="#EF4444" />
                  </TouchableOpacity>
                </View>

                <View style={styles.cardMidRow}>
                  <View>
                    <Text style={[styles.totalAmount, { color: theme.text }]}>
                      R$ {item.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={[styles.litersAndPrice, { color: theme.textMuted }]}>
                      {item.liters.toFixed(2)} L × R$ {item.pricePerLiter.toFixed(2)}/L
                    </Text>
                  </View>

                  {item.consumptionKmPerLiter ? (
                    <View style={styles.consumptionBox}>
                      <Text style={[styles.consumptionValue, { color: theme.accent }]}>
                        {item.consumptionKmPerLiter} <Text style={{ fontSize: 11 }}>km/L</Text>
                      </Text>
                      {item.costPerKm && (
                        <Text style={[styles.costPerKmText, { color: theme.textMuted }]}>
                          R$ {item.costPerKm.toFixed(2)}/km
                        </Text>
                      )}
                    </View>
                  ) : (
                    <View style={styles.noCalcBox}>
                      <Text style={[styles.noCalcText, { color: theme.textMuted }]}>
                        {item.isFullTank ? 'Tanque Base' : 'Parcial'}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={[styles.cardFooter, { borderTopColor: theme.cardBorder }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="speedometer-outline" size={14} color={theme.textMuted} />
                    <Text style={[styles.odometerText, { color: theme.textMuted }]}>
                      {item.odometer.toLocaleString('pt-BR')} km
                    </Text>
                    {item.distanceTraveled != null && item.distanceTraveled > 0 && (
                      <Text style={[styles.distanceText, { color: theme.accent }]}>
                        (+{item.distanceTraveled} km rodados)
                      </Text>
                    )}
                  </View>
                  {(item.notes || item.gasStation) && (
                    <Text style={[styles.gasStationText, { color: theme.textMuted }]} numberOfLines={1}>
                      {item.notes || item.gasStation}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {/* MODAL: DETALHES DO ABASTECIMENTO */}
        <Modal
          visible={detailsModalVisible}
          transparent
          animationType="slide"
          statusBarTranslucent={true}
          onRequestClose={() => setDetailsModalVisible(false)}
        >
          <View style={styles.detailsModalOverlay}>
            <View
              style={[
                styles.detailsModalContent,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                  paddingBottom: Math.max(insets.bottom, 16) + 8,
                },
              ]}
            >
              {selectedRefuelingDetails && (
                <>
                  {/* BARRA SUPERIOR DO MODAL DE DETALHES */}
                  <View style={[styles.detailsModalHeader, { borderBottomColor: theme.cardBorder }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.detailsModalTitle, { color: theme.text }]}>
                        Detalhes do Abastecimento
                      </Text>
                      <Text style={[styles.detailsModalSubtitle, { color: theme.textMuted }]}>
                        {formatDateToBR(selectedRefuelingDetails.date)} • {vehicle?.name || 'Veículo'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setDetailsModalVisible(false)}
                      style={[styles.closeIconBtn, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}
                    >
                      <Ionicons name="close" size={18} color={theme.text} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.detailsScrollContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {/* CARD: INFORMAÇÕES GERAIS */}
                    <View style={[styles.detailsSectionCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                      <View style={styles.detailRow}>
                        <View style={styles.detailRowLeft}>
                          <Ionicons name="flame-outline" size={16} color={getFuelBadgeColor(selectedRefuelingDetails.fuelType)} />
                          <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Combustível:</Text>
                        </View>
                        <View
                          style={[
                            styles.fuelBadge,
                            { backgroundColor: getFuelBadgeColor(selectedRefuelingDetails.fuelType) + '22' },
                          ]}
                        >
                          <Text style={[styles.fuelBadgeText, { color: getFuelBadgeColor(selectedRefuelingDetails.fuelType) }]}>
                            {selectedRefuelingDetails.fuelType.toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.detailRow}>
                        <View style={styles.detailRowLeft}>
                          <Ionicons name="flash-outline" size={16} color="#3B82F6" />
                          <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Aditivado:</Text>
                        </View>
                        <Text style={[styles.detailRowValue, { color: selectedRefuelingDetails.isAdditivated ? '#3B82F6' : theme.text }]}>
                          {selectedRefuelingDetails.isAdditivated ? 'Sim' : 'Não'}
                        </Text>
                      </View>

                      <View style={styles.detailRow}>
                        <View style={styles.detailRowLeft}>
                          <Ionicons name="water-outline" size={16} color="#10B981" />
                          <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Status do Tanque:</Text>
                        </View>
                        <Text style={[styles.detailRowValue, { color: selectedRefuelingDetails.isFullTank ? '#10B981' : theme.text }]}>
                          {selectedRefuelingDetails.isFullTank ? 'Tanque Cheio' : 'Abastecimento Parcial'}
                        </Text>
                      </View>
                    </View>

                    {/* CARD: VALORES E VOLUME */}
                    <View style={[styles.detailsSectionCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                      <View style={styles.detailRow}>
                        <View style={styles.detailRowLeft}>
                          <Ionicons name="cash-outline" size={16} color={theme.accent} />
                          <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Valor Total:</Text>
                        </View>
                        <Text style={[styles.detailRowValue, { color: theme.accent, fontWeight: '800', fontSize: 16 }]}>
                          R$ {selectedRefuelingDetails.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>

                      <View style={styles.detailRow}>
                        <View style={styles.detailRowLeft}>
                          <Ionicons name="color-fill-outline" size={16} color={theme.blue} />
                          <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Quantidade:</Text>
                        </View>
                        <Text style={[styles.detailRowValue, { color: theme.text }]}>
                          {selectedRefuelingDetails.liters.toFixed(2)} L
                        </Text>
                      </View>

                      <View style={styles.detailRow}>
                        <View style={styles.detailRowLeft}>
                          <Ionicons name="pricetag-outline" size={16} color={theme.textMuted} />
                          <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Preço por Litro:</Text>
                        </View>
                        <Text style={[styles.detailRowValue, { color: theme.text }]}>
                          R$ {selectedRefuelingDetails.pricePerLiter.toFixed(2)} / L
                        </Text>
                      </View>
                    </View>

                    {/* CARD: QUILOMETRAGEM E DESEMPENHO */}
                    <View style={[styles.detailsSectionCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                      <View style={styles.detailRow}>
                        <View style={styles.detailRowLeft}>
                          <Ionicons name="speedometer-outline" size={16} color={theme.textMuted} />
                          <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Quilometragem:</Text>
                        </View>
                        <Text style={[styles.detailRowValue, { color: theme.text, fontWeight: '700' }]}>
                          {selectedRefuelingDetails.odometer.toLocaleString('pt-BR')} km
                        </Text>
                      </View>

                      {selectedRefuelingDetails.previousOdometer != null && (
                        <View style={styles.detailRow}>
                          <View style={styles.detailRowLeft}>
                            <Ionicons name="arrow-back-outline" size={16} color={theme.textMuted} />
                            <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Km Anterior:</Text>
                          </View>
                          <Text style={[styles.detailRowValue, { color: theme.text }]}>
                            {selectedRefuelingDetails.previousOdometer.toLocaleString('pt-BR')} km
                          </Text>
                        </View>
                      )}

                      {selectedRefuelingDetails.distanceTraveled != null && selectedRefuelingDetails.distanceTraveled > 0 && (
                        <View style={styles.detailRow}>
                          <View style={styles.detailRowLeft}>
                            <Ionicons name="navigate-outline" size={16} color={theme.accent} />
                            <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Distância Rodada:</Text>
                          </View>
                          <Text style={[styles.detailRowValue, { color: theme.accent, fontWeight: '700' }]}>
                            +{selectedRefuelingDetails.distanceTraveled.toLocaleString('pt-BR')} km
                          </Text>
                        </View>
                      )}

                      {selectedRefuelingDetails.consumptionKmPerLiter ? (
                        <View style={styles.detailRow}>
                          <View style={styles.detailRowLeft}>
                            <Ionicons name="speedometer" size={16} color={theme.accent} />
                            <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Média de Consumo:</Text>
                          </View>
                          <Text style={[styles.detailRowValue, { color: theme.accent, fontWeight: '800' }]}>
                            {selectedRefuelingDetails.consumptionKmPerLiter} km/L
                          </Text>
                        </View>
                      ) : null}

                      {selectedRefuelingDetails.costPerKm ? (
                        <View style={styles.detailRow}>
                          <View style={styles.detailRowLeft}>
                            <Ionicons name="cash" size={16} color={theme.blue} />
                            <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Custo por Km:</Text>
                          </View>
                          <Text style={[styles.detailRowValue, { color: theme.blue, fontWeight: '700' }]}>
                            R$ {selectedRefuelingDetails.costPerKm.toFixed(2)}/km
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* OBSERVAÇÕES / POSTO */}
                    {(selectedRefuelingDetails.notes || selectedRefuelingDetails.gasStation) ? (
                      <View style={[styles.detailsSectionCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <Ionicons name="reader-outline" size={16} color={theme.blue} />
                          <Text style={[styles.detailsSectionTitle, { color: theme.text }]}>Observações / Posto</Text>
                        </View>
                        <Text style={[styles.detailsNotesText, { color: theme.text }]}>
                          {selectedRefuelingDetails.notes || selectedRefuelingDetails.gasStation}
                        </Text>
                      </View>
                    ) : null}

                    {/* AUDITORIA: REGISTRADO POR */}
                    {selectedRefuelingDetails.registeredBy ? (
                      <View style={[styles.detailsSectionCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                        <View style={styles.detailRow}>
                          <View style={styles.detailRowLeft}>
                            <Ionicons name="person-outline" size={16} color={theme.blue} />
                            <Text style={[styles.detailRowLabel, { color: theme.textMuted }]}>Registrado por:</Text>
                          </View>
                          <Text style={[styles.detailRowValue, { color: theme.text, fontWeight: '700' }]}>
                            {selectedRefuelingDetails.registeredBy}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </ScrollView>

                  {/* AÇÕES FIXAS NO RODAPÉ DO MODAL */}
                  <View style={[styles.detailsActionsRow, { borderTopColor: theme.cardBorder }]}>
                    <TouchableOpacity
                      style={[
                        styles.deleteDetailBtn,
                        { borderColor: isDark ? '#7F1D1D' : '#FCA5A5' },
                      ]}
                      onPress={() => handleDelete(selectedRefuelingDetails.id)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      <Text style={[styles.deleteDetailBtnText, { color: '#EF4444' }]}>Excluir</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.editDetailBtn,
                        { borderColor: theme.cardBorder, backgroundColor: theme.bg },
                      ]}
                      onPress={() => handleEditRefueling(selectedRefuelingDetails)}
                    >
                      <Ionicons name="create-outline" size={16} color={theme.blue} />
                      <Text style={[styles.editDetailBtnText, { color: theme.blue }]}>Editar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.closeDetailBtn, { backgroundColor: theme.accent, flex: 1 }]}
                      onPress={() => setDetailsModalVisible(false)}
                    >
                      <Text style={styles.closeDetailBtnText}>Fechar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* MODAL NOVO ABASTECIMENTO */}
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
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    {editingRefuelingId ? 'Editar Abastecimento' : 'Novo Abastecimento'}
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>
                    {vehicle?.name} ({vehicle?.plate})
                  </Text>
                </View>
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
                  paddingBottom: keyboardVisible ? 140 : 30,
                }}
              >
                {/* SELETOR DE COMBUSTÍVEL (LIMITADO AOS ACEITOS PELO VEÍCULO) */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
                    Combustível Aceito:
                  </Text>
                  <View style={styles.fuelSelector}>
                    {availableFuels.map((f) => {
                      const isSelected = fuelType === f;
                      return (
                        <TouchableOpacity
                          key={f}
                          style={[
                            styles.fuelOption,
                            {
                              backgroundColor: isSelected ? theme.accent : theme.bg,
                              borderColor: isSelected ? theme.accent : theme.cardBorder,
                            },
                          ]}
                          onPress={() => handleSelectFuelType(f)}
                        >
                          <Text
                            style={[
                              styles.fuelOptionText,
                              { color: isSelected ? '#FFFFFF' : theme.text },
                            ]}
                          >
                            {f.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* DATA (COM SELETOR DE DATA) E ODÔMETRO */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1.1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Data do Abastecimento:</Text>
                    <TouchableOpacity
                      style={[
                        styles.datePickerBtn,
                        { backgroundColor: theme.bg, borderColor: theme.cardBorder },
                      ]}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={17} color={theme.accent} />
                      <Text style={[styles.datePickerBtnText, { color: theme.text }]}>
                        {formatDisplayDate(selectedDate)}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Odômetro Atual (km):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={odometer}
                      onChangeText={setOdometer}
                      onFocus={() => scrollToInput(60)}
                      placeholder="Ex: 38450"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>
                </View>

                {/* PICKER NATIVO DE DATA */}
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleDateChange}
                    maximumDate={new Date()}
                  />
                )}

                {/* PREÇO E VALOR TOTAL */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Preço / Litro (R$):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={pricePerLiter}
                      onChangeText={handlePriceChange}
                      onFocus={() => scrollToInput(140)}
                      placeholder="Ex: 5,89"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Valor Total (R$):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={totalAmount}
                      onChangeText={handleTotalChange}
                      onFocus={() => scrollToInput(140)}
                      placeholder="Ex: 235,60"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>
                </View>

                {/* LITROS E OBSERVAÇÕES */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Litros Abastecidos:</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={liters}
                      onChangeText={handleLitersChange}
                      onFocus={() => scrollToInput(220)}
                      placeholder="Ex: 40,00"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1.2 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Observações (Opcional):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      value={notes}
                      onChangeText={setNotes}
                      onFocus={() => scrollToInput(240)}
                      placeholder="Ex: Posto Ipiranga, cidade..."
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>
                </View>

                {/* SWITCHES TANQUE CHEIO E ADITIVADO */}
                <View style={[styles.switchRow, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.switchTitle, { color: theme.text }]}>Tanque Cheio?</Text>
                    <Text style={[styles.switchDesc, { color: theme.textMuted }]}>
                      Necessário para calcular a média de consumo (km/L).
                    </Text>
                  </View>
                  <Switch
                    value={isFullTank}
                    onValueChange={setIsFullTank}
                    trackColor={{ false: '#334155', true: theme.accent }}
                  />
                </View>

                <View style={[styles.switchRow, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.switchTitle, { color: theme.text }]}>Combustível Aditivado?</Text>
                    <Text style={[styles.switchDesc, { color: theme.textMuted }]}>
                      Identifica uso de aditivos de limpeza e desempenho.
                    </Text>
                  </View>
                  <Switch
                    value={isAdditivated}
                    onValueChange={setIsAdditivated}
                    trackColor={{ false: '#334155', true: '#3B82F6' }}
                  />
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
                        {editingRefuelingId ? 'Atualizando...' : 'Salvando Abastecimento...'}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {editingRefuelingId ? 'Atualizar Abastecimento' : 'Salvar Abastecimento'}
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
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
    paddingTop: 16,
    paddingBottom: 0,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
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
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  kpiItem: {
    alignItems: 'center',
    flex: 1,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  kpiUnit: {
    fontSize: 11,
    fontWeight: '600',
  },
  kpiDivider: {
    width: 1,
    height: 28,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    marginVertical: 8,
    gap: 8,
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
    maxWidth: 280,
    lineHeight: 18,
  },
  switchingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  switchingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  listContent: {
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fuelBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  fuelBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  additivatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  additivatedText: {
    fontSize: 10,
    fontWeight: '700',
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fullTankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  fullTankText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  cardMidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '900',
  },
  litersAndPrice: {
    fontSize: 12,
    marginTop: 2,
  },
  consumptionBox: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  consumptionValue: {
    fontSize: 17,
    fontWeight: '900',
  },
  costPerKmText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noCalcBox: {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  noCalcText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  odometerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  distanceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  gasStationText: {
    fontSize: 11,
    fontStyle: 'italic',
    maxWidth: '55%',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
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
    gap: 12,
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
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  fuelSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  fuelOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  fuelOptionText: {
    fontSize: 11,
    fontWeight: '800',
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
    fontSize: 14,
    fontWeight: '700',
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 11,
  },
  datePickerBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  switchDesc: {
    fontSize: 11,
    marginTop: 2,
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
  detailsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  detailsModalContent: {
    maxHeight: '90%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  detailsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  detailsModalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  detailsModalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsScrollContent: {
    paddingVertical: 16,
    gap: 12,
  },
  detailsSectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  detailsSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  detailsNotesText: {
    fontSize: 13,
    lineHeight: 18,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  detailRowLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailRowValue: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  detailsActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  deleteDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  deleteDetailBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  editDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  editDetailBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  closeDetailBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeDetailBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
