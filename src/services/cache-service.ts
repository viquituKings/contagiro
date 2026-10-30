import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import {
  limitRefuelingsPerVehicleForCache,
  limitMaintenancesPerVehicleForCache,
} from '@/services/storage';
import { SyncService } from '@/services/sync-service';
import { Refueling, MaintenanceItem } from '@/types/vehicle';

export interface CacheBreakdownItem {
  id: string;
  label: string;
  bytes: number;
  formatted: string;
  percent: number;
  color: string;
  icon: string;
}

export interface CacheStats {
  totalBytes: number;
  formattedTotal: string;
  maxBytes: number;
  formattedMax: string;
  usagePercent: number;
  itemsCount: number;
  breakdown: CacheBreakdownItem[];
}

// 50 MB de orçamento de armazenamento em cache local do aplicativo
const MAX_CACHE_BUDGET_BYTES = 50 * 1024 * 1024;

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(dm))} ${sizes[idx]}`;
}

export const CacheService = {
  /**
   * Calcula o espaço em cache e armazenamento local consumido pelo aplicativo.
   */
  async getCacheStats(): Promise<CacheStats> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const pairs = await AsyncStorage.multiGet(allKeys);

      let totalBytes = 0;
      let vehiclesBytes = 0;
      let refuelingsBytes = 0;
      let maintenancesBytes = 0;
      let profileBytes = 0;
      let otherBytes = 0;

      for (const [key, value] of pairs) {
        const keySize = key.length;
        const valSize = value ? value.length : 0;
        const entryBytes = keySize + valSize;
        totalBytes += entryBytes;

        if (
          key.includes('vehicle') ||
          key.includes('veiculo') ||
          key === '@contagiro:avatar_cache_v1'
        ) {
          vehiclesBytes += entryBytes;
        } else if (key.includes('refueling') || key.includes('abastecimento')) {
          refuelingsBytes += entryBytes;
        } else if (key.includes('maintenance') || key.includes('manutencao')) {
          maintenancesBytes += entryBytes;
        } else if (key.includes('user_profile') || key.includes('profile')) {
          profileBytes += entryBytes;
        } else {
          otherBytes += entryBytes;
        }
      }

      const safeTotal = Math.max(totalBytes, 1024);
      const usagePercent = Math.min(
        Math.max(Number(((safeTotal / MAX_CACHE_BUDGET_BYTES) * 100).toFixed(2)), 0.1),
        100
      );

      const calcPercent = (b: number) => {
        if (totalBytes === 0) return 0;
        return Number(((b / totalBytes) * 100).toFixed(1));
      };

      const breakdown: CacheBreakdownItem[] = [
        {
          id: 'vehicles',
          label: 'Veículos, Totalizadores e Avatares',
          bytes: vehiclesBytes,
          formatted: formatBytes(vehiclesBytes),
          percent: calcPercent(vehiclesBytes),
          color: '#10B981', // Emerald
          icon: 'car-sport-outline',
        },
        {
          id: 'refuelings',
          label: 'Últimos 5 Abastecimentos / Veículo',
          bytes: refuelingsBytes,
          formatted: formatBytes(refuelingsBytes),
          percent: calcPercent(refuelingsBytes),
          color: '#3B82F6', // Blue
          icon: 'water-outline',
        },
        {
          id: 'maintenances',
          label: 'Últimas 5 Manutenções / Veículo',
          bytes: maintenancesBytes,
          formatted: formatBytes(maintenancesBytes),
          percent: calcPercent(maintenancesBytes),
          color: '#F59E0B', // Amber
          icon: 'construct-outline',
        },
        {
          id: 'profile',
          label: 'Perfil e Foto Offline',
          bytes: profileBytes,
          formatted: formatBytes(profileBytes),
          percent: calcPercent(profileBytes),
          color: '#8B5CF6', // Purple
          icon: 'person-circle-outline',
        },
        {
          id: 'other',
          label: 'Preferências e Sincronização',
          bytes: otherBytes,
          formatted: formatBytes(otherBytes),
          percent: calcPercent(otherBytes),
          color: '#64748B', // Slate
          icon: 'options-outline',
        },
      ];

      return {
        totalBytes,
        formattedTotal: formatBytes(totalBytes),
        maxBytes: MAX_CACHE_BUDGET_BYTES,
        formattedMax: formatBytes(MAX_CACHE_BUDGET_BYTES),
        usagePercent,
        itemsCount: allKeys.length,
        breakdown,
      };
    } catch (e) {
      console.warn('Erro ao obter estatísticas de cache:', e);
      return {
        totalBytes: 0,
        formattedTotal: '0 B',
        maxBytes: MAX_CACHE_BUDGET_BYTES,
        formattedMax: formatBytes(MAX_CACHE_BUDGET_BYTES),
        usagePercent: 0,
        itemsCount: 0,
        breakdown: [],
      };
    }
  },

  /**
   * Otimiza o cache do aplicativo mantendo todos os dados obrigatórios para operação offline:
   * - Cadastro completo e totalizadores de todos os veículos
   * - Imagens dos avatares de todos os veículos e imagem de perfil
   * - Os 5 últimos abastecimentos de todos os veículos
   * - Os 5 últimos registros de manutenção de todos os veículos
   * - Fila de sincronização offline pendente
   */
  async clearAppCache(): Promise<{ freedBytes: number; formattedFreed: string }> {
    const beforeStats = await this.getCacheStats();

    // 1. Limpa apenas o cache volátil de memória de imagens (mantendo o disco e Base64 para modo offline)
    try {
      await ExpoImage.clearMemoryCache();
    } catch (e) {
      console.warn('Aviso: Falha ao limpar cache de memória do expo-image:', e);
    }

    // 2. Compacta as listas de abastecimentos e manutenções em cache para garantir no máximo 5 por veículo
    try {
      const queue = await SyncService.getQueue();
      const pendingRefIds = new Set(
        queue.filter((q) => q.action === 'ADD_REFUELING').map((q) => q.entityId)
      );
      const pendingMntIds = new Set(
        queue.filter((q) => q.action === 'ADD_MAINTENANCE').map((q) => q.entityId)
      );

      const allKeys = await AsyncStorage.getAllKeys();
      for (const key of allKeys) {
        if (key === '@contagiro:refuelings_v1' || key.startsWith('@contagiro:refuelings_v1_')) {
          const raw = await AsyncStorage.getItem(key);
          if (raw) {
            const parsed: Refueling[] = JSON.parse(raw);
            const trimmed = limitRefuelingsPerVehicleForCache(parsed, pendingRefIds);
            await AsyncStorage.setItem(key, JSON.stringify(trimmed));
          }
        } else if (
          key === '@contagiro:maintenances_v1' ||
          key.startsWith('@contagiro:maintenances_v1_')
        ) {
          const raw = await AsyncStorage.getItem(key);
          if (raw) {
            const parsed: MaintenanceItem[] = JSON.parse(raw);
            const trimmed = limitMaintenancesPerVehicleForCache(parsed, pendingMntIds);
            await AsyncStorage.setItem(key, JSON.stringify(trimmed));
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao otimizar chaves do AsyncStorage:', e);
    }

    const afterStats = await this.getCacheStats();
    const freedBytes = Math.max(beforeStats.totalBytes - afterStats.totalBytes, 0);

    return {
      freedBytes,
      formattedFreed: formatBytes(freedBytes),
    };
  },
};
