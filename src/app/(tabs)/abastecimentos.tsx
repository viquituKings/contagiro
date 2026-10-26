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
  useColorScheme,
  Switch,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { StorageService } from '@/services/storage';
import { Vehicle, Refueling, FuelType } from '@/types/vehicle';

export default function RefuelingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [refuelings, setRefuelings] = useState<Refueling[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

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
    await StorageService.setActiveVehicleId(veh.id);
    setVehicle(veh);
    setOdometer(String(veh.currentOdometer));
    if (veh.acceptedFuelTypes && veh.acceptedFuelTypes.length > 0) {
      setFuelType(veh.acceptedFuelTypes[0]);
    }
    const list = await StorageService.getRefuelings(veh.id);
    setRefuelings(list);
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

  const handleOpenModal = () => {
    if (!vehicle) {
      Alert.alert('Atenção', 'Cadastre ou selecione um veículo na Garagem antes de abastecer.');
      return;
    }
    setOdometer(String(vehicle.currentOdometer || ''));
    if (vehicle.acceptedFuelTypes && vehicle.acceptedFuelTypes.length > 0) {
      setFuelType(vehicle.acceptedFuelTypes[0]);
    } else {
      setFuelType('gasolina');
    }
    setPricePerLiter('');
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
    if (!vehicle) return;

    const calculatedLiters =
      isNaN(litersNum) || litersNum <= 0
        ? Number((totalNum / priceNum).toFixed(2))
        : litersNum;

    const newRef: Refueling = {
      id: 'ref-' + Date.now(),
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
    };

    await StorageService.addRefueling(newRef);
    setModalVisible(false);
    await loadData();
  };

  const handleSave = async () => {
    if (!vehicle) return;

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

    if (odomNum < vehicle.currentOdometer) {
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

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Abastecimentos</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              {vehicle ? `${vehicle.name} (${vehicle.plate})` : 'Nenhum veículo ativo'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.accent }]}
            onPress={handleOpenModal}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Abastecer</Text>
          </TouchableOpacity>
        </View>

        {/* SELETOR RÁPIDO DE VEÍCULOS */}
        {vehicles.length > 0 && (
          <View style={styles.vehicleChipsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vehicleChipsRow}>
              {vehicles.map((v) => {
                const isSelected = v.id === vehicle?.id;
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[
                      styles.vehicleChip,
                      {
                        backgroundColor: isSelected ? theme.accent : theme.card,
                        borderColor: isSelected ? theme.accent : theme.cardBorder,
                      },
                    ]}
                    onPress={() => handleSelectVehicle(v)}
                  >
                    <Ionicons
                      name={v.vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                      size={15}
                      color={isSelected ? '#FFFFFF' : theme.accent}
                    />
                    <Text style={[styles.vehicleChipText, { color: isSelected ? '#FFFFFF' : theme.text }]}>
                      {v.name}
                    </Text>
                    <Text style={[styles.vehicleChipPlate, { color: isSelected ? 'rgba(255,255,255,0.85)' : theme.textMuted }]}>
                      ({v.plate})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* RESUMO GERAL DO VEÍCULO (KPIS) */}
        {refuelings.length > 0 && (
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

        {/* LOADING */}
        {loading && refuelings.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>
              Carregando abastecimentos do Firestore...
            </Text>
          </View>
        ) : (
          /* LISTA DE ABASTECIMENTOS */
          <FlatList
            data={refuelings}
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
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
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

                    <Text style={[styles.dateText, { color: theme.textMuted }]}>{item.date}</Text>

                    {item.isFullTank && (
                      <View style={styles.fullTankBadge}>
                        <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                        <Text style={styles.fullTankText}>Tanque Cheio</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() => handleDelete(item.id)}
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
              </View>
            )}
          />
        )}

        {/* MODAL NOVO ABASTECIMENTO */}
        <Modal visible={modalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Novo Abastecimento</Text>
                  <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>
                    {vehicle?.name} ({vehicle?.plate})
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close-circle" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
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
                          onPress={() => setFuelType(f)}
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
                  style={[styles.saveBtn, { backgroundColor: theme.accent }]}
                  onPress={handleSave}
                >
                  <Text style={styles.saveBtnText}>Salvar Abastecimento</Text>
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
    padding: 16,
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
  vehicleChipsContainer: {
    marginVertical: 2,
  },
  vehicleChipsRow: {
    gap: 8,
  },
  vehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  vehicleChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  vehicleChipPlate: {
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
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    gap: 12,
    paddingBottom: 36,
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
});
