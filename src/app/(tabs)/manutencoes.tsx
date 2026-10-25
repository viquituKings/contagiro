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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StorageService } from '@/services/storage';
import { Calculations } from '@/services/calculations';
import { Vehicle, MaintenanceItem, MaintenanceCategory } from '@/types/vehicle';

export default function MaintenancesScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [maintenances, setMaintenances] = useState<MaintenanceItem[]>([]);
  const [activeTab, setActiveTab] = useState<'alertas' | 'historico'>('alertas');
  const [modalVisible, setModalVisible] = useState(false);

  // Formulário
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('oleo_filtro');
  const [cost, setCost] = useState('');
  const [odometer, setOdometer] = useState('');
  const [workshop, setWorkshop] = useState('');
  const [nextIntervalKm, setNextIntervalKm] = useState('10000');

  const loadData = async () => {
    const curVehicle = await StorageService.getActiveVehicle();
    setVehicle(curVehicle);
    if (curVehicle) {
      const list = await StorageService.getMaintenances(curVehicle.id);
      setMaintenances(list);
      setOdometer(String(curVehicle.currentOdometer));
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const handleSave = async () => {
    if (!vehicle) return;

    const odomNum = parseInt(odometer, 10);
    const costNum = parseFloat(cost.replace(',', '.'));
    const nextInterval = parseInt(nextIntervalKm, 10);

    if (!title.trim()) {
      Alert.alert('Erro', 'Insira o nome do serviço ou peça.');
      return;
    }
    if (isNaN(odomNum) || odomNum <= 0) {
      Alert.alert('Erro', 'Insira a quilometragem da manutenção.');
      return;
    }
    if (isNaN(costNum) || costNum < 0) {
      Alert.alert('Erro', 'Insira o custo do serviço.');
      return;
    }

    const nextDueOdometer = !isNaN(nextInterval) && nextInterval > 0 ? odomNum + nextInterval : undefined;

    const newMnt: MaintenanceItem = {
      id: 'mnt-' + Date.now(),
      vehicleId: vehicle.id,
      date: new Date().toISOString().split('T')[0],
      odometer: odomNum,
      category,
      title: title.trim(),
      workshop: workshop.trim() || undefined,
      cost: costNum,
      nextDueOdometer,
      isCompleted: true,
    };

    await StorageService.addMaintenance(newMnt);
    setModalVisible(false);
    setTitle('');
    setCost('');
    setWorkshop('');
    await loadData();
  };

  const handleDelete = (id: string) => {
    Alert.alert('Excluir Manutenção', 'Deseja remover este registro do histórico?', [
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
    ? Calculations.getMaintenanceAlerts(vehicle.currentOdometer, maintenances)
    : [];

  const totalSpent = maintenances.reduce((acc, m) => acc + m.cost, 0);

  const theme = {
    bg: isDark ? '#090D16' : '#F8FAFC',
    card: isDark ? '#141D2E' : '#FFFFFF',
    cardBorder: isDark ? '#1E2D44' : '#E2E8F0',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    accent: '#10B981',
    blue: '#3B82F6',
    amber: '#F59E0B',
    red: '#EF4444',
  };

  const categories: { id: MaintenanceCategory; label: string }[] = [
    { id: 'oleo_filtro', label: 'Óleo e Filtros' },
    { id: 'freios', label: 'Freios' },
    { id: 'pneus', label: 'Pneus e Rodas' },
    { id: 'suspensao', label: 'Suspensão' },
    { id: 'revisao_geral', label: 'Revisão Geral' },
    { id: 'ar_condicionado', label: 'Ar Condicionado' },
    { id: 'bateria', label: 'Bateria e Elétrica' },
    { id: 'documentacao', label: 'IPVA e Seguro' },
    { id: 'outros', label: 'Outros' },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Oficina & Manutenções</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              Total investido: R$ {totalSpent.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.blue }]}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>+ Manutenção</Text>
          </TouchableOpacity>
        </View>

        {/* TABS SELECTOR */}
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

        {/* CONTEÚDO: ALERTAS */}
        {activeTab === 'alertas' && (
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {alerts.map((item, idx) => {
              const isVencido = item.status === 'vencido';
              const isProximo = item.status === 'proximo';
              const badgeColor = isVencido ? theme.red : isProximo ? theme.amber : theme.accent;
              const badgeText = isVencido ? 'VENCIDO' : isProximo ? 'ATENÇÃO' : 'EM DIA';

              return (
                <View
                  key={idx}
                  style={[
                    styles.alertCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: isVencido ? theme.red : isProximo ? theme.amber : theme.cardBorder,
                    },
                  ]}
                >
                  <View style={styles.alertTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertTitle, { color: theme.text }]}>{item.title}</Text>
                      <Text style={[styles.alertSub, { color: theme.textMuted }]}>
                        Previsto para: {item.dueKm?.toLocaleString('pt-BR')} km
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: badgeColor + '22' }]}>
                      <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{badgeText}</Text>
                    </View>
                  </View>

                  <View style={styles.alertMidRow}>
                    <Text style={[styles.kmRemainingText, { color: isVencido ? theme.red : theme.text }]}>
                      {isVencido
                        ? `Atrasado há ${Math.abs(item.kmRemaining || 0).toLocaleString('pt-BR')} km`
                        : `Faltam ${item.kmRemaining?.toLocaleString('pt-BR')} km`}
                    </Text>
                    <Text style={[styles.alertCostText, { color: theme.textMuted }]}>
                      Custo estimado: <Text style={{ color: theme.text, fontWeight: 'bold' }}>R$ {item.estimatedCost}</Text>
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* CONTEÚDO: HISTÓRICO */}
        {activeTab === 'historico' && (
          <FlatList
            data={maintenances}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="construct-outline" size={54} color={theme.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhuma manutenção</Text>
                <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                  Cadastre trocas de óleo, pneus e revisões para manter o histórico completo.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.historyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.historyTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyTitle, { color: theme.text }]}>{item.title}</Text>
                    <Text style={[styles.historyDate, { color: theme.textMuted }]}>
                      {item.date} • {item.odometer.toLocaleString('pt-BR')} km
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(item.id)}>
                    <Ionicons name="trash-outline" size={18} color={theme.red} />
                  </TouchableOpacity>
                </View>

                <View style={styles.historyBottomRow}>
                  <Text style={[styles.workshopText, { color: theme.textMuted }]}>
                    {item.workshop ? `Oficina: ${item.workshop}` : 'Oficina não informada'}
                  </Text>
                  <Text style={[styles.historyCost, { color: theme.blue }]}>
                    R$ {item.cost.toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
          />
        )}

        {/* MODAL NOVA MANUTENÇÃO */}
        <Modal visible={modalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Registrar Manutenção</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Ionicons name="close-circle" size={24} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Categorias */}
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Categoria:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
                  {categories.map((c) => {
                    const isSel = category === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.catPill,
                          {
                            backgroundColor: isSel ? theme.blue : theme.bg,
                            borderColor: theme.cardBorder,
                          },
                        ]}
                        onPress={() => setCategory(c.id)}
                      >
                        <Text style={[styles.catPillText, { color: isSel ? '#FFFFFF' : theme.text }]}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Descrição */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Serviço / Peça:</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Ex: Troca de Óleo 5W30 + Filtros"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>

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
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Km Atual:</Text>
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

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Oficina / Local:</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      value={workshop}
                      onChangeText={setWorkshop}
                      placeholder="Ex: Centro Automotivo Bosch"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Próxima troca em (+km):</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.cardBorder }]}
                      keyboardType="numeric"
                      value={nextIntervalKm}
                      onChangeText={setNextIntervalKm}
                      placeholder="Ex: 10000"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.blue }]}
                  onPress={handleSave}
                >
                  <Text style={styles.saveBtnText}>Salvar Manutenção</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
  tabSelector: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  listContent: {
    gap: 12,
    paddingBottom: 30,
  },
  alertCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 10,
  },
  alertTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  alertTitle: {
    fontSize: 16,
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
    fontSize: 11,
    fontWeight: '900',
  },
  alertMidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  kmRemainingText: {
    fontSize: 13,
    fontWeight: '800',
  },
  alertCostText: {
    fontSize: 12,
  },
  historyCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
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
    marginTop: 2,
  },
  historyBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
  },
  workshopText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  historyCost: {
    fontSize: 16,
    fontWeight: '900',
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
  modalScroll: {
    flexGrow: 1,
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
});
