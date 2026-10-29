import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  useColorScheme,
  ScrollView,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { StorageService } from '@/services/storage';
import { Calculations } from '@/services/calculations';
import { Vehicle, MaintenanceItem, MaintenanceCategory } from '@/types/vehicle';
import { formatDateToBR } from '@/utils/date';

export default function MaintenancesScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [maintenances, setMaintenances] = useState<MaintenanceItem[]>([]);
  const [activeTab, setActiveTab] = useState<'alertas' | 'historico'>('alertas');
  const [loading, setLoading] = useState(true);
  const [isSwitchingVehicle, setIsSwitchingVehicle] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSelectorExpanded, setIsSelectorExpanded] = useState(false);
  const latestSwitchRequestId = useRef(0);

  // Modais
  const [modalMntVisible, setModalMntVisible] = useState(false);
  const [modalPeriodicVisible, setModalPeriodicVisible] = useState(false);
  const [savingMnt, setSavingMnt] = useState(false);
  const [savingPeriodic, setSavingPeriodic] = useState(false);

  // Formulário: Registrar Manutenção
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('oleo_filtro');
  const [cost, setCost] = useState('');
  const [odometer, setOdometer] = useState('');
  const [workshop, setWorkshop] = useState('');
  const [nextIntervalKm, setNextIntervalKm] = useState('10000');
  const [selectedSide, setSelectedSide] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Formulário: Cadastro e Edição de Periodicidade
  const [periodicUltimaRevKm, setPeriodicUltimaRevKm] = useState('');
  const [periodicRevKm, setPeriodicRevKm] = useState('10000');
  const [periodicRevMes, setPeriodicRevMes] = useState('12');
  const [periodicUltimaTrocaOleoKm, setPeriodicUltimaTrocaOleoKm] = useState('');
  const [periodicTrocaOleoKm, setPeriodicTrocaOleoKm] = useState('10000');
  const [periodicTrocaOleoMeses, setPeriodicTrocaOleoMeses] = useState('6');

  // Periodicidade exclusiva para motos (corrente/relação)
  const [periodicUltimaLubCorrenteKm, setPeriodicUltimaLubCorrenteKm] = useState('');
  const [periodicLubCorrenteKm, setPeriodicLubCorrenteKm] = useState('500');
  const [periodicUltimaEsticarCorrenteKm, setPeriodicUltimaEsticarCorrenteKm] = useState('');
  const [periodicEsticarCorrenteKm, setPeriodicEsticarCorrenteKm] = useState('1500');

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

  const handleDateChange = (_event: DateTimePickerEvent, d?: Date) => {
    setShowDatePicker(false);
    if (d) {
      setSelectedDate(d);
    }
  };

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const allVehicles = await StorageService.getVehicles();
      setVehicles(allVehicles);

      const activeVeh = await StorageService.getActiveVehicle();
      setVehicle(activeVeh);

      if (activeVeh) {
        const list = await StorageService.getMaintenances(activeVeh.id);
        setMaintenances(list);
        setOdometer(String(activeVeh.currentOdometer));
      } else {
        setMaintenances([]);
      }
    } catch (e) {
      console.warn('Erro ao carregar dados da oficina:', e);
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

  const handleSelectVehicle = async (v: Vehicle) => {
    setIsSelectorExpanded(false);
    if (v.id === vehicle?.id && !isSwitchingVehicle) return;

    const requestId = ++latestSwitchRequestId.current;
    setIsSwitchingVehicle(true);
    setVehicle(v);
    setOdometer(String(v.currentOdometer));
    setMaintenances([]);

    try {
      await StorageService.setActiveVehicleId(v.id);
      const list = await StorageService.getMaintenances(v.id);
      if (requestId === latestSwitchRequestId.current) {
        setMaintenances(list);
      }
    } catch (e) {
      console.warn('Erro ao trocar de veículo na oficina:', e);
    } finally {
      if (requestId === latestSwitchRequestId.current) {
        setIsSwitchingVehicle(false);
      }
    }
  };

  const isMoto = vehicle?.vehicleType === 'moto';

  // Categorias disponíveis filtradas conforme o perfil do veículo
  const availableCategories: { id: MaintenanceCategory; label: string; defaultTitle: string; defaultInterval: string }[] = isMoto
    ? [
        { id: 'oleo_filtro', label: 'Óleo e Filtros', defaultTitle: 'Troca de Óleo e Filtros', defaultInterval: '3000' },
        { id: 'revisao_geral', label: 'Revisão Geral', defaultTitle: 'Revisão Geral Periódica', defaultInterval: '6000' },
        { id: 'freios', label: 'Pastilhas/Lonas de Freio', defaultTitle: 'Troca de Pastilhas/Lonas de Freio', defaultInterval: '' },
        { id: 'troca_pneus', label: 'Troca de Pneus', defaultTitle: 'Substituição de Pneu', defaultInterval: '' },
        { id: 'lubrificar_corrente', label: 'Lubrificar Corrente', defaultTitle: 'Lubrificação da Corrente/Relação', defaultInterval: '500' },
        { id: 'esticar_corrente', label: 'Esticar Corrente', defaultTitle: 'Ajuste e Tensão da Corrente', defaultInterval: '1500' },
        { id: 'suspensao', label: 'Suspensão', defaultTitle: 'Manutenção da Suspensão', defaultInterval: '20000' },
        { id: 'bateria', label: 'Bateria e Elétrica', defaultTitle: 'Substituição da Bateria', defaultInterval: '30000' },
        { id: 'outros', label: 'Outras Manutenções', defaultTitle: 'Serviço Diverso', defaultInterval: '' },
      ]
    : [
        { id: 'oleo_filtro', label: 'Óleo e Filtros', defaultTitle: 'Troca de Óleo e Filtros', defaultInterval: '10000' },
        { id: 'revisao_geral', label: 'Revisão Geral', defaultTitle: 'Revisão Geral Periódica', defaultInterval: '10000' },
        { id: 'freios', label: 'Pastilhas/Lonas de Freio', defaultTitle: 'Troca de Pastilhas/Lonas de Freio', defaultInterval: '' },
        { id: 'troca_pneus', label: 'Troca de Pneus', defaultTitle: 'Substituição de Pneu(s)', defaultInterval: '' },
        { id: 'alinhamento_balanceamento', label: 'Alinhamento & Balanceamento', defaultTitle: 'Alinhamento 3D + Balanceamento', defaultInterval: '10000' },
        { id: 'rodizio_pneus', label: 'Rodízio de Pneus', defaultTitle: 'Rodízio e Calibragem dos Pneus', defaultInterval: '10000' },
        { id: 'suspensao', label: 'Suspensão', defaultTitle: 'Amortecedores / Buchas / Pivôs', defaultInterval: '30000' },
        { id: 'ar_condicionado', label: 'Ar Condicionado', defaultTitle: 'Higienização e Filtro de Cabine', defaultInterval: '15000' },
        { id: 'bateria', label: 'Bateria e Elétrica', defaultTitle: 'Substituição da Bateria', defaultInterval: '35000' },
        { id: 'documentacao', label: 'IPVA e Seguro', defaultTitle: 'Licenciamento e IPVA Anual', defaultInterval: '' },
        { id: 'outros', label: 'Outras Manutenções', defaultTitle: 'Serviço Diverso', defaultInterval: '' },
      ];

  // Opções de Lado para Pastilhas/Lonas de Freio
  const brakeSides = [
    { id: 'DIANTEIRA', label: 'Dianteiro' },
    { id: 'TRASEIRA', label: 'Traseiro' },
    { id: 'AMBOS', label: 'Ambos (Diant. + Tras.)' },
  ];

  // Opções de Lado para Troca de Pneus
  const tireSides = isMoto
    ? [
        { id: 'DIANTEIRA', label: 'Dianteiro' },
        { id: 'TRASEIRA', label: 'Traseiro' },
        { id: 'AMBOS', label: 'Ambos' },
      ]
    : [
        { id: 'DIANTEIRO_ESQUERDO', label: 'Diant. Esquerdo' },
        { id: 'DIANTEIRO_DIREITO', label: 'Diant. Direito' },
        { id: 'TRASEIRO_ESQUERDO', label: 'Tras. Esquerdo' },
        { id: 'TRASEIRO_DIREITO', label: 'Tras. Direito' },
        { id: 'DIANTEIROS', label: 'Ambos Dianteiros' },
        { id: 'TRASEIROS', label: 'Ambos Traseiros' },
        { id: 'TODOS_4', label: 'Todos os 4 Pneus' },
      ];

  const handleSelectCategory = (catId: MaintenanceCategory) => {
    setCategory(catId);
    const found = availableCategories.find((c) => c.id === catId);
    if (found) {
      if (!title || availableCategories.some((c) => c.defaultTitle === title)) {
        setTitle(found.defaultTitle);
      }
      setNextIntervalKm(found.defaultInterval);
    }
    // Reseta lado caso mude para categoria que não exige lado
    if (catId !== 'freios' && catId !== 'troca_pneus') {
      setSelectedSide('');
    } else if (!selectedSide) {
      setSelectedSide(catId === 'freios' ? 'DIANTEIRA' : (isMoto ? 'TRASEIRA' : 'DIANTEIRO_ESQUERDO'));
    }
  };

  const handleOpenMaintenanceModal = (preselectedCategory?: MaintenanceCategory) => {
    if (isSwitchingVehicle) return;
    if (!vehicle) {
      Alert.alert('Atenção', 'Cadastre ou selecione um veículo primeiro.');
      return;
    }
    const catToUse = preselectedCategory || 'oleo_filtro';
    handleSelectCategory(catToUse);
    setCost('');
    setWorkshop('');
    setOdometer(String(vehicle.currentOdometer || 0));
    setSelectedDate(new Date());
    setModalMntVisible(true);
  };

  // Abre modal de periodicidade (para cadastro inicial ou edição a qualquer momento)
  const handleOpenPeriodicModal = () => {
    if (isSwitchingVehicle || !vehicle) return;

    setPeriodicUltimaRevKm(String(vehicle.ultimaRevisaoKm ?? vehicle.currentOdometer ?? 0));
    setPeriodicRevKm(String(vehicle.revisaoKm ?? (isMoto ? 6000 : 10000)));
    setPeriodicRevMes(String(vehicle.revisaoMes ?? 12));
    setPeriodicUltimaTrocaOleoKm(String(vehicle.ultimaTrocaOleoKm ?? vehicle.currentOdometer ?? 0));
    setPeriodicTrocaOleoKm(String(vehicle.trocaOleoKm ?? (isMoto ? 3000 : 10000)));
    setPeriodicTrocaOleoMeses(String(vehicle.trocaOleoMeses ?? 6));

    if (isMoto) {
      setPeriodicUltimaLubCorrenteKm(String(vehicle.ultimaLubCorrenteKm ?? vehicle.currentOdometer ?? 0));
      setPeriodicLubCorrenteKm(String(vehicle.lubrificarCorrenteKm ?? 500));
      setPeriodicUltimaEsticarCorrenteKm(String(vehicle.ultimaEsticarCorrenteKm ?? vehicle.currentOdometer ?? 0));
      setPeriodicEsticarCorrenteKm(String(vehicle.esticarCorrenteKm ?? 1500));
    }

    setModalPeriodicVisible(true);
  };

  const handleSavePeriodicConfig = async () => {
    if (!vehicle || savingPeriodic) return;

    const uRev = parseInt(periodicUltimaRevKm, 10);
    const rKm = parseInt(periodicRevKm, 10);
    const rMes = parseInt(periodicRevMes, 10);
    const uOleo = parseInt(periodicUltimaTrocaOleoKm, 10);
    const oKm = parseInt(periodicTrocaOleoKm, 10);
    const oMes = parseInt(periodicTrocaOleoMeses, 10);

    if (isNaN(uRev) || uRev < 0 || isNaN(rKm) || rKm <= 0 || isNaN(rMes) || rMes <= 0) {
      Alert.alert('Erro', 'Insira valores válidos para o ciclo de revisão.');
      return;
    }
    if (isNaN(uOleo) || uOleo < 0 || isNaN(oKm) || oKm <= 0 || isNaN(oMes) || oMes <= 0) {
      Alert.alert('Erro', 'Insira valores válidos para o ciclo de troca de óleo.');
      return;
    }

    let lubKm: number | undefined;
    let uLubKm: number | undefined;
    let esticarKm: number | undefined;
    let uEsticarKm: number | undefined;

    if (isMoto) {
      lubKm = parseInt(periodicLubCorrenteKm, 10);
      uLubKm = parseInt(periodicUltimaLubCorrenteKm, 10);
      esticarKm = parseInt(periodicEsticarCorrenteKm, 10);
      uEsticarKm = parseInt(periodicUltimaEsticarCorrenteKm, 10);

      if (isNaN(lubKm) || lubKm <= 0 || isNaN(uLubKm) || uLubKm < 0) {
        Alert.alert('Erro', 'Insira valores válidos para a lubrificação da corrente.');
        return;
      }
      if (isNaN(esticarKm) || esticarKm <= 0 || isNaN(uEsticarKm) || uEsticarKm < 0) {
        Alert.alert('Erro', 'Insira valores válidos para o tensionamento da corrente.');
        return;
      }
    }

    setSavingPeriodic(true);
    try {
      const updated = await StorageService.savePeriodicMaintenanceConfig(vehicle.id, {
        ultimaRevisaoKm: uRev,
        revisaoKm: rKm,
        revisaoMes: rMes,
        ultimaTrocaOleoKm: uOleo,
        trocaOleoKm: oKm,
        trocaOleoMeses: oMes,
        lubrificarCorrenteKm: lubKm,
        ultimaLubCorrenteKm: uLubKm,
        esticarCorrenteKm: esticarKm,
        ultimaEsticarCorrenteKm: uEsticarKm,
      });

      if (updated) {
        setVehicle(updated);
        Alert.alert(
          'Sucesso!',
          'Periodicidade de manutenções salva com sucesso! Os alertas preventivos foram atualizados.'
        );
      }

      setModalPeriodicVisible(false);
      await loadData();
    } catch (err) {
      console.error('Erro ao salvar periodicidade:', err);
      Alert.alert('Erro', 'Ocorreu um erro ao salvar a periodicidade. Tente novamente.');
    } finally {
      setSavingPeriodic(false);
    }
  };

  const handleSaveMaintenance = async () => {
    if (!vehicle || savingMnt) return;

    const odomNum = parseInt(odometer, 10);
    const costNum = parseFloat(cost.replace(',', '.'));
    const isNoPeriodCategory = category === 'outros' || category === 'freios' || category === 'troca_pneus';
    const nextInterval = isNoPeriodCategory ? NaN : parseInt(nextIntervalKm, 10);

    if (!title.trim()) {
      Alert.alert('Erro', 'Insira o nome do serviço ou peça.');
      return;
    }
    if (isNaN(odomNum) || odomNum <= 0) {
      Alert.alert('Erro', 'Insira a quilometragem da manutenção.');
      return;
    }
    if (isNaN(costNum) || costNum < 0) {
      Alert.alert('Erro', 'Insira o custo do serviço em R$.');
      return;
    }

    let sideLabel = '';
    if (category === 'freios') {
      const found = brakeSides.find((s) => s.id === selectedSide);
      sideLabel = found ? found.label : selectedSide;
    } else if (category === 'troca_pneus') {
      const found = tireSides.find((s) => s.id === selectedSide);
      sideLabel = found ? found.label : selectedSide;
    }

    const nextDueOdometer =
      !isNaN(nextInterval) && nextInterval > 0 ? odomNum + nextInterval : undefined;

    setSavingMnt(true);
    try {
      const newMnt: MaintenanceItem = {
        id: 'mnt-' + Date.now(),
        vehicleId: vehicle.id,
        date: getLocalDateString(selectedDate),
        odometer: odomNum,
        category,
        title: title.trim(),
        workshop: workshop.trim() || undefined,
        cost: costNum,
        nextDueOdometer,
        isCompleted: true,
        side: selectedSide || undefined,
        sideLabel: sideLabel || undefined,
      };

      await StorageService.addMaintenance(newMnt);
      setModalMntVisible(false);
      await loadData();
    } catch (err) {
      console.error('Erro ao salvar manutenção:', err);
      Alert.alert('Erro', 'Ocorreu um erro ao salvar a manutenção. Tente novamente.');
    } finally {
      setSavingMnt(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Excluir Manutenção', 'Deseja remover este registro do histórico e do banco de dados?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await StorageService.deleteMaintenance(id);
          await loadData();
        },
      },
    ]);
  };

  const alerts = vehicle
    ? Calculations.getMaintenanceAlerts(vehicle.currentOdometer, maintenances, vehicle)
    : [];

  const wearStatus = vehicle
    ? Calculations.getWearItemsStatus(vehicle.currentOdometer, maintenances)
    : { brake: null, tire: null };

  const totalSpent = maintenances.reduce((acc, m) => acc + m.cost, 0);

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
    amber: '#F59E0B',
    amberLight: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
    red: '#EF4444',
  };

  // Verifica se a categoria atual não tem periodicidade
  const isNoPeriodCategory = category === 'outros' || category === 'freios' || category === 'troca_pneus';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {/* CABEÇALHO */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Oficina</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                {vehicle ? `${vehicle.name} (${vehicle.plate})` : 'Nenhum veículo selecionado'}
              </Text>
              {(loading || isSwitchingVehicle) && (
                <View
                  style={[
                    styles.loadingBadge,
                    {
                      backgroundColor: isDark
                        ? 'rgba(59, 130, 246, 0.2)'
                        : 'rgba(59, 130, 246, 0.12)',
                    },
                  ]}
                >
                  <Text style={[styles.loadingBadgeText, { color: theme.blue }]}>
                    Carregando...
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.headerActions}>
            {/* BOTÃO PERIODICIDADE (Sempre ativo para cadastrar ou editar) */}
            <TouchableOpacity
              disabled={isSwitchingVehicle}
              style={[
                styles.periodBtnActive,
                {
                  backgroundColor: vehicle?.cadManPeriodica ? theme.blueLight : theme.amberLight,
                  borderColor: vehicle?.cadManPeriodica ? theme.blue : theme.amber,
                  opacity: isSwitchingVehicle ? 0.6 : 1,
                },
              ]}
              onPress={handleOpenPeriodicModal}
            >
              <Ionicons
                name={vehicle?.cadManPeriodica ? 'create-outline' : 'time-outline'}
                size={15}
                color={vehicle?.cadManPeriodica ? theme.blue : theme.amber}
              />
              <Text
                style={[
                  styles.periodBtnActiveText,
                  { color: vehicle?.cadManPeriodica ? theme.blue : theme.amber },
                ]}
              >
                {vehicle?.cadManPeriodica ? 'Editar Período' : '+ Período'}
              </Text>
            </TouchableOpacity>

            {/* BOTÃO + MANUTENÇÃO */}
            <TouchableOpacity
              disabled={isSwitchingVehicle}
              style={[styles.addBtn, { backgroundColor: theme.blue, opacity: isSwitchingVehicle ? 0.6 : 1 }]}
              onPress={() => handleOpenMaintenanceModal()}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Serviço</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SELETOR COMPACTO DE VEÍCULOS NO TOPO */}
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
                      <Ionicons name="car-sport" size={14} color={theme.blue} />
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
                                  ? 'rgba(59, 130, 246, 0.15)'
                                  : 'rgba(59, 130, 246, 0.08)'
                                : theme.bg,
                              borderColor: isSelected ? theme.blue : theme.cardBorder,
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
                                      ? 'rgba(59, 130, 246, 0.25)'
                                      : 'rgba(59, 130, 246, 0.15)'
                                    : isDark
                                    ? '#1E293B'
                                    : '#E2E8F0',
                                },
                              ]}
                            >
                              <Ionicons
                                name={v.vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                                size={14}
                                color={isSelected ? theme.blue : theme.textMuted}
                              />
                            </View>
                          )}

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={[
                                styles.compactVehicleName,
                                { color: isSelected ? theme.blue : theme.text },
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
                            <Ionicons name="checkmark-circle" size={18} color={theme.blue} />
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
                      <View style={[styles.compactIconCircle, { backgroundColor: theme.blueLight }]}>
                        <Ionicons
                          name={vehicle.vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                          size={14}
                          color={theme.blue}
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
                    <Text style={[styles.compactSwitchText, { color: theme.blue }]}>
                      Trocar ({vehicles.length})
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={theme.blue} />
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
                <View style={[styles.compactIconCircle, { backgroundColor: theme.blueLight }]}>
                  <Ionicons
                    name={vehicle.vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                    size={14}
                    color={theme.blue}
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

        {/* TOTAL INVESTIDO EM MANUTENÇÃO */}
        {!loading && !isSwitchingVehicle && (
          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Total em Serviços</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>
                R$ {totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.cardBorder }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Odômetro Atual</Text>
              <Text style={[styles.summaryValue, { color: theme.blue }]}>
                {vehicle?.currentOdometer.toLocaleString('pt-BR')} km
              </Text>
            </View>
          </View>
        )}

        {/* SELETOR DE ABAS: ALERTAS VS HISTÓRICO */}
        {!loading && !isSwitchingVehicle && (
          <View style={[styles.tabSelector, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'alertas' && { backgroundColor: theme.blue },
              ]}
              onPress={() => setActiveTab('alertas')}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === 'alertas' ? '#FFFFFF' : theme.textMuted },
                ]}
              >
                Alertas Preventivos ({alerts.filter((a) => a.status !== 'ok').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'historico' && { backgroundColor: theme.blue },
              ]}
              onPress={() => setActiveTab('historico')}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === 'historico' ? '#FFFFFF' : theme.textMuted },
                ]}
              >
                Histórico ({maintenances.length})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {loading || isSwitchingVehicle ? (
          <View style={[styles.loadingContainer, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={[styles.loadingIconCircle, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
              <ActivityIndicator size="large" color={theme.blue} />
            </View>
            <Text style={[styles.loadingTitle, { color: theme.text }]}>
              {isSwitchingVehicle
                ? `Carregando dados de ${vehicle?.name || 'veículo'}...`
                : 'Carregando dados da oficina...'}
            </Text>
            <Text style={[styles.loadingSubtitle, { color: theme.textMuted }]}>
              {isSwitchingVehicle
                ? 'Atualizando serviços, manutenções e alertas preventivos.'
                : 'Sincronizando histórico e revisões com o banco de dados...'}
            </Text>
          </View>
        ) : activeTab === 'alertas' ? (
          /* CONTEÚDO: ALERTAS PREVENTIVOS & ITENS POR DESGASTE */
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={theme.blue} />
            }
          >
            {/* BANNER QUANDO O VEÍCULO NÃO POSSUI PERIODICIDADE CADASTRADA */}
            {!vehicle?.cadManPeriodica && (
              <View style={[styles.unconfiguredBanner, { backgroundColor: theme.card, borderColor: theme.amber }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.bannerIconBadge, { backgroundColor: theme.amberLight }]}>
                    <Ionicons name="time" size={22} color={theme.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bannerTitle, { color: theme.text }]}>Periodicidade não configurada</Text>
                    <Text style={[styles.bannerSubtitle, { color: theme.textMuted }]}>
                      Configure a periodicidade de revisões e trocas de óleo {isMoto ? 'e corrente' : ''} deste veículo para ativar os alertas automáticos.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.bannerActionBtn, { backgroundColor: theme.amber }]}
                  onPress={handleOpenPeriodicModal}
                >
                  <Ionicons name="settings-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.bannerActionBtnText}>Configurar Periodicidade Agora</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* SEÇÃO 1: ITENS POR DESGASTE (SEM PERÍODO FIXO - EXIBE ÚLTIMA SUBSTITUIÇÃO) */}
            <View style={styles.wearSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="shield-outline" size={15} color={theme.blue} />
                <Text style={[styles.sectionHeaderTitle, { color: theme.text }]}>
                  Itens por Desgaste (Última Substituição)
                </Text>
              </View>

              {/* CARD: PASTILHAS / LONAS DE FREIO */}
              <View style={[styles.wearCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.wearCardLeft}>
                  <View style={[styles.wearIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                    <Ionicons name="disc-outline" size={20} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.wearItemTitle, { color: theme.text }]}>Pastilhas/Lonas de Freio</Text>
                    {wearStatus.brake ? (
                      <Text style={[styles.wearItemSub, { color: theme.textMuted }]}>
                        Última troca em {wearStatus.brake.odometer.toLocaleString('pt-BR')} km ({wearStatus.brake.side})
                      </Text>
                    ) : (
                      <Text style={[styles.wearItemSub, { color: theme.textMuted }]}>
                        Nenhuma substituição registrada
                      </Text>
                    )}
                  </View>
                </View>

                {wearStatus.brake ? (
                  <View style={styles.wearStatusBadge}>
                    <Text style={[styles.wearKmAgoText, { color: theme.text }]}>
                      há {wearStatus.brake.kmAgo.toLocaleString('pt-BR')} km
                    </Text>
                    <Text style={[styles.wearDateText, { color: theme.textMuted }]}>
                      {wearStatus.brake.date}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.quickAddBtn, { borderColor: theme.blue }]}
                    onPress={() => handleOpenMaintenanceModal('freios')}
                  >
                    <Ionicons name="add" size={14} color={theme.blue} />
                    <Text style={[styles.quickAddBtnText, { color: theme.blue }]}>Lançar</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* CARD: TROCA DE PNEUS */}
              <View style={[styles.wearCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.wearCardLeft}>
                  <View style={[styles.wearIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                    <Ionicons name="radio-button-on-outline" size={20} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.wearItemTitle, { color: theme.text }]}>Troca de Pneus</Text>
                    {wearStatus.tire ? (
                      <Text style={[styles.wearItemSub, { color: theme.textMuted }]}>
                        Última troca em {wearStatus.tire.odometer.toLocaleString('pt-BR')} km ({wearStatus.tire.side})
                      </Text>
                    ) : (
                      <Text style={[styles.wearItemSub, { color: theme.textMuted }]}>
                        Nenhuma substituição registrada
                      </Text>
                    )}
                  </View>
                </View>

                {wearStatus.tire ? (
                  <View style={styles.wearStatusBadge}>
                    <Text style={[styles.wearKmAgoText, { color: theme.text }]}>
                      há {wearStatus.tire.kmAgo.toLocaleString('pt-BR')} km
                    </Text>
                    <Text style={[styles.wearDateText, { color: theme.textMuted }]}>
                      {wearStatus.tire.date}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.quickAddBtn, { borderColor: theme.blue }]}
                    onPress={() => handleOpenMaintenanceModal('troca_pneus')}
                  >
                    <Ionicons name="add" size={14} color={theme.blue} />
                    <Text style={[styles.quickAddBtnText, { color: theme.blue }]}>Lançar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* SEÇÃO 2: ALERTAS DE MANUTENÇÕES PERIÓDICAS */}
            <View style={{ marginTop: 6, gap: 10 }}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="time-outline" size={15} color={theme.amber} />
                <Text style={[styles.sectionHeaderTitle, { color: theme.text }]}>
                  Alertas com Periodicidade
                </Text>
              </View>

              {alerts.map((item, idx) => {
                const isVencido = item.status === 'vencido';
                const isAlerta = item.status === 'alerta';
                const isAtencao = item.status === 'atencao' || item.status === 'proximo';
                const isRed = isVencido || isAlerta;

                const badgeColor = isRed ? theme.red : isAtencao ? theme.amber : theme.accent;
                const badgeText = isVencido ? 'VENCIDO' : isAlerta ? 'ALERTA' : isAtencao ? 'ATENÇÃO' : 'EM DIA';

                return (
                  <View
                    key={idx}
                    style={[
                      styles.alertCard,
                      {
                        backgroundColor: theme.card,
                        borderColor: isRed ? theme.red : isAtencao ? theme.amber : theme.cardBorder,
                      },
                    ]}
                  >
                    <View style={styles.alertTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.alertTitle, { color: theme.text }]}>{item.title}</Text>
                        <Text style={[styles.alertSub, { color: theme.textMuted }]}>
                          Previsto para: {item.dueKm ? item.dueKm.toLocaleString('pt-BR') : '--'} km
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badgeColor }]}>
                        <Text style={styles.statusBadgeText}>{badgeText}</Text>
                      </View>
                    </View>

                    <View style={styles.alertMidRow}>
                      <Text style={[styles.kmRemainingText, { color: badgeColor }]}>
                        {item.kmRemaining != null
                          ? item.kmRemaining <= 0
                            ? `Atrasado há ${Math.abs(item.kmRemaining).toLocaleString('pt-BR')} km`
                            : isAlerta
                            ? `Alerta: faltam ${item.kmRemaining.toLocaleString('pt-BR')} km`
                            : isAtencao
                            ? `Atenção: faltam ${item.kmRemaining.toLocaleString('pt-BR')} km`
                            : `Faltam ${item.kmRemaining.toLocaleString('pt-BR')} km`
                          : '--'}
                      </Text>
                      <Text style={[styles.alertCostText, { color: theme.textMuted }]}>
                        Estimado: R$ {item.estimatedCost.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          /* CONTEÚDO: HISTÓRICO DE MANUTENÇÕES */
          <FlatList
            data={maintenances}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={theme.blue} />
            }
            ListEmptyComponent={
              <View style={[styles.emptyContainer, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <Ionicons name="construct-outline" size={50} color={theme.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhuma manutenção registrada</Text>
                <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                  {'Toque em "+ Serviço" acima para lançar sua primeira troca de óleo, pneus ou revisão.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.historyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.historyTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyTitle, { color: theme.text }]}>{item.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <Text style={[styles.historyDate, { color: theme.textMuted }]}>
                        {formatDateToBR(item.date)} • {item.odometer.toLocaleString('pt-BR')} km
                      </Text>
                      {Boolean(item.sideLabel || item.side) && (
                        <View style={[styles.sideBadge, { backgroundColor: isDark ? '#1E293B' : '#EEF2F6' }]}>
                          <Text style={[styles.sideBadgeText, { color: theme.blue }]}>
                            {item.sideLabel || item.side}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(item.id)} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={17} color={theme.red} />
                  </TouchableOpacity>
                </View>

                <View style={styles.historyBottomRow}>
                  <Text style={[styles.workshopText, { color: theme.textMuted }]}>
                    {item.workshop ? `Oficina: ${item.workshop}` : 'Oficina não informada'}
                  </Text>
                  <Text style={[styles.historyCost, { color: theme.blue }]}>
                    R$ {item.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
            )}
          />
        )}

        {/* MODAL: REGISTRAR MANUTENÇÃO */}
        <Modal visible={modalMntVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Lançar Manutenção</Text>
                  <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>
                    {vehicle?.name} ({vehicle?.plate})
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => !savingMnt && setModalMntVisible(false)}
                  disabled={savingMnt}
                  style={{ opacity: savingMnt ? 0.5 : 1 }}
                >
                  <Ionicons name="close-circle" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {/* CATEGORIAS */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Categoria do Serviço:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
                    {availableCategories.map((c) => {
                      const isSel = category === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[
                            styles.catPill,
                            {
                              backgroundColor: isSel ? theme.blue : theme.bg,
                              borderColor: isSel ? theme.blue : theme.cardBorder,
                            },
                          ]}
                          onPress={() => handleSelectCategory(c.id)}
                        >
                          <Text style={[styles.catPillText, { color: isSel ? '#FFFFFF' : theme.text }]}>
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* SELETOR DE LADO PARA PASTILHAS/LONAS DE FREIO */}
                {category === 'freios' && (
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Lado da Troca das Pastilhas/Lonas:</Text>
                    <View style={styles.sideChipsRow}>
                      {brakeSides.map((s) => {
                        const isSel = selectedSide === s.id;
                        return (
                          <TouchableOpacity
                            key={s.id}
                            style={[
                              styles.sideChip,
                              {
                                backgroundColor: isSel ? theme.blue : theme.bg,
                                borderColor: isSel ? theme.blue : theme.cardBorder,
                              },
                            ]}
                            onPress={() => setSelectedSide(s.id)}
                          >
                            <Text style={[styles.sideChipText, { color: isSel ? '#FFFFFF' : theme.text }]}>
                              {s.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* SELETOR DE LADO PARA TROCA DE PNEUS */}
                {category === 'troca_pneus' && (
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Lado / Pneu Trocado:</Text>
                    <View style={styles.sideChipsRow}>
                      {tireSides.map((s) => {
                        const isSel = selectedSide === s.id;
                        return (
                          <TouchableOpacity
                            key={s.id}
                            style={[
                              styles.sideChip,
                              {
                                backgroundColor: isSel ? theme.blue : theme.bg,
                                borderColor: isSel ? theme.blue : theme.cardBorder,
                              },
                            ]}
                            onPress={() => setSelectedSide(s.id)}
                          >
                            <Text style={[styles.sideChipText, { color: isSel ? '#FFFFFF' : theme.text }]}>
                              {s.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* DESCRIÇÃO / TÍTULO DO SERVIÇO */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Descrição do Serviço / Peça:</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Ex: Troca de Óleo 5W30 + Filtros"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>

                {/* DATA COM SELETOR NATIVO */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Data do Serviço:</Text>
                  <TouchableOpacity
                    style={[styles.datePickerBtn, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={18} color={theme.blue} />
                    <Text style={[styles.datePickerBtnText, { color: theme.text }]}>
                      {formatDisplayDate(selectedDate)}
                    </Text>
                  </TouchableOpacity>
                </View>

                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleDateChange}
                    maximumDate={new Date()}
                  />
                )}

                {/* VALOR E KM ATUAL */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Valor Pago (R$):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={cost}
                      onChangeText={setCost}
                      placeholder="Ex: 380,00"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Km do Serviço:</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={odometer}
                      onChangeText={setOdometer}
                      placeholder="Ex: 38450"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>
                </View>

                {/* OFICINA E PERIODICIDADE (OCULTA PARA ITENS SEM PERÍODO FIXO: OUTROS, FREIOS, PNEUS) */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: isNoPeriodCategory ? 1 : 1.1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Oficina / Estabelecimento:</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      value={workshop}
                      onChangeText={setWorkshop}
                      placeholder="Ex: Oficina Bosch"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  {!isNoPeriodCategory && (
                    <View style={[styles.inputGroup, { flex: 0.9 }]}>
                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Próxima em (+km):</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                        keyboardType="numeric"
                        value={nextIntervalKm}
                        onChangeText={setNextIntervalKm}
                        placeholder="Ex: 10000"
                        placeholderTextColor={theme.textMuted}
                      />
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    {
                      backgroundColor: theme.blue,
                      opacity: savingMnt ? 0.7 : 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    },
                  ]}
                  onPress={handleSaveMaintenance}
                  disabled={savingMnt}
                  activeOpacity={0.8}
                >
                  {savingMnt ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.saveBtnText}>Salvando Manutenção...</Text>
                    </>
                  ) : (
                    <Text style={styles.saveBtnText}>Salvar Manutenção</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* MODAL: CADASTRO E EDIÇÃO DE PERIODICIDADE DE MANUTENÇÃO */}
        <Modal visible={modalPeriodicVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    {vehicle?.cadManPeriodica ? 'Editar Periodicidade' : 'Cadastrar Periodicidade'}
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>
                    {vehicle?.name} ({vehicle?.plate})
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => !savingPeriodic && setModalPeriodicVisible(false)}
                  disabled={savingPeriodic}
                  style={{ opacity: savingPeriodic ? 0.5 : 1 }}
                >
                  <Ionicons name="close-circle" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
                <Text style={[styles.periodicIntro, { color: theme.textMuted }]}>
                  Configure os ciclos de manutenção preventiva para manter o painel de alertas atualizado:
                </Text>

                {/* CICLO DE REVISÃO */}
                <View style={[styles.sectionCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Ionicons name="build" size={16} color={theme.blue} />
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Ciclo de Revisão Geral</Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Última Revisão Realizada (km):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={periodicUltimaRevKm}
                      onChangeText={setPeriodicUltimaRevKm}
                      placeholder="Ex: 50000"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                    <View style={[styles.inputGroup, { flex: 1.2 }]}>
                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>A cada quantos km:</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder }]}
                        keyboardType="numeric"
                        value={periodicRevKm}
                        onChangeText={setPeriodicRevKm}
                        placeholder="Ex: 10000"
                        placeholderTextColor={theme.textMuted}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 0.8 }]}>
                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Ou Meses:</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder }]}
                        keyboardType="numeric"
                        value={periodicRevMes}
                        onChangeText={setPeriodicRevMes}
                        placeholder="Ex: 12"
                        placeholderTextColor={theme.textMuted}
                      />
                    </View>
                  </View>
                </View>

                {/* CICLO DE TROCA DE ÓLEO */}
                <View style={[styles.sectionCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Ionicons name="water" size={16} color={theme.amber} />
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Ciclo de Troca de Óleo</Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Última Troca de Óleo (km):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={periodicUltimaTrocaOleoKm}
                      onChangeText={setPeriodicUltimaTrocaOleoKm}
                      placeholder="Ex: 55000"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                    <View style={[styles.inputGroup, { flex: 1.2 }]}>
                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>A cada quantos km:</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder }]}
                        keyboardType="numeric"
                        value={periodicTrocaOleoKm}
                        onChangeText={setPeriodicTrocaOleoKm}
                        placeholder={isMoto ? 'Ex: 3000' : 'Ex: 10000'}
                        placeholderTextColor={theme.textMuted}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 0.8 }]}>
                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Ou Meses:</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder }]}
                        keyboardType="numeric"
                        value={periodicTrocaOleoMeses}
                        onChangeText={setPeriodicTrocaOleoMeses}
                        placeholder="Ex: 6"
                        placeholderTextColor={theme.textMuted}
                      />
                    </View>
                  </View>
                </View>

                {/* PERIODICIDADE DE CORRENTE / RELAÇÃO (EXCLUSIVO PARA MOTOCICLETAS) */}
                {isMoto && (
                  <View style={[styles.sectionCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Ionicons name="link-outline" size={16} color={theme.accent} />
                      <Text style={[styles.sectionTitle, { color: theme.text }]}>Transmissão por Corrente (Moto)</Text>
                    </View>

                    {/* LUBRIFICAÇÃO DA CORRENTE */}
                    <Text style={[styles.subSectionTitle, { color: theme.textMuted }]}>Lubrificação da Corrente:</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Última Lubrificação (km):</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder }]}
                          keyboardType="numeric"
                          value={periodicUltimaLubCorrenteKm}
                          onChangeText={setPeriodicUltimaLubCorrenteKm}
                          placeholder="Ex: 12000"
                          placeholderTextColor={theme.textMuted}
                        />
                      </View>
                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={[styles.inputLabel, { color: theme.textMuted }]}>A cada quantos km:</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder }]}
                          keyboardType="numeric"
                          value={periodicLubCorrenteKm}
                          onChangeText={setPeriodicLubCorrenteKm}
                          placeholder="Ex: 500"
                          placeholderTextColor={theme.textMuted}
                        />
                      </View>
                    </View>

                    {/* TENSIONAMENTO / AJUSTE DA CORRENTE */}
                    <Text style={[styles.subSectionTitle, { color: theme.textMuted, marginTop: 8 }]}>Tensionamento da Corrente:</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Último Ajuste (km):</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder }]}
                          keyboardType="numeric"
                          value={periodicUltimaEsticarCorrenteKm}
                          onChangeText={setPeriodicUltimaEsticarCorrenteKm}
                          placeholder="Ex: 11500"
                          placeholderTextColor={theme.textMuted}
                        />
                      </View>
                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={[styles.inputLabel, { color: theme.textMuted }]}>A cada quantos km:</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder }]}
                          keyboardType="numeric"
                          value={periodicEsticarCorrenteKm}
                          onChangeText={setPeriodicEsticarCorrenteKm}
                          placeholder="Ex: 1500"
                          placeholderTextColor={theme.textMuted}
                        />
                      </View>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    {
                      backgroundColor: theme.accent,
                      marginTop: 4,
                      opacity: savingPeriodic ? 0.7 : 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    },
                  ]}
                  onPress={handleSavePeriodicConfig}
                  disabled={savingPeriodic}
                  activeOpacity={0.8}
                >
                  {savingPeriodic ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.saveBtnText}>Salvando Periodicidade...</Text>
                    </>
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {vehicle?.cadManPeriodica ? 'Salvar Alterações' : 'Cadastrar Periodicidade'}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  periodBtnActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  periodBtnActiveText: {
    fontSize: 12,
    fontWeight: '800',
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
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  summaryDivider: {
    width: 1,
    height: 26,
  },
  tabSelector: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  listContent: {
    gap: 12,
    paddingBottom: 8,
  },
  unconfiguredBanner: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 10,
    marginBottom: 4,
  },
  bannerIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  bannerSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  bannerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  bannerActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  wearSection: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    marginBottom: 2,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  wearCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  wearCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  wearIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wearItemTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  wearItemSub: {
    fontSize: 11,
    marginTop: 1,
  },
  wearStatusBadge: {
    alignItems: 'flex-end',
  },
  wearKmAgoText: {
    fontSize: 12,
    fontWeight: '800',
  },
  wearDateText: {
    fontSize: 10,
    marginTop: 1,
  },
  quickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickAddBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  alertCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
  },
  alertTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  alertSub: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  alertMidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  kmRemainingText: {
    fontSize: 12,
    fontWeight: '800',
  },
  alertCostText: {
    fontSize: 11,
  },
  historyCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  historyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  historyDate: {
    fontSize: 12,
  },
  sideBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sideBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  historyBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  workshopText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  historyCost: {
    fontSize: 15,
    fontWeight: '900',
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
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
  catScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  catPill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  catPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sideChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  sideChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  sideChipText: {
    fontSize: 12,
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
  periodicIntro: {
    fontSize: 12,
    lineHeight: 16,
  },
  sectionCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  subSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
});
