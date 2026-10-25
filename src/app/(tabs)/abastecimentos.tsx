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
  SafeAreaView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StorageService } from '@/services/storage';
import { Vehicle, Refueling, FuelType } from '@/types/vehicle';

export default function RefuelingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [refuelings, setRefuelings] = useState<Refueling[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  // Formulário de Abastecimento
  const [odometer, setOdometer] = useState('');
  const [fuelType, setFuelType] = useState<FuelType>('gasolina');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [liters, setLiters] = useState('');
  const [isFullTank, setIsFullTank] = useState(true);
  const [gasStation, setGasStation] = useState('');

  const loadData = async () => {
    const curVehicle = await StorageService.getActiveVehicle();
    setVehicle(curVehicle);
    if (curVehicle) {
      const list = await StorageService.getRefuelings(curVehicle.id);
      setRefuelings(list);
      setOdometer(String(curVehicle.currentOdometer));
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

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

    const newRef: Refueling = {
      id: 'ref-' + Date.now(),
      vehicleId: vehicle.id,
      date: new Date().toISOString().split('T')[0],
      odometer: odomNum,
      fuelType,
      pricePerLiter: priceNum,
      totalAmount: totalNum,
      liters: isNaN(litersNum) || litersNum <= 0 ? Number((totalNum / priceNum).toFixed(2)) : litersNum,
      isFullTank,
      gasStation: gasStation.trim() || undefined,
    };

    await StorageService.addRefueling(newRef);
    setModalVisible(false);
    // Limpar campos
    setPricePerLiter('');
    setTotalAmount('');
    setLiters('');
    setGasStation('');
    await loadData();
  };

  const handleDelete = (id: string) => {
    Alert.alert('Excluir Abastecimento', 'Deseja realmente remover este registro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await StorageService.deleteRefueling(id);
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

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Abastecimentos</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              {vehicle?.name} • {refuelings.length} registros
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.accent }]}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Abastecer</Text>
          </TouchableOpacity>
        </View>

        {/* LISTA DE ABASTECIMENTOS */}
        <FlatList
          data={refuelings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="water-outline" size={54} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhum abastecimento</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                Toque no botão "+ Abastecer" acima para adicionar o primeiro registro.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.cardTopRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                  <Text style={[styles.dateText, { color: theme.textMuted }]}>{item.date}</Text>
                  {item.isFullTank && (
                    <View style={styles.fullTankBadge}>
                      <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                      <Text style={styles.fullTankText}>Tanque Cheio</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => handleDelete(item.id)}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>

              <View style={styles.cardMidRow}>
                <View>
                  <Text style={[styles.totalAmount, { color: theme.text }]}>
                    R$ {item.totalAmount.toFixed(2)}
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
                      1º Tanque Cheio
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
                  {item.distanceTraveled && (
                    <Text style={[styles.distanceText, { color: theme.accent }]}>
                      (+{item.distanceTraveled} km rodados)
                    </Text>
                  )}
                </View>
                {item.gasStation && (
                  <Text style={[styles.gasStationText, { color: theme.textMuted }]}>
                    {item.gasStation}
                  </Text>
                )}
              </View>
            </View>
          )}
        />

        {/* MODAL NOVO ABASTECIMENTO */}
        <Modal visible={modalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Novo Abastecimento</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close-circle" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Seletor de Combustível */}
              <View style={styles.fuelSelector}>
                {(['gasolina', 'etanol', 'diesel', 'gnv'] as FuelType[]).map((f) => {
                  const isSelected = fuelType === f;
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[
                        styles.fuelOption,
                        {
                          backgroundColor: isSelected ? theme.accent : theme.bg,
                          borderColor: theme.cardBorder,
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

              {/* Inputs */}
              <View style={styles.inputGroup}>
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

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Litros:</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                    keyboardType="numeric"
                    value={liters}
                    onChangeText={handleLitersChange}
                    placeholder="Ex: 40,00"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Posto (Opcional):</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                    value={gasStation}
                    onChangeText={setGasStation}
                    placeholder="Ex: Shell Ipiranga"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>

              {/* Tanque Cheio Switch */}
              <View style={[styles.switchRow, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.switchTitle, { color: theme.text }]}>Tanque Cheio?</Text>
                  <Text style={[styles.switchDesc, { color: theme.textMuted }]}>
                    Necessário para calcular a média real de km/L
                  </Text>
                </View>
                <Switch
                  value={isFullTank}
                  onValueChange={setIsFullTank}
                  trackColor={{ false: '#334155', true: theme.accent }}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.accent }]}
                onPress={handleSave}
              >
                <Text style={styles.saveBtnText}>Salvar Abastecimento</Text>
              </TouchableOpacity>
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
    gap: 14,
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
  listContent: {
    gap: 12,
    paddingBottom: 30,
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
  dateText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fullTankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
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
    fontSize: 22,
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
    fontSize: 18,
    fontWeight: '900',
  },
  costPerKmText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noCalcBox: {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
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
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
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
    fontSize: 15,
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
    marginTop: 6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
