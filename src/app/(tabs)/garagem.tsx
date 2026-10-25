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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StorageService } from '@/services/storage';
import { useAuth } from '@/context/auth-context';
import { Vehicle, FuelType } from '@/types/vehicle';

export default function GarageScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user, logout } = useAuth();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Formulário
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [year, setYear] = useState('');
  const [tankCapacity, setTankCapacity] = useState('45');
  const [currentOdometer, setCurrentOdometer] = useState('');
  const [fuelType] = useState<FuelType>('gasolina');

  const loadData = async () => {
    const list = await StorageService.getVehicles();
    const curActive = await StorageService.getActiveVehicleId();
    setVehicles(list);
    setActiveId(curActive || (list[0]?.id ?? null));
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

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Erro', 'Informe o apelido do veículo.');
      return;
    }
    const odomNum = parseInt(currentOdometer, 10) || 0;
    const yearNum = parseInt(year, 10) || new Date().getFullYear();
    const tankNum = parseInt(tankCapacity, 10) || 45;

    const newVeh: Vehicle = {
      id: 'veh-' + Date.now(),
      name: name.trim(),
      model: model.trim() || name.trim(),
      plate: plate.trim().toUpperCase() || 'ABC-1234',
      year: yearNum,
      tankCapacity: tankNum,
      currentOdometer: odomNum,
      fuelType,
      flexEfficiencyRatio: 0.70,
    };

    await StorageService.saveVehicle(newVeh);
    await StorageService.setActiveVehicleId(newVeh.id);
    setModalVisible(false);

    setName('');
    setModel('');
    setPlate('');
    setYear('');
    setCurrentOdometer('');
    await loadData();
  };

  const handleDelete = (id: string) => {
    if (vehicles.length <= 1) {
      Alert.alert('Atenção', 'Você precisa ter pelo menos um veículo cadastrado.');
      return;
    }
    Alert.alert('Remover Veículo', 'Deseja excluir este veículo da sua garagem?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await StorageService.deleteVehicle(id);
          await loadData();
        },
      },
    ]);
  };

  const handleResetDemo = () => {
    Alert.alert(
      'Restaurar Dados de Exemplo',
      'Deseja recarregar os veículos e abastecimentos de demonstração?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: async () => {
            await StorageService.resetDemo();
            await loadData();
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
    red: '#EF4444',
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Minha Garagem</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              Gerencie seus veículos e selecione o ativo
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.accent }]}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>+ Veículo</Text>
          </TouchableOpacity>
        </View>

        {/* PERFIL / CONTA DO USUÁRIO */}
        <View style={[styles.userCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.userInfo}>
            <View style={[styles.userAvatar, { backgroundColor: theme.accentLight }]}>
              <Ionicons name="person" size={20} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: theme.text }]}>
                {user?.displayName || 'Motorista'}
              </Text>
              <Text style={[styles.userEmail, { color: theme.textMuted }]} numberOfLines={1}>
                {user?.email || 'Conectado'}
              </Text>
            </View>
          </View>
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
          >
            <Ionicons name="log-out-outline" size={16} color={theme.red} />
            <Text style={[styles.logoutText, { color: theme.red }]}>Sair</Text>
          </TouchableOpacity>
        </View>

        {/* LISTA DE VEÍCULOS */}
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isActive = item.id === activeId;
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.carIconBadge, { backgroundColor: theme.accentLight }]}>
                      <Ionicons name="car-sport" size={22} color={theme.accent} />
                    </View>
                    <View>
                      <Text style={[styles.carName, { color: theme.text }]}>{item.name}</Text>
                      <Text style={[styles.carModel, { color: theme.textMuted }]}>
                        {item.model} • {item.year}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.plateBadge}>
                    <Text style={styles.plateText}>{item.plate}</Text>
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
                      {item.fuelType}
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

                  {vehicles.length > 1 && (
                    <TouchableOpacity onPress={() => handleDelete(item.id)}>
                      <Ionicons name="trash-outline" size={18} color={theme.red} />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />

        {/* BOTÃO RESTAURAR DEMO */}
        <TouchableOpacity style={styles.resetBtn} onPress={handleResetDemo}>
          <Ionicons name="refresh-outline" size={16} color={theme.textMuted} />
          <Text style={[styles.resetBtnText, { color: theme.textMuted }]}>
            Restaurar dados de demonstração
          </Text>
        </TouchableOpacity>

        {/* MODAL NOVO VEÍCULO */}
        <Modal visible={modalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Adicionar Veículo</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close-circle" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Apelido do Carro / Moto:</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Ex: Onix Turbo"
                  placeholderTextColor={theme.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Marca / Modelo Completo:</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                  value={model}
                  onChangeText={setModel}
                  placeholder="Ex: Chevrolet Onix Plus 1.0 Turbo"
                  placeholderTextColor={theme.textMuted}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Placa:</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                    value={plate}
                    onChangeText={setPlate}
                    placeholder="Ex: BRA2E19"
                    autoCapitalize="characters"
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
                    placeholder="Ex: 2023"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Odômetro Inicial (km):</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                    keyboardType="numeric"
                    value={currentOdometer}
                    onChangeText={setCurrentOdometer}
                    placeholder="Ex: 38450"
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
                    placeholder="Ex: 44"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.accent }]}
                onPress={handleSave}
              >
                <Text style={styles.saveBtnText}>Cadastrar Veículo</Text>
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
    paddingBottom: 20,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carName: {
    fontSize: 17,
    fontWeight: '800',
  },
  carModel: {
    fontSize: 12,
    marginTop: 2,
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
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  cardMidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeTagText: {
    color: '#10B981',
    fontWeight: '800',
    fontSize: 12,
  },
  selectPrompt: {
    fontSize: 12,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  resetBtnText: {
    fontSize: 12,
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
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
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
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
