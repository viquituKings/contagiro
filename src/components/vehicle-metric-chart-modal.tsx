import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Vehicle, Refueling, MaintenanceItem } from '@/types/vehicle';

export type ChartMetricType = 'consumo' | 'custo_km' | 'combustivel' | 'oficina';

interface VehicleMetricChartModalProps {
  visible: boolean;
  metricType: ChartMetricType | null;
  vehicle: Vehicle;
  refuelings: Refueling[];
  maintenances: MaintenanceItem[];
  onClose: () => void;
  isDark: boolean;
  theme: {
    bg: string;
    card: string;
    cardBorder: string;
    text: string;
    textMuted: string;
    accent: string;
    accentLight: string;
    blue: string;
    red: string;
  };
}

interface MonthData {
  key: string; // "YYYY-MM"
  shortLabel: string; // "Nov"
  fullLabel: string; // "Nov/26"
  monthFull: string; // "Novembro de 2026"
  isCurrent: boolean;
  value: number; // calculated metric value
  hasData: boolean;
  count: number; // count of records
  extraText?: string;
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_NAMES_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function VehicleMetricChartModal({
  visible,
  metricType,
  vehicle,
  refuelings,
  maintenances,
  onClose,
  isDark,
  theme,
}: VehicleMetricChartModalProps) {
  const insets = useSafeAreaInsets();
  const horizontalScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  // Mês selecionado no gráfico pelo usuário para exibir detalhes
  const [userSelectedMonthKey, setUserSelectedMonthKey] = useState<string | null>(null);

  // Configurações visuais por métrica
  const metricConfig = useMemo(() => {
    switch (metricType) {
      case 'consumo':
        return {
          title: 'Consumo Médio (km/L)',
          shortTitle: 'Consumo',
          subtitle: 'Médias mensais de consumo dos últimos 12 meses',
          unit: 'km/L',
          color: '#10B981',
          colorLight: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)',
          icon: 'speedometer' as const,
          formatValue: (v: number) => (v > 0 ? `${v.toFixed(1)} km/L` : '--'),
          formatBar: (v: number) => (v > 0 ? v.toFixed(1) : '-'),
          higherIsBetter: true,
        };
      case 'custo_km':
        return {
          title: 'Custo por km (R$/km)',
          shortTitle: 'Custo/km',
          subtitle: 'Custo médio por km rodado em cada um dos últimos 12 meses',
          unit: 'R$/km',
          color: '#3B82F6',
          colorLight: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.12)',
          icon: 'cash' as const,
          formatValue: (v: number) => (v > 0 ? `R$ ${v.toFixed(2)} / km` : '--'),
          formatBar: (v: number) => (v > 0 ? `R$ ${v.toFixed(2)}` : '-'),
          higherIsBetter: false,
        };
      case 'combustivel':
        return {
          title: 'Gasto com Combustível (R$)',
          shortTitle: 'Combustível',
          subtitle: 'Valor total gasto com abastecimentos nos últimos 12 meses',
          unit: 'R$',
          color: '#F97316',
          colorLight: isDark ? 'rgba(249, 115, 22, 0.15)' : 'rgba(249, 115, 22, 0.12)',
          icon: 'flame' as const,
          formatValue: (v: number) =>
            v > 0
              ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : 'R$ 0,00',
          formatBar: (v: number) => (v > 0 ? `R$ ${Math.round(v)}` : '-'),
          higherIsBetter: false,
        };
      case 'oficina':
        return {
          title: 'Gasto com Oficina (R$)',
          shortTitle: 'Oficina',
          subtitle: 'Valor total gasto com manutenção nos últimos 12 meses',
          unit: 'R$',
          color: '#8B5CF6',
          colorLight: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.12)',
          icon: 'construct' as const,
          formatValue: (v: number) =>
            v > 0
              ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : 'R$ 0,00',
          formatBar: (v: number) => (v > 0 ? `R$ ${Math.round(v)}` : '-'),
          higherIsBetter: false,
        };
      default:
        return null;
    }
  }, [metricType, isDark]);

  // Montagem dos 12 meses e agregação dos dados do veículo
  const monthsData = useMemo<MonthData[]>(() => {
    if (!metricType) return [];

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    const result: MonthData[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(curYear, curMonth - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const shortLabel = MONTH_NAMES[m];
      const yrShort = String(y).slice(-2);
      const fullLabel = `${shortLabel}/${yrShort}`;
      const monthFull = `${MONTH_NAMES_FULL[m]} de ${y}`;
      const isCurrent = i === 0;

      // Filtragem por veículo e mês
      const matchingRefs = refuelings.filter(
        (r) => r.vehicleId === vehicle.id && r.date && r.date.startsWith(key)
      );
      const matchingMnts = maintenances.filter(
        (item) => item.vehicleId === vehicle.id && item.date && item.date.startsWith(key)
      );

      let value = 0;
      let hasData = false;
      let count = 0;
      let extraText = '';

      if (metricType === 'consumo') {
        const measured = matchingRefs.filter(
          (r) => r.consumptionKmPerLiter != null && r.consumptionKmPerLiter > 0
        );
        if (measured.length > 0) {
          const sum = measured.reduce((acc, r) => acc + (r.consumptionKmPerLiter || 0), 0);
          value = Number((sum / measured.length).toFixed(1));
          hasData = true;
          count = measured.length;
          extraText = `${measured.length} abastecimento(s) com consumo calculado`;
        }
      } else if (metricType === 'custo_km') {
        const measured = matchingRefs.filter(
          (r) => r.costPerKm != null && r.costPerKm > 0
        );
        if (measured.length > 0) {
          const sum = measured.reduce((acc, r) => acc + (r.costPerKm || 0), 0);
          value = Number((sum / measured.length).toFixed(2));
          hasData = true;
          count = measured.length;
          extraText = `${measured.length} abastecimento(s) com custo por km`;
        }
      } else if (metricType === 'combustivel') {
        if (matchingRefs.length > 0) {
          value = matchingRefs.reduce((acc, r) => acc + (r.totalAmount || 0), 0);
          const totalLiters = matchingRefs.reduce((acc, r) => acc + (r.liters || 0), 0);
          hasData = value > 0;
          count = matchingRefs.length;
          extraText = `${matchingRefs.length} abastecimento(s) • ${totalLiters.toFixed(1)} L`;
        }
      } else if (metricType === 'oficina') {
        if (matchingMnts.length > 0) {
          value = matchingMnts.reduce((acc, item) => acc + (item.cost || 0), 0);
          hasData = value > 0;
          count = matchingMnts.length;
          extraText = `${matchingMnts.length} manutenção(ões) registrada(s)`;
        }
      }

      result.push({
        key,
        shortLabel,
        fullLabel,
        monthFull,
        isCurrent,
        value,
        hasData,
        count,
        extraText,
      });
    }

    return result;
  }, [metricType, vehicle.id, refuelings, maintenances]);

  // Chave padrão: último mês com dados ou o mês atual
  const defaultMonthKey = useMemo(() => {
    if (monthsData.length === 0) return null;
    const lastWithData = [...monthsData].reverse().find((m) => m.hasData);
    return lastWithData ? lastWithData.key : monthsData[monthsData.length - 1].key;
  }, [monthsData]);

  const activeMonthKey = userSelectedMonthKey || defaultMonthKey;

  // Rola automaticamente o gráfico para os meses mais recentes ao abrir
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        horizontalScrollRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [visible]);

  // Cálculo de estatísticas consolidadas do período
  const stats = useMemo(() => {
    const dataMonths = monthsData.filter((m) => m.hasData);
    if (dataMonths.length === 0) {
      return {
        totalPeriodo: 0,
        mediaPeriodo: 0,
        melhorMes: null,
        piorMes: null,
        qtdMesesComDados: 0,
      };
    }

    const sum = dataMonths.reduce((acc, m) => acc + m.value, 0);
    const avg = sum / dataMonths.length;

    let melhor = dataMonths[0];
    let pior = dataMonths[0];

    dataMonths.forEach((m) => {
      if (metricConfig?.higherIsBetter) {
        if (m.value > melhor.value) melhor = m;
        if (m.value < pior.value) pior = m;
      } else {
        if (m.value < melhor.value) melhor = m;
        if (m.value > pior.value) pior = m;
      }
    });

    return {
      totalPeriodo: sum,
      mediaPeriodo: avg,
      melhorMes: melhor,
      piorMes: pior,
      qtdMesesComDados: dataMonths.length,
    };
  }, [monthsData, metricConfig]);

  if (!visible || !metricConfig) {
    return null;
  }

  // Altura máxima da barra para cálculo proporcional
  const maxValue = Math.max(...monthsData.map((m) => m.value), 0);
  const chartHeight = 125;

  const selectedMonth = monthsData.find((m) => m.key === activeMonthKey) || monthsData[monthsData.length - 1];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
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
          {/* HEADER DO POP-UP */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={[styles.headerIconBadge, { backgroundColor: metricConfig.colorLight }]}>
                <Ionicons name={metricConfig.icon} size={22} color={metricConfig.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                  {metricConfig.title}
                </Text>
                <Text style={[styles.modalSubtitle, { color: theme.textMuted }]} numberOfLines={1}>
                  {vehicle.name} • {vehicle.plate}
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={26} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollBody}
          >
            {/* KPI BANNER / RESUMO DO PERÍODO */}
            <View style={[styles.kpiContainer, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
              <View style={styles.kpiCol}>
                <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>
                  {metricType === 'combustivel' || metricType === 'oficina'
                    ? 'Total 12 Meses'
                    : 'Média 12 Meses'}
                </Text>
                <Text style={[styles.kpiValue, { color: metricConfig.color }]}>
                  {metricType === 'combustivel' || metricType === 'oficina'
                    ? metricConfig.formatValue(stats.totalPeriodo)
                    : metricConfig.formatValue(stats.mediaPeriodo)}
                </Text>
              </View>

              <View style={[styles.kpiDivider, { backgroundColor: theme.cardBorder }]} />

              <View style={styles.kpiCol}>
                <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>
                  {metricConfig.higherIsBetter ? 'Melhor Mês' : 'Menor Gasto / Mês'}
                </Text>
                <Text style={[styles.kpiValueSecondary, { color: theme.text }]} numberOfLines={1}>
                  {stats.melhorMes
                    ? `${stats.melhorMes.shortLabel}: ${metricConfig.formatBar(stats.melhorMes.value)}`
                    : '--'}
                </Text>
              </View>
            </View>

            {/* GRÁFICO DE BARRAS VERTICAIS DOS 12 MESES */}
            <View style={[styles.chartContainer, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
              <View style={styles.chartTitleRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="bar-chart" size={15} color={metricConfig.color} />
                  <Text style={[styles.chartTitle, { color: theme.text }]}>
                    Evolução Mensal (12 Meses)
                  </Text>
                </View>
                <Text style={[styles.chartHint, { color: theme.textMuted }]}>
                  Toque na barra para detalhar
                </Text>
              </View>

              {/* LINHAS DE GRADE DE REFERÊNCIA */}
              <View style={[styles.chartArea, { height: chartHeight + 42 }]}>
                <View style={styles.gridLinesOverlay}>
                  <View style={[styles.gridLine, { borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]} />
                  <View style={[styles.gridLine, { borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]} />
                  <View style={[styles.gridLineBottom, { borderColor: isDark ? '#334155' : '#E2E8F0' }]} />
                </View>

                {/* SCROLL HORIZONTAL COM AS 12 BARRAS */}
                <ScrollView
                  ref={horizontalScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.barsScrollContent}
                >
                  {monthsData.map((slot) => {
                    const isSelected = slot.key === activeMonthKey;
                    const barRatio = maxValue > 0 && slot.hasData ? slot.value / maxValue : 0;
                    const barHeightPx = slot.hasData ? Math.max(14, Math.round(barRatio * chartHeight)) : 6;

                    return (
                      <TouchableOpacity
                        key={slot.key}
                        style={[
                          styles.barCol,
                          isSelected && {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                            borderRadius: 10,
                          },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => setUserSelectedMonthKey(slot.key)}
                      >
                        {/* VALOR NO TOPO DA BARRA */}
                        <View style={styles.barValueWrapper}>
                          <Text
                            style={[
                              styles.barTopText,
                              {
                                color: isSelected ? metricConfig.color : theme.textMuted,
                                fontWeight: isSelected ? '800' : '600',
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {metricConfig.formatBar(slot.value)}
                          </Text>
                        </View>

                        {/* TRILHO E PREENCHIMENTO DA BARRA */}
                        <View
                          style={[
                            styles.barTrack,
                            {
                              height: chartHeight,
                              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.barFill,
                              {
                                height: barHeightPx,
                                backgroundColor: slot.hasData
                                  ? isSelected
                                    ? metricConfig.color
                                    : isDark
                                    ? '#475569'
                                    : '#94A3B8'
                                  : isDark
                                  ? '#1E293B'
                                  : '#E2E8F0',
                                opacity: slot.hasData ? 1 : 0.5,
                              },
                            ]}
                          />
                        </View>

                        {/* RÓTULO DO MÊS */}
                        <Text
                          style={[
                            styles.barMonthLabel,
                            {
                              color: isSelected ? metricConfig.color : slot.isCurrent ? theme.text : theme.textMuted,
                              fontWeight: isSelected || slot.isCurrent ? '800' : '600',
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {slot.shortLabel}
                        </Text>
                        <Text
                          style={[
                            styles.barYearLabel,
                            {
                              color: isSelected ? metricConfig.color : theme.textMuted,
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {slot.fullLabel.split('/')[1] ? `'${slot.fullLabel.split('/')[1]}` : ''}
                        </Text>

                        {/* PONTO INDICADOR DO MÊS ATUAL */}
                        {slot.isCurrent && (
                          <View style={[styles.currentMonthDot, { backgroundColor: metricConfig.color }]} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* DETALHAMENTO DO MÊS SELECIONADO */}
            {selectedMonth && (
              <View
                style={[
                  styles.selectedMonthCard,
                  {
                    backgroundColor: metricConfig.colorLight,
                    borderColor: metricConfig.color + '44',
                  },
                ]}
              >
                <View style={styles.selectedMonthHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="calendar-outline" size={16} color={metricConfig.color} />
                    <Text style={[styles.selectedMonthTitle, { color: theme.text }]}>
                      {selectedMonth.monthFull}
                    </Text>
                  </View>
                  {selectedMonth.isCurrent && (
                    <View style={[styles.currentBadge, { backgroundColor: metricConfig.color }]}>
                      <Text style={styles.currentBadgeText}>Mês Atual</Text>
                    </View>
                  )}
                </View>

                <View style={styles.selectedMonthValueRow}>
                  <Text style={[styles.selectedMonthValue, { color: metricConfig.color }]}>
                    {metricConfig.formatValue(selectedMonth.value)}
                  </Text>
                  <Text style={[styles.selectedMonthStatus, { color: theme.textMuted }]}>
                    {selectedMonth.hasData ? selectedMonth.extraText : 'Nenhum registro neste mês'}
                  </Text>
                </View>
              </View>
            )}

            {/* TABELA / LISTA DOS 12 MESES */}
            <View style={[styles.historyListCard, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
              <View style={styles.historyListHeader}>
                <Ionicons name="list" size={15} color={theme.textMuted} />
                <Text style={[styles.historyListTitle, { color: theme.text }]}>Histórico Mês a Mês</Text>
              </View>

              {monthsData
                .slice()
                .reverse()
                .map((m) => {
                  const isSelected = m.key === activeMonthKey;
                  return (
                    <TouchableOpacity
                      key={m.key}
                      style={[
                        styles.historyItemRow,
                        {
                          borderBottomColor: theme.cardBorder,
                          backgroundColor: isSelected ? (isDark ? 'rgba(255,255,255,0.03)' : '#F1F5F9') : 'transparent',
                        },
                      ]}
                      onPress={() => setUserSelectedMonthKey(m.key)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View
                          style={[
                            styles.historyMonthBadge,
                            {
                              backgroundColor: m.isCurrent
                                ? metricConfig.color
                                : isDark
                                ? '#1E293B'
                                : '#E2E8F0',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.historyMonthBadgeText,
                              { color: m.isCurrent ? '#FFFFFF' : theme.text },
                            ]}
                          >
                            {m.shortLabel}
                          </Text>
                        </View>
                        <View>
                          <Text style={[styles.historyMonthName, { color: theme.text }]}>
                            {m.monthFull}
                          </Text>
                          <Text style={[styles.historyMonthSub, { color: theme.textMuted }]}>
                            {m.hasData ? m.extraText : 'Sem dados'}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={[
                          styles.historyMonthValue,
                          {
                            color: m.hasData ? metricConfig.color : theme.textMuted,
                            fontWeight: m.hasData ? '800' : '500',
                          },
                        ]}
                      >
                        {metricConfig.formatValue(m.value)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </View>
          </ScrollView>

          {/* BOTÃO FECHAR */}
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={[styles.closeBtnText, { color: theme.text }]}>Fechar Gráfico</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 16,
    maxHeight: '90%',
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  headerIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  scrollBody: {
    gap: 14,
    paddingBottom: 10,
  },
  kpiContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  kpiCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  kpiValueSecondary: {
    fontSize: 13,
    fontWeight: '800',
  },
  kpiDivider: {
    width: 1,
    height: 28,
  },
  chartContainer: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
  },
  chartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  chartHint: {
    fontSize: 11,
    fontWeight: '500',
  },
  chartArea: {
    position: 'relative',
    justifyContent: 'flex-end',
  },
  gridLinesOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 24,
    justifyContent: 'space-between',
  },
  gridLine: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    width: '100%',
  },
  gridLineBottom: {
    borderBottomWidth: 1,
    width: '100%',
  },
  barsScrollContent: {
    paddingHorizontal: 4,
    gap: 6,
    alignItems: 'flex-end',
  },
  barCol: {
    width: 44,
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  barValueWrapper: {
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  barTopText: {
    fontSize: 9,
    textAlign: 'center',
  },
  barTrack: {
    width: 16,
    borderRadius: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  barMonthLabel: {
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center',
  },
  barYearLabel: {
    fontSize: 8,
    marginTop: -2,
    textAlign: 'center',
  },
  currentMonthDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  selectedMonthCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  selectedMonthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedMonthTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  currentBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  currentBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  selectedMonthValueRow: {
    gap: 2,
  },
  selectedMonthValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  selectedMonthStatus: {
    fontSize: 11,
    fontWeight: '500',
  },
  historyListCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 8,
  },
  historyListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  historyListTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  historyItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  historyMonthBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyMonthBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  historyMonthName: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyMonthSub: {
    fontSize: 10,
    marginTop: 1,
  },
  historyMonthValue: {
    fontSize: 13,
  },
  closeBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
