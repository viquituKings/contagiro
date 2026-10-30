import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Vehicle } from '@/types/vehicle';
import { Ionicons } from '@expo/vector-icons';

interface DashboardTheme {
  bg: string;
  card: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  blue: string;
  amber: string;
  amberLight: string;
  red: string;
  redLight: string;
}

// =========================================================================
// 1. GRÁFICO DE BARRAS VERTICAIS: MÉDIA DE CONSUMO (km/L) POR VEÍCULO
// =========================================================================

interface ConsumptionBarChartProps {
  vehicles: Vehicle[];
  activeVehicleId: string;
  activeConsumption: number;
  bestConsumption?: number;
  theme: DashboardTheme;
  isDark: boolean;
}

export function ConsumptionBarChart({
  vehicles,
  activeVehicleId,
  activeConsumption,
  bestConsumption,
  theme,
  isDark,
}: ConsumptionBarChartProps) {
  // Prepara dados de cada veículo cadastrado
  const items = vehicles.map((v) => {
    const isSelected = v.id === activeVehicleId;
    const rawVal = isSelected
      ? Number(activeConsumption || v.mediaGeralKmPorLitro || 0)
      : Number(v.mediaGeralKmPorLitro || 0);

    const val = Number(rawVal.toFixed(1));
    const firstName = v.name ? v.name.split(' ')[0] : 'Veículo';

    return {
      id: v.id,
      name: v.name || v.model || 'Veículo',
      firstName,
      plate: v.plate || '',
      consumption: val,
      isSelected,
      vehicleType: v.vehicleType || 'carro',
    };
  });

  const maxVal = Math.max(...items.map((i) => i.consumption), 16);
  const chartHeight = 110;

  // Média da frota para insights
  const validItems = items.filter((i) => i.consumption > 0);
  const fleetAverage =
    validItems.length > 0
      ? Number((validItems.reduce((acc, i) => acc + i.consumption, 0) / validItems.length).toFixed(1))
      : 0;

  const activeItem = items.find((i) => i.isSelected);

  return (
    <View style={styles.chartWrapper}>
      {/* LINHAS DE REFERÊNCIA HORIZONTAIS */}
      <View style={[styles.barChartContainer, { height: chartHeight + 45 }]}>
        <View style={styles.gridLinesContainer}>
          <View style={[styles.gridLine, { borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
          <View style={[styles.gridLine, { borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
          <View style={[styles.gridLineBottom, { borderColor: isDark ? '#334155' : '#E2E8F0' }]} />
        </View>

        {/* COLUNAS COM AS BARRAS VERTICAIS */}
        <View style={styles.barsRow}>
          {items.map((item) => {
            const hasData = item.consumption > 0;
            const barPct = hasData ? Math.min(1, item.consumption / maxVal) : 0;
            const barHeightPx = hasData ? Math.max(12, Math.round(barPct * chartHeight)) : 6;

            const barColor = item.isSelected
              ? '#10B981'
              : isDark
              ? '#475569'
              : '#94A3B8';

            return (
              <View key={item.id} style={styles.barColumn}>
                {/* VALOR NO TOPO DA BARRA */}
                <View style={styles.barValueBox}>
                  <Text
                    style={[
                      styles.barValueText,
                      {
                        color: item.isSelected
                          ? '#10B981'
                          : theme.textMuted,
                        fontWeight: item.isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {hasData ? item.consumption.toFixed(1) : '-'}
                  </Text>
                  {hasData && (
                    <Text
                      style={[
                        styles.barUnitText,
                        { color: item.isSelected ? '#10B981' : theme.textMuted },
                      ]}
                    >
                      km/L
                    </Text>
                  )}
                </View>

                {/* BARRA VERTICAL */}
                <View
                  style={[
                    styles.barTrack,
                    {
                      height: chartHeight,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: barHeightPx,
                        backgroundColor: barColor,
                        shadowColor: item.isSelected ? '#10B981' : 'transparent',
                        shadowOpacity: item.isSelected ? 0.35 : 0,
                        shadowRadius: 6,
                        elevation: item.isSelected ? 4 : 0,
                      },
                    ]}
                  />
                </View>

                {/* IDENTIFICADOR DO VEÍCULO EMBAIXO */}
                <View style={styles.barLabelContainer}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons
                      name={item.vehicleType === 'moto' ? 'bicycle' : 'car-sport'}
                      size={11}
                      color={item.isSelected ? '#10B981' : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.barVehicleName,
                        {
                          color: item.isSelected ? theme.text : theme.textMuted,
                          fontWeight: item.isSelected ? '700' : '500',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.firstName}
                    </Text>
                  </View>

                  {item.isSelected ? (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>Ativo</Text>
                    </View>
                  ) : (
                    <Text style={[styles.barVehiclePlate, { color: theme.textMuted }]} numberOfLines={1}>
                      {item.plate}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* RODAPÉ DO GRÁFICO COM INSIGHT COMPARATIVO */}
      <View
        style={[
          styles.chartFooterBox,
          {
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.06)',
            borderColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)',
          },
        ]}
      >
        <Ionicons name="stats-chart" size={14} color="#10B981" />
        <View style={{ flex: 1 }}>
          {items.length > 1 ? (
            <Text style={[styles.chartFooterText, { color: theme.text }]}>
              {activeItem && activeItem.consumption > 0 && fleetAverage > 0 ? (
                activeItem.consumption >= fleetAverage ? (
                  <>
                    <Text style={{ fontWeight: '700', color: '#10B981' }}>
                      {((activeItem.consumption / fleetAverage - 1) * 100).toFixed(0)}% mais eficiente{' '}
                    </Text>
                    que a média da sua frota ({fleetAverage.toFixed(1)} km/L).
                  </>
                ) : (
                  <>
                    <Text style={{ fontWeight: '700', color: '#F59E0B' }}>
                      {((1 - activeItem.consumption / fleetAverage) * 100).toFixed(0)}% abaixo{' '}
                    </Text>
                    da média da sua frota ({fleetAverage.toFixed(1)} km/L).
                  </>
                )
              ) : activeItem && activeItem.consumption === 0 ? (
                'Por não ter um segundo abastecimento, o veículo não possui média calculada.'
              ) : (
                'Comparativo de consumo entre todos os seus veículos cadastrados.'
              )}
            </Text>
          ) : (
            <Text style={[styles.chartFooterText, { color: theme.textMuted }]}>
              {bestConsumption
                ? `Melhor registro deste veículo: ${bestConsumption} km/L. Cadastre mais veículos para comparar.`
                : 'Cadastre outros veículos na Garagem para ver o comparativo de consumo da frota.'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// =========================================================================
// 2. GRÁFICO DE PIZZA / DONUT: FATIA DO VEÍCULO SELECIONADO NA FROTA
// =========================================================================

interface ProportionDonutChartProps {
  vehicles: Vehicle[];
  activeVehicleId: string;
  activeValue: number;
  valueType: 'cost' | 'costPerKm' | 'maintenance';
  activeColor: string;
  theme: DashboardTheme;
  isDark: boolean;
}

const PALETTE_COLORS = [
  '#3B82F6', // Azul
  '#10B981', // Verde Esmeralda
  '#F59E0B', // Âmbar
  '#8B5CF6', // Roxo
  '#EC4899', // Rosa
  '#06B6D4', // Ciano
  '#F97316', // Laranja
  '#6366F1', // Índigo
];

export function ProportionDonutChart({
  vehicles,
  activeVehicleId,
  activeValue,
  valueType,
  activeColor,
  theme,
  isDark,
}: ProportionDonutChartProps) {
  // Prepara valores de cada veículo
  const rawItems = vehicles.map((v) => {
    const isSelected = v.id === activeVehicleId;
    const rawVal = isSelected
      ? activeValue
      : (valueType === 'cost' || valueType === 'costPerKm')
      ? Number(v.custoMedioPorKm || 0)
      : Number(v.gastoManutencao || 0);

    const value = Math.max(0, Number(rawVal || 0));
    return {
      id: v.id,
      name: v.name || v.model || 'Veículo',
      plate: v.plate || '',
      value,
      isSelected,
    };
  });

  const total = rawItems.reduce((acc, curr) => acc + curr.value, 0);

  // Atribui cores distintas garantindo que o ativo receba activeColor
  let colorIndex = 1;
  const items = rawItems.map((item) => {
    let color = activeColor;
    if (!item.isSelected) {
      color = PALETTE_COLORS[colorIndex % PALETTE_COLORS.length];
      if (color === activeColor) {
        colorIndex++;
        color = PALETTE_COLORS[colorIndex % PALETTE_COLORS.length];
      }
      colorIndex++;
    }

    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    return {
      ...item,
      percentage,
      color,
    };
  });

  const activeSlice = items.find((i) => i.isSelected);
  const activePercentage = activeSlice?.percentage || (items.length === 1 && (activeSlice?.value || 0) > 0 ? 100 : 0);

  // Parâmetros do SVG Donut
  const size = 110;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  const isCost = valueType === 'cost' || valueType === 'costPerKm';
  const unitSuffix = isCost ? '/km' : '';

  return (
    <View style={styles.donutCardWrapper}>
      <View style={styles.donutRow}>
        {/* GRÁFICO SVG CIRCULAR */}
        <View style={styles.donutSvgWrapper}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* CÍRCULO DE FUNDO (PISTA) */}
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
              strokeWidth={strokeWidth}
              fill="none"
            />

            {/* SE HOUVER APENAS 1 FATIA COM 100% */}
            {activePercentage >= 99.9 && total > 0 ? (
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={activeColor}
                strokeWidth={strokeWidth}
                fill="none"
              />
            ) : total > 0 ? (
              /* MÚLTIPLAS FATIAS COM STROKE-DASHARRAY */
              items
                .filter((item) => item.percentage > 0)
                .map((slice) => {
                  const dashLength = (slice.percentage / 100) * circumference;
                  const offset = -(accumulatedPercent / 100) * circumference;
                  accumulatedPercent += slice.percentage;

                  return (
                    <Circle
                      key={slice.id}
                      cx={center}
                      cy={center}
                      r={radius}
                      stroke={slice.color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                      strokeDashoffset={offset}
                      strokeLinecap={items.length > 1 ? 'round' : 'butt'}
                      fill="none"
                      origin={`${center}, ${center}`}
                      rotation="-90"
                    />
                  );
                })
            ) : null}
          </Svg>

          {/* CONTEÚDO CENTRAL DO DONUT */}
          <View style={styles.donutCenter}>
            <Text
              style={[
                styles.donutCenterPercent,
                { color: activeSlice && activeSlice.value > 0 ? activeColor : theme.textMuted },
              ]}
            >
              {total > 0 ? `${activePercentage.toFixed(0)}%` : '0%'}
            </Text>
            <Text style={[styles.donutCenterSub, { color: theme.textMuted }]}>
              {isCost ? 'do custo' : 'do gasto'}
            </Text>
          </View>
        </View>

        {/* LEGENDA / FATIAS DA FROTA */}
        <View style={styles.legendColumn}>
          <Text style={[styles.legendHeaderTitle, { color: theme.textMuted }]}>
            Divisão na Frota ({items.length} {items.length === 1 ? 'veículo' : 'veículos'}):
          </Text>

          {items.map((slice) => {
            const formattedVal = slice.value > 0 ? `R$ ${slice.value.toFixed(2)}${unitSuffix}` : (isCost ? 'Sem média' : 'R$ 0,00');
            return (
              <View key={slice.id} style={styles.legendItemRow}>
                <View style={[styles.legendColorPill, { backgroundColor: slice.color }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text
                      style={[
                        styles.legendItemName,
                        {
                          color: slice.isSelected ? theme.text : theme.textMuted,
                          fontWeight: slice.isSelected ? '700' : '500',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {slice.name}
                    </Text>
                    {slice.isSelected && (
                      <View style={[styles.miniActiveTag, { backgroundColor: activeColor }]}>
                        <Text style={styles.miniActiveTagText}>Ativo</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                  <Text
                    style={[
                      styles.legendItemPercent,
                      {
                        color: slice.isSelected ? activeColor : theme.text,
                        fontWeight: slice.isSelected ? '700' : '600',
                      },
                    ]}
                  >
                    {total > 0 ? `${slice.percentage.toFixed(0)}%` : '0%'}
                  </Text>
                  <Text style={[styles.legendItemValue, { color: theme.textMuted }]}>
                    {formattedVal}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* MENSAGEM DE RESUMO DA FATIA */}
      <View
        style={[
          styles.donutFooterNote,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          },
        ]}
      >
        <Ionicons name="pie-chart-outline" size={13} color={activeColor} />
        <Text style={[styles.donutFooterText, { color: theme.textMuted }]}>
          {total > 0
            ? items.length > 1
              ? `O veículo selecionado representa ${activePercentage.toFixed(0)}% ${
                  isCost ? 'do custo por km somado' : 'dos gastos em oficina'
                } entre todos os seus veículos.`
              : `100% dos registros pertencem a este veículo cadastrado.`
            : `Sem dados suficientes registrados para calcular a proporção da frota.`}
        </Text>
      </View>
    </View>
  );
}

// =========================================================================
// ESTILOS DOS COMPONENTES DE DASHBOARD
// =========================================================================

const styles = StyleSheet.create({
  chartWrapper: {
    marginTop: 12,
  },
  barChartContainer: {
    position: 'relative',
    justifyContent: 'flex-end',
  },
  gridLinesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    paddingBottom: 28,
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
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: '100%',
    paddingBottom: 28,
    zIndex: 2,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
    maxWidth: 80,
  },
  barValueBox: {
    alignItems: 'center',
    marginBottom: 4,
  },
  barValueText: {
    fontSize: 12,
  },
  barUnitText: {
    fontSize: 9,
    marginTop: -2,
  },
  barTrack: {
    width: 32,
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barLabelContainer: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
    width: 76,
  },
  barVehicleName: {
    fontSize: 11,
    maxWidth: 55,
  },
  barVehiclePlate: {
    fontSize: 9,
    marginTop: 1,
  },
  activePill: {
    backgroundColor: '#10B981',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    marginTop: 1,
  },
  activePillText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
  },
  chartFooterBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  chartFooterText: {
    fontSize: 11,
    lineHeight: 16,
  },

  // Donut Styles
  donutCardWrapper: {
    marginTop: 12,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  donutSvgWrapper: {
    width: 110,
    height: 110,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterPercent: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  donutCenterSub: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: -2,
  },
  legendColumn: {
    flex: 1,
    gap: 6,
  },
  legendHeaderTitle: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  legendItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColorPill: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendItemName: {
    fontSize: 12,
  },
  miniActiveTag: {
    paddingHorizontal: 4,
    paddingVertical: 0.5,
    borderRadius: 4,
  },
  miniActiveTagText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
  },
  legendItemPercent: {
    fontSize: 12,
  },
  legendItemValue: {
    fontSize: 10,
  },
  donutFooterNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
  },
  donutFooterText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
});
