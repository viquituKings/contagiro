import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ElectricityTariff } from '@/types/vehicle';
import { StorageService } from '@/services/storage';

interface ElectricityTariffModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: (tariff: ElectricityTariff) => void;
  initialTariff?: ElectricityTariff | null;
  allowSkip?: boolean;
}

export const ElectricityTariffModal: React.FC<ElectricityTariffModalProps> = ({
  visible,
  onClose,
  onSaved,
  initialTariff,
  allowSkip = false,
}) => {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [totalAmount, setTotalAmount] = useState('');
  const [totalKwh, setTotalKwh] = useState('');
  const [referenceMonth, setReferenceMonth] = useState('');
  const [saving, setSaving] = useState(false);

  const getCurrentMonthName = () => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const now = new Date();
    return `${months[now.getMonth()]}/${now.getFullYear()}`;
  };

  useEffect(() => {
    if (!visible) return;
    let isActive = true;

    const initData = async () => {
      if (initialTariff) {
        if (!isActive) return;
        setTotalAmount(initialTariff.totalAmount ? String(initialTariff.totalAmount).replace('.', ',') : '');
        setTotalKwh(initialTariff.totalKwh ? String(initialTariff.totalKwh).replace('.', ',') : '');
        setReferenceMonth(initialTariff.referenceMonth || getCurrentMonthName());
      } else {
        const saved = await StorageService.getElectricityTariff();
        if (!isActive) return;
        if (saved) {
          setTotalAmount(String(saved.totalAmount).replace('.', ','));
          setTotalKwh(String(saved.totalKwh).replace('.', ','));
          setReferenceMonth(saved.referenceMonth || getCurrentMonthName());
        } else {
          setReferenceMonth(getCurrentMonthName());
        }
      }
    };

    initData();

    return () => {
      isActive = false;
    };
  }, [visible, initialTariff]);

  const numTotalAmount = parseFloat(totalAmount.replace(',', '.')) || 0;
  const numTotalKwh = parseFloat(totalKwh.replace(',', '.')) || 0;
  const calculatedRate = numTotalAmount > 0 && numTotalKwh > 0 ? numTotalAmount / numTotalKwh : 0;

  const handleSave = async () => {
    if (numTotalAmount <= 0) {
      Alert.alert('Atenção', 'Informe o valor total da sua conta de energia.');
      return;
    }
    if (numTotalKwh <= 0) {
      Alert.alert('Atenção', 'Informe o consumo total em kWh da sua conta.');
      return;
    }

    setSaving(true);
    try {
      const tariffData: ElectricityTariff = {
        totalAmount: Number(numTotalAmount.toFixed(2)),
        totalKwh: Number(numTotalKwh.toFixed(2)),
        kwhRate: Number(calculatedRate.toFixed(4)),
        referenceMonth: referenceMonth.trim() || getCurrentMonthName(),
        updatedAt: new Date().toISOString(),
      };

      await StorageService.saveElectricityTariff(tariffData);
      onSaved?.(tariffData);
      Alert.alert(
        'Tarifa Atualizada!',
        `Sua tarifa de energia foi definida em R$ ${tariffData.kwhRate.toFixed(2)}/kWh para a referência ${tariffData.referenceMonth}.`,
        [{ text: 'OK', onPress: onClose }]
      );
    } catch (err) {
      console.error('Erro ao salvar tarifa:', err);
      Alert.alert('Erro', 'Ocorreu um erro ao salvar a tarifa. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const theme = {
    bg: isDark ? '#090D16' : '#F8FAFC',
    card: isDark ? '#141D2E' : '#FFFFFF',
    cardBorder: isDark ? '#1E2D44' : '#E2E8F0',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    accent: '#06B6D4', // Ciano elétrico
    accentBg: isDark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(6, 182, 212, 0.1)',
    green: '#10B981',
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              paddingBottom: Math.max(insets.bottom, 16) + 10,
            },
          ]}
        >
          {/* HEADER */}
          <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="flash" size={20} color={theme.accent} />
                <Text style={[styles.title, { color: theme.text }]}>Tarifa de Energia</Text>
              </View>
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                Cálculo do custo real por kWh da sua região
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}
            >
              <Ionicons name="close" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* EXPLICATIVO DA COLETA */}
            <View style={[styles.infoBox, { backgroundColor: theme.accentBg, borderColor: theme.accent }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Ionicons name="information-circle" size={18} color={theme.accent} />
                <Text style={[styles.infoTitle, { color: theme.accent }]}>Por que coletamos esses dados?</Text>
              </View>
              <Text style={[styles.infoText, { color: theme.text }]}>
                Para calcular com máxima precisão o custo dos carregamentos residenciais do seu veículo elétrico,
                precisamos da tarifa real da sua distribuidora.
                {'\n\n'}
                Dividindo o <Text style={{ fontWeight: '700' }}>valor total da sua conta de luz</Text> pelo{' '}
                <Text style={{ fontWeight: '700' }}>consumo total em kWh</Text>, obtemos a tarifa efetiva (R$/kWh) já
                incluindo impostos (ICMS, PIS, COFINS) e bandeiras tarifárias.
                {'\n\n'}
                <Text style={{ fontWeight: '700', color: theme.accent }}>
                  Recomendamos atualizar esses dados todos os meses ao receber sua fatura de energia.
                </Text>
              </Text>
            </View>

            {/* INPUT: VALOR TOTAL DA CONTA */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
                Valor Total da Última Conta de Luz (R$):
              </Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                <Text style={[styles.inputPrefix, { color: theme.textMuted }]}>R$</Text>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Ex: 350,00"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                />
              </View>
            </View>

            {/* INPUT: CONSUMO TOTAL EM KWH */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
                Consumo Total Faturado na Conta (kWh):
              </Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                <Ionicons name="speedometer-outline" size={18} color={theme.textMuted} style={{ marginRight: 6 }} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Ex: 400"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={totalKwh}
                  onChangeText={setTotalKwh}
                />
                <Text style={[styles.inputSuffix, { color: theme.textMuted }]}>kWh</Text>
              </View>
            </View>

            {/* INPUT: MÊS DE REFERÊNCIA */}
            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Mês de Referência da Conta:</Text>
                <TouchableOpacity onPress={() => setReferenceMonth(getCurrentMonthName())}>
                  <Text style={[styles.currentMonthLink, { color: theme.accent }]}>Mês Atual</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
                <Ionicons name="calendar-outline" size={18} color={theme.textMuted} style={{ marginRight: 6 }} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Ex: Novembro/2026"
                  placeholderTextColor={theme.textMuted}
                  value={referenceMonth}
                  onChangeText={setReferenceMonth}
                />
              </View>
            </View>

            {/* CARD DE RESULTADO EM TEMPO REAL */}
            <View
              style={[
                styles.resultCard,
                {
                  backgroundColor: calculatedRate > 0 ? theme.bg : 'transparent',
                  borderColor: calculatedRate > 0 ? theme.accent : theme.cardBorder,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={[styles.resultLabel, { color: theme.textMuted }]}>Tarifa Efetiva Resultante:</Text>
                  <Text
                    style={[
                      styles.resultValue,
                      { color: calculatedRate > 0 ? theme.accent : theme.textMuted },
                    ]}
                  >
                    {calculatedRate > 0 ? `R$ ${calculatedRate.toFixed(4)}` : 'R$ --'}
                    <Text style={{ fontSize: 13, fontWeight: '600' }}> / kWh</Text>
                  </Text>
                </View>
                {calculatedRate > 0 && (
                  <View style={[styles.formulaBadge, { backgroundColor: theme.accentBg }]}>
                    <Text style={[styles.formulaText, { color: theme.accent }]}>
                      R$ {numTotalAmount.toFixed(2)} ÷ {numTotalKwh} kWh
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* BOTÕES DE AÇÃO */}
            <View style={styles.actionsRow}>
              {allowSkip && (
                <TouchableOpacity
                  style={[styles.skipBtn, { borderColor: theme.cardBorder }]}
                  onPress={onClose}
                  disabled={saving}
                >
                  <Text style={[styles.skipBtnText, { color: theme.textMuted }]}>Configurar Depois</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  {
                    backgroundColor: theme.accent,
                    flex: allowSkip ? 1.4 : 1,
                    opacity: saving || calculatedRate <= 0 ? 0.6 : 1,
                  },
                ]}
                onPress={handleSave}
                disabled={saving || calculatedRate <= 0}
              >
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar Tarifa'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '84%',
    maxHeight: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 18,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingVertical: 16,
    gap: 14,
  },
  infoBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  inputPrefix: {
    fontSize: 15,
    fontWeight: '700',
    marginRight: 6,
  },
  inputSuffix: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  currentMonthLink: {
    fontSize: 12,
    fontWeight: '700',
  },
  resultCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  resultValue: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  formulaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  formulaText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 10,
  },
  skipBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
