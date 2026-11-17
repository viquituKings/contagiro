import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FuelType } from '@/types/vehicle';
import { isElectricVehicle, isHybridVehicle } from '@/utils/vehicle-type';

export interface FuelOptionItem {
  type: FuelType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  desc: string;
}

export const FUEL_OPTIONS_CATALOG: FuelOptionItem[] = [
  {
    type: 'gasolina',
    label: 'Gasolina',
    icon: 'flame-outline',
    color: '#EF4444',
    desc: 'Comum ou aditivada',
  },
  {
    type: 'etanol',
    label: 'Etanol',
    icon: 'leaf-outline',
    color: '#10B981',
    desc: 'Álcool combustível',
  },
  {
    type: 'diesel',
    label: 'Diesel',
    icon: 'funnel-outline',
    color: '#3B82F6',
    desc: 'S10 ou S500',
  },
  {
    type: 'gnv',
    label: 'GNV',
    icon: 'speedometer-outline',
    color: '#8B5CF6',
    desc: 'Gás natural veicular',
  },
  {
    type: 'eletrico',
    label: 'Elétrico',
    icon: 'flash-outline',
    color: '#06B6D4',
    desc: 'Bateria / Tomada / Eletroposto',
  },
];

interface FuelTypeDropdownSelectorProps {
  selectedFuels: FuelType[];
  onChange: (fuels: FuelType[]) => void;
  disabled?: boolean;
}

export const FuelTypeDropdownSelector: React.FC<FuelTypeDropdownSelectorProps> = ({
  selectedFuels,
  onChange,
  disabled = false,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [isExpanded, setIsExpanded] = useState(false);

  const theme = {
    bg: isDark ? '#090D16' : '#F8FAFC',
    card: isDark ? '#141D2E' : '#FFFFFF',
    cardBorder: isDark ? '#1E2D44' : '#E2E8F0',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    accent: '#10B981',
    cyan: '#06B6D4',
    amber: '#F59E0B',
  };

  const isElectric = isElectricVehicle(selectedFuels);
  const isHybrid = isHybridVehicle(selectedFuels);

  const toggleFuel = (type: FuelType) => {
    if (disabled) return;
    let next: FuelType[];
    if (selectedFuels.includes(type)) {
      if (selectedFuels.length === 1) {
        // Mantém pelo menos um combustível selecionado
        return;
      }
      next = selectedFuels.filter((f) => f !== type);
    } else {
      next = [...selectedFuels, type];
    }
    onChange(next);
  };

  const getSummaryText = () => {
    if (selectedFuels.length === 0) return 'Selecione os combustíveis';
    const names = selectedFuels.map((f) => {
      const match = FUEL_OPTIONS_CATALOG.find((opt) => opt.type === f);
      return match ? match.label : f;
    });
    if (isElectric) return '100% Elétrico';
    if (isHybrid) return `Híbrido (${names.join(' + ')})`;
    return names.join(', ');
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textMuted }]}>
        Combustíveis Aceitos pelo Veículo:
      </Text>

      {/* HEADER DO SELETOR SUSPENSO */}
      <TouchableOpacity
        style={[
          styles.headerBox,
          {
            backgroundColor: theme.bg,
            borderColor: isExpanded ? theme.accent : theme.cardBorder,
          },
        ]}
        onPress={() => !disabled && setIsExpanded(!isExpanded)}
        activeOpacity={0.8}
        disabled={disabled}
      >
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.headerIconCircle,
              {
                backgroundColor: isElectric
                  ? 'rgba(6, 182, 212, 0.15)'
                  : isHybrid
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(16, 185, 129, 0.15)',
              },
            ]}
          >
            <Ionicons
              name={isElectric ? 'flash' : isHybrid ? 'battery-charging' : 'color-filter'}
              size={18}
              color={isElectric ? theme.cyan : isHybrid ? theme.amber : theme.accent}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerSummary, { color: theme.text }]} numberOfLines={1}>
              {getSummaryText()}
            </Text>
            <Text style={[styles.headerSubtext, { color: theme.textMuted }]}>
              {selectedFuels.length} {selectedFuels.length === 1 ? 'selecionado' : 'selecionados'} • Toque para {isExpanded ? 'recolher' : 'alterar'}
            </Text>
          </View>
        </View>

        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.textMuted}
        />
      </TouchableOpacity>

      {/* LISTA VERTICAL SUSPENSA (EXPANDIDA) */}
      {isExpanded && (
        <View style={[styles.dropdownList, { backgroundColor: theme.bg, borderColor: theme.cardBorder }]}>
          <Text style={[styles.dropdownHint, { color: theme.textMuted }]}>
            Marque todos os tipos de combustível aceitos pelo veículo:
          </Text>

          {FUEL_OPTIONS_CATALOG.map((item) => {
            const isSelected = selectedFuels.includes(item.type);
            return (
              <TouchableOpacity
                key={item.type}
                style={[
                  styles.optionRow,
                  {
                    borderColor: isSelected ? item.color : theme.cardBorder,
                    backgroundColor: isSelected
                      ? isDark
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(0, 0, 0, 0.02)'
                      : 'transparent',
                  },
                ]}
                onPress={() => toggleFuel(item.type)}
                activeOpacity={0.7}
              >
                <View style={styles.optionLeft}>
                  <View
                    style={[
                      styles.optionIconBox,
                      { backgroundColor: item.color + '22', borderColor: item.color + '44' },
                    ]}
                  >
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <View>
                    <Text style={[styles.optionLabel, { color: theme.text }]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.optionDesc, { color: theme.textMuted }]}>
                      {item.desc}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isSelected ? item.color : theme.cardBorder,
                      backgroundColor: isSelected ? item.color : 'transparent',
                    },
                  ]}
                >
                  {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* BANNER INFORMATIVO DA CLASSIFICAÇÃO */}
      {isElectric && (
        <View style={[styles.powertrainNotice, { backgroundColor: 'rgba(6, 182, 212, 0.12)', borderColor: '#06B6D4' }]}>
          <Ionicons name="flash" size={16} color="#06B6D4" />
          <Text style={[styles.powertrainNoticeText, { color: isDark ? '#A5F3FC' : '#0E7490' }]}>
            <Text style={{ fontWeight: '700' }}>Veículo 100% Elétrico:</Text> O campo de tanque será configurado em{' '}
            <Text style={{ fontWeight: '700' }}>Capacidade da Bateria (kWh)</Text> e o motor em{' '}
            <Text style={{ fontWeight: '700' }}>Consumo Médio (kWh/100km ou km/kWh)</Text>.
          </Text>
        </View>
      )}

      {isHybrid && (
        <View style={[styles.powertrainNotice, { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: '#F59E0B' }]}>
          <Ionicons name="battery-charging" size={16} color="#F59E0B" />
          <Text style={[styles.powertrainNoticeText, { color: isDark ? '#FDE68A' : '#B45309' }]}>
            <Text style={{ fontWeight: '700' }}>Veículo Híbrido:</Text> Combina motor elétrico e a combustão.
            Será tratado com os parâmetros de tanque em litros e motor a combustão normal.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSummary: {
    fontSize: 14,
    fontWeight: '700',
  },
  headerSubtext: {
    fontSize: 11,
    marginTop: 1,
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 8,
    marginTop: 2,
  },
  dropdownHint: {
    fontSize: 11,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  optionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  optionDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  powertrainNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  powertrainNoticeText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
  },
});
