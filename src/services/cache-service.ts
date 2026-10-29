import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';

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
        // Estima o tamanho em bytes UTF-8 (2 bytes médios por char para Base64/Unicode)
        const keySize = key.length;
        const valSize = value ? value.length : 0;
        const entryBytes = keySize + valSize;
        totalBytes += entryBytes;

        if (key.includes('vehicle') || key.includes('veiculo')) {
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

      // Garante uma visualização mínima de medição se estiver vazio
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
          label: 'Veículos e Fotos',
          bytes: vehiclesBytes,
          formatted: formatBytes(vehiclesBytes),
          percent: calcPercent(vehiclesBytes),
          color: '#10B981', // Emerald
          icon: 'car-sport-outline',
        },
        {
          id: 'refuelings',
          label: 'Abastecimentos',
          bytes: refuelingsBytes,
          formatted: formatBytes(refuelingsBytes),
          percent: calcPercent(refuelingsBytes),
          color: '#3B82F6', // Blue
          icon: 'water-outline',
        },
        {
          id: 'maintenances',
          label: 'Histórico de Manutenções',
          bytes: maintenancesBytes,
          formatted: formatBytes(maintenancesBytes),
          percent: calcPercent(maintenancesBytes),
          color: '#F59E0B', // Amber
          icon: 'construct-outline',
        },
        {
          id: 'profile',
          label: 'Perfil e Cache de Imagem',
          bytes: profileBytes,
          formatted: formatBytes(profileBytes),
          percent: calcPercent(profileBytes),
          color: '#8B5CF6', // Purple
          icon: 'person-circle-outline',
        },
        {
          id: 'other',
          label: 'Preferências e Metadados',
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
   * Limpa o cache de imagens em disco e memória, e recicla chaves temporárias do AsyncStorage.
   * Não apaga credenciais nem configurações essenciais do usuário.
   */
  async clearAppCache(): Promise<{ freedBytes: number; formattedFreed: string }> {
    const beforeStats = await this.getCacheStats();

    // 1. Limpa cache do expo-image
    try {
      await ExpoImage.clearMemoryCache();
      await ExpoImage.clearDiskCache();
    } catch (e) {
      console.warn('Aviso: Falha ao limpar cache do expo-image:', e);
    }

    // 2. Limpa dados temporários do AsyncStorage (preservando login, perfil ativo, tema e veículos sincronizados)
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      // Chaves protegidas que não devem ser apagadas
      const protectedKeys = [
        '@contagiro:theme_preference',
        '@contagiro:active_vehicle_id_v1',
      ];

      const keysToRemove = allKeys.filter((key) => {
        if (protectedKeys.includes(key)) return false;
        if (key.startsWith('@contagiro:user_profile_')) return false; // Mantém perfil em cache para exibição instantânea
        // Chaves de cache secundário de consultas podem ser limpas e sincronizadas novamente
        if (key.includes('refuelings_v1_') || key === '@contagiro:fuel_prices_v1') {
          return true;
        }
        return false;
      });

      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
    } catch (e) {
      console.warn('Erro ao limpar chaves temporárias do AsyncStorage:', e);
    }

    const afterStats = await this.getCacheStats();
    const freedBytes = Math.max(beforeStats.totalBytes - afterStats.totalBytes, 0);

    return {
      freedBytes,
      formattedFreed: formatBytes(freedBytes),
    };
  },
};

