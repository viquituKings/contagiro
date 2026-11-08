import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, storage, checkOnlineStatus, withFirestoreTimeout } from '@/services/firebase';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { Image as ExpoImage } from 'expo-image';
import {
  Vehicle,
  Refueling,
  MaintenanceItem,
  MaintenanceCategory,
  FuelType,
  VehicleType,
  FuelPrices,
} from '@/types/vehicle';
import { SyncService } from '@/services/sync-service';
import { ensureOfflineCachedImage, saveAvatarToLocalCache } from '@/services/image-picker';
import { compareDatesDesc } from '@/utils/date';
import { parseEngineDisplacement } from '@/utils/engine';

export const MAX_CACHED_REFUELINGS_PER_VEHICLE = 5;
export const MAX_CACHED_MAINTENANCES_PER_VEHICLE = 5;

const STORAGE_KEYS = {
  VEHICLES: '@contagiro:vehicles_v1',
  VEHICLE_TOTALIZERS: '@contagiro:vehicle_totalizers_v1',
  VEHICLE_AVATARS: '@contagiro:avatar_cache_v1',
  ACTIVE_VEHICLE: '@contagiro:active_vehicle_id_v1',
  PREFERRED_VEHICLE: '@contagiro:preferred_vehicle_id_v1',
  REFUELINGS: '@contagiro:refuelings_v1',
  MAINTENANCES: '@contagiro:maintenances_v1',
  HAS_SEEDED: '@contagiro:has_seeded_v1',
  FUEL_PRICES: '@contagiro:fuel_prices_v1',
};

export interface VehicleTotalizersCache {
  totalGastoAbast: number;
  totalLitrosAbast: number;
  mediaGeralKmPorLitro: number;
  custoMedioPorKm: number;
  qtdAbastecimentos: number;
  gastoManutencao: number;
  qtdManutencoes: number;
  updatedAt: string;
}

function sortRefuelingsDesc(list: Refueling[]): Refueling[] {
  return [...list].sort((a, b) => {
    const cmp = compareDatesDesc(a, b);
    if (cmp !== 0) return cmp;
    return Number(b.odometer || 0) - Number(a.odometer || 0);
  });
}

function sortMaintenancesDesc(list: MaintenanceItem[]): MaintenanceItem[] {
  return [...list].sort((a, b) => {
    const cmp = compareDatesDesc(a, b);
    if (cmp !== 0) return cmp;
    return Number(b.odometer || 0) - Number(a.odometer || 0);
  });
}

/**
 * Gera uma assinatura de conteúdo única para um abastecimento,
 * permitindo identificar registros idênticos independentemente do ID atribuído pelo Firestore ou local.
 */
export function getRefuelingFingerprint(r: {
  vehicleId?: string;
  date: string;
  odometer: number;
  liters?: number;
  totalAmount?: number;
}): string {
  const vId = (r.vehicleId || '').trim();
  const date = (r.date || '').trim().split('T')[0];
  const km = Math.round(Number(r.odometer || 0));
  const liters = Number(r.liters || 0).toFixed(2);
  const total = Number(r.totalAmount || 0).toFixed(2);
  return `${vId}_${date}_${km}_${liters}_${total}`;
}

/**
 * Deduplica uma lista de abastecimentos baseando-se no fingerprint de conteúdo.
 * Retorna os itens únicos e a lista de IDs duplicados (para eventual remoção no Firestore/local).
 */
export function deduplicateRefuelings(list: Refueling[]): {
  unique: Refueling[];
  duplicateIds: string[];
} {
  const seen = new Map<string, Refueling>();
  const unique: Refueling[] = [];
  const duplicateIds: string[] = [];

  for (const item of list) {
    const fp = getRefuelingFingerprint(item);
    if (!seen.has(fp)) {
      seen.set(fp, item);
      unique.push(item);
    } else {
      const existing = seen.get(fp)!;
      // Se um item possui ID definitivo do Firestore e o outro ID temporário (ref-),
      // mantém o do Firestore no conjunto 'unique'.
      if (existing.id.startsWith('ref-') && !item.id.startsWith('ref-')) {
        const idx = unique.indexOf(existing);
        if (idx >= 0) {
          duplicateIds.push(existing.id);
          unique[idx] = item;
          seen.set(fp, item);
        } else {
          duplicateIds.push(item.id);
        }
      } else {
        duplicateIds.push(item.id);
      }
    }
  }

  return { unique, duplicateIds };
}

/**
 * Gera uma assinatura de conteúdo única para uma manutenção.
 */
export function getMaintenanceFingerprint(m: {
  vehicleId?: string;
  date: string;
  odometer: number;
  category?: string;
  cost?: number;
}): string {
  const vId = (m.vehicleId || '').trim();
  const date = (m.date || '').trim().split('T')[0];
  const km = Math.round(Number(m.odometer || 0));
  const cat = (m.category || '').toLowerCase().trim();
  const cost = Number(m.cost || 0).toFixed(2);
  return `${vId}_${date}_${km}_${cat}_${cost}`;
}

/**
 * Deduplica uma lista de manutenções baseando-se no fingerprint de conteúdo.
 */
export function deduplicateMaintenances(list: MaintenanceItem[]): {
  unique: MaintenanceItem[];
  duplicateIds: string[];
} {
  const seen = new Map<string, MaintenanceItem>();
  const unique: MaintenanceItem[] = [];
  const duplicateIds: string[] = [];

  for (const item of list) {
    const fp = getMaintenanceFingerprint(item);
    if (!seen.has(fp)) {
      seen.set(fp, item);
      unique.push(item);
    } else {
      const existing = seen.get(fp)!;
      // Garante a preservação de comprovantes anexados e observações
      const mergedItem: MaintenanceItem = {
        ...(existing.id.startsWith('mnt-') && !item.id.startsWith('mnt-') ? item : existing),
        receiptUrl: item.receiptUrl || existing.receiptUrl,
        notes: item.notes || existing.notes,
        workshop: item.workshop || existing.workshop,
        side: item.side || existing.side,
        sideLabel: item.sideLabel || existing.sideLabel,
      };

      if (existing.id.startsWith('mnt-') && !item.id.startsWith('mnt-')) {
        const idx = unique.indexOf(existing);
        if (idx >= 0) {
          duplicateIds.push(existing.id);
          unique[idx] = mergedItem;
          seen.set(fp, mergedItem);
        } else {
          duplicateIds.push(item.id);
        }
      } else {
        const idx = unique.indexOf(existing);
        if (idx >= 0) {
          unique[idx] = mergedItem;
          seen.set(fp, mergedItem);
        }
        duplicateIds.push(item.id);
      }
    }
  }

  return { unique, duplicateIds };
}

/**
 * Filtra e mantém no cache do aparelho os 5 últimos abastecimentos de cada veículo
 * (preservando também eventuais itens pendentes de sincronização offline e deduplicando registros).
 */
export function limitRefuelingsPerVehicleForCache(
  list: Refueling[],
  pendingIds?: Set<string>
): Refueling[] {
  const { unique } = deduplicateRefuelings(list);
  const byVehicle = new Map<string, Refueling[]>();
  for (const item of unique) {
    const vId = item.vehicleId || 'unknown';
    if (!byVehicle.has(vId)) {
      byVehicle.set(vId, []);
    }
    byVehicle.get(vId)!.push(item);
  }

  const result: Refueling[] = [];
  for (const [, vItems] of byVehicle.entries()) {
    const sorted = sortRefuelingsDesc(vItems);
    const topFive = sorted.slice(0, MAX_CACHED_REFUELINGS_PER_VEHICLE);
    if (pendingIds && pendingIds.size > 0) {
      for (const item of sorted.slice(MAX_CACHED_REFUELINGS_PER_VEHICLE)) {
        if (pendingIds.has(item.id) && !topFive.some((r) => r.id === item.id)) {
          topFive.push(item);
        }
      }
    }
    result.push(...topFive);
  }

  return sortRefuelingsDesc(result);
}

/**
 * Filtra e mantém no cache do aparelho os 5 últimos registros de manutenção de cada veículo
 * (preservando também eventuais itens pendentes de sincronização offline e deduplicando registros).
 */
export function limitMaintenancesPerVehicleForCache(
  list: MaintenanceItem[],
  pendingIds?: Set<string>
): MaintenanceItem[] {
  const { unique } = deduplicateMaintenances(list);
  const byVehicle = new Map<string, MaintenanceItem[]>();
  for (const item of unique) {
    const vId = item.vehicleId || 'unknown';
    if (!byVehicle.has(vId)) {
      byVehicle.set(vId, []);
    }
    byVehicle.get(vId)!.push(item);
  }

  const result: MaintenanceItem[] = [];
  for (const [, vItems] of byVehicle.entries()) {
    const sorted = sortMaintenancesDesc(vItems);
    const topFive = sorted.slice(0, MAX_CACHED_MAINTENANCES_PER_VEHICLE);
    if (pendingIds && pendingIds.size > 0) {
      for (const item of sorted.slice(MAX_CACHED_MAINTENANCES_PER_VEHICLE)) {
        if (pendingIds.has(item.id) && !topFive.some((m) => m.id === item.id)) {
          topFive.push(item);
        }
      }
    }
    result.push(...topFive);
  }

  return sortMaintenancesDesc(result);
}

export function mapFirestoreDocToVehicle(id: string, data: Record<string, unknown>): Vehicle {
  const brand = (data.marca as string) || '';
  const modelName = (data.modelo as string) || '';
  const fullName =
    brand && modelName && !modelName.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} ${modelName}`
      : modelName || brand || 'Veículo';

  const fuelMap: Record<string, FuelType> = {
    gasolina: 'gasolina',
    etanol: 'etanol',
    diesel: 'diesel',
    gnv: 'gnv',
  };
  const rawFuel = String(data.ultimoComb || 'gasolina').toLowerCase();
  const fuelType: FuelType = fuelMap[rawFuel] || 'gasolina';

  const isMoto = data.tipoVeiculo === 'moto';
  const tankCapacity =
    Number(data.capacidadeTanque ?? data.tanque ?? data.tankCapacity) || (isMoto ? 14 : 50);

  let acceptedFuelTypes: FuelType[] | undefined;
  if (Array.isArray(data.combustiveisAceitos)) {
    acceptedFuelTypes = data.combustiveisAceitos
      .map((f) => fuelMap[String(f).toLowerCase()])
      .filter(Boolean) as FuelType[];
  } else if (Array.isArray(data.acceptedFuelTypes)) {
    acceptedFuelTypes = data.acceptedFuelTypes
      .map((f) => fuelMap[String(f).toLowerCase()])
      .filter(Boolean) as FuelType[];
  } else {
    acceptedFuelTypes = fuelType === 'diesel' ? ['diesel'] : ['gasolina', 'etanol'];
  }

  return {
    id,
    name: modelName || fullName,
    model: fullName,
    brand,
    plate: (data.placa as string) || 'SEM-PLACA',
    year: Number(data.ano) || new Date().getFullYear(),
    tankCapacity,
    currentOdometer: Number(data.kmAtual ?? data.ultimoKm ?? 0),
    fuelType,
    acceptedFuelTypes,
    photoUrl: (data.photoUrl as string) || (data.fotoUrl as string) || undefined,
    flexEfficiencyRatio: Number(data.flexEfficiencyRatio) || 0.70,
    vehicleType: (data.tipoVeiculo === 'moto' ? 'moto' : 'carro') as VehicleType,
    engineDisplacement: parseEngineDisplacement(data.cilindrada),
    cadManPeriodica: Boolean(data.cadManPeriodica),
    revisaoKm: data.revisaoKm != null ? Number(data.revisaoKm) : undefined,
    revisaoMes: data.revisaoMes != null ? Number(data.revisaoMes) : undefined,
    trocaOleoKm: data.trocaOleoKm != null ? Number(data.trocaOleoKm) : undefined,
    trocaOleoMeses: data.trocaOleoMeses != null ? Number(data.trocaOleoMeses) : undefined,
    ultimaRevisaoKm: data.ultimaRevisaoKm != null ? Number(data.ultimaRevisaoKm) : undefined,
    ultimaTrocaOleoKm: data.ultimaTrocaOleoKm != null ? Number(data.ultimaTrocaOleoKm) : undefined,
    proxRevKm: data.proxRevKm != null ? Number(data.proxRevKm) : undefined,
    proxTrocaOleoKm: data.proxTrocaOleoKm != null ? Number(data.proxTrocaOleoKm) : undefined,
    gastoManutencao: data.gastoManutencao != null ? Number(data.gastoManutencao) : undefined,
    manFreioDiant: data.manFreioDiant != null ? Number(data.manFreioDiant) : undefined,
    manFreioTras: data.manFreioTras != null ? Number(data.manFreioTras) : undefined,
    lubrificarCorrenteKm:
      data.lubrificarCorrenteKm != null ? Number(data.lubrificarCorrenteKm) : undefined,
    ultimaLubCorrenteKm:
      data.ultimaLubCorrenteKm != null ? Number(data.ultimaLubCorrenteKm) : undefined,
    proxLubCorrenteKm: data.proxLubCorrenteKm != null ? Number(data.proxLubCorrenteKm) : undefined,
    esticarCorrenteKm: data.esticarCorrenteKm != null ? Number(data.esticarCorrenteKm) : undefined,
    ultimaEsticarCorrenteKm:
      data.ultimaEsticarCorrenteKm != null ? Number(data.ultimaEsticarCorrenteKm) : undefined,
    proxEsticarCorrenteKm:
      data.proxEsticarCorrenteKm != null ? Number(data.proxEsticarCorrenteKm) : undefined,
    totalGastoAbast: data.totalGastoAbast != null ? Number(data.totalGastoAbast) : undefined,
    totalLitrosAbast: data.totalLitrosAbast != null ? Number(data.totalLitrosAbast) : undefined,
    mediaGeralKmPorLitro:
      data.mediaGeralKmPorLitro != null ? Number(data.mediaGeralKmPorLitro) : undefined,
    custoMedioPorKm:
      data.custoMedioPorKm != null
        ? Number(data.custoMedioPorKm)
        : data.costPerKm != null
        ? Number(data.costPerKm)
        : undefined,
    qtdAbastecimentos: data.qtdAbastecimentos != null ? Number(data.qtdAbastecimentos) : undefined,
    qtdManutencoes: data.qtdManutencoes != null ? Number(data.qtdManutencoes) : undefined,
    order:
      data.ordem != null
        ? Number(data.ordem)
        : data.order != null
        ? Number(data.order)
        : undefined,
    isPreferred: Boolean(data.preferido ?? data.isPreferred),
    createdAt: (data.dataCadastro as string) || (data.createdAt as string) || undefined,
    transferredAt: (data.dataTransferencia as string) || (data.transferredAt as string) || undefined,
    transferredFrom: (data.transferidoDe as string) || (data.transferredFrom as string) || undefined,
    ownerEmail: (data.ownerEmail as string) || (data.proprietarioEmail as string) || undefined,
    isShared: Boolean(data.isShared || data.compartilhado),
    sharedWith: Array.isArray(data.sharedWith)
      ? data.sharedWith.map(String)
      : Array.isArray(data.compartilhadoCom)
      ? data.compartilhadoCom.map(String)
      : undefined,
    sharedAt: (data.sharedAt as string) || (data.compartilhadoEm as string) || undefined,
  };
}

export function mapFirestoreDocToRefueling(id: string, data: Record<string, unknown>): Refueling {
  const fuelMap: Record<string, FuelType> = {
    gasolina: 'gasolina',
    etanol: 'etanol',
    diesel: 'diesel',
    gnv: 'gnv',
  };
  const rawFuel = String(data.combustivel || data.fuelType || 'gasolina').toLowerCase();
  const fuelType: FuelType = fuelMap[rawFuel] || 'gasolina';

  const liters = Number(data.qdtAbastecida ?? data.liters ?? 0);
  const pricePerLiter = Number(data.valorLitro ?? data.pricePerLiter ?? 0);
  const totalAmount = data.totalAmount != null ? Number(data.totalAmount) : liters * pricePerLiter;
  const odometer = Number(data.kmAtual ?? data.odometer ?? 0);
  const kmAntigo = data.kmAntigo != null ? Number(data.kmAntigo) : undefined;

  const distanceTraveled =
    kmAntigo != null && odometer >= kmAntigo
      ? odometer - kmAntigo
      : data.distanceTraveled
      ? Number(data.distanceTraveled)
      : undefined;

  const consumptionKmPerLiter =
    data.media != null && Number(data.media) > 0
      ? Number(Number(data.media).toFixed(2))
      : data.consumptionKmPerLiter
      ? Number(data.consumptionKmPerLiter)
      : undefined;

  const costPerKm =
    distanceTraveled && distanceTraveled > 0 && totalAmount > 0
      ? Number((totalAmount / distanceTraveled).toFixed(2))
      : data.costPerKm
      ? Number(data.costPerKm)
      : undefined;

  return {
    id,
    vehicleId: String(data.idVeiculo ?? data.vehicleId ?? ''),
    plate: (data.placa as string) || undefined,
    date: String(data.data ?? data.date ?? new Date().toISOString().split('T')[0]),
    odometer,
    fuelType,
    pricePerLiter,
    totalAmount,
    liters,
    isFullTank: data.seTanqueCheio != null ? Boolean(data.seTanqueCheio) : Boolean(data.isFullTank),
    isAdditivated: Boolean(data.seAditivado),
    gasStation: (data.observacao as string) || (data.gasStation as string) || undefined,
    notes: (data.observacao as string) || (data.notes as string) || undefined,
    previousOdometer: kmAntigo,
    distanceTraveled,
    consumptionKmPerLiter,
    costPerKm,
    registeredBy: (data.registradoPor as string) || (data.registeredBy as string) || undefined,
  };
}

export function mapFirestoreDocToMaintenance(
  id: string,
  data: Record<string, unknown>
): MaintenanceItem {
  const catMap: Record<string, MaintenanceCategory> = {
    TROLEO: 'oleo_filtro',
    REVISAO: 'revisao_geral',
    PNEUS: 'troca_pneus',
    troca_pneus: 'troca_pneus',
    MANFREIO: 'freios',
    freios: 'freios',
    MANMOTOR: 'suspensao',
    LATARIA: 'outros',
    alinhamento_balanceamento: 'alinhamento_balanceamento',
    rodizio_pneus: 'rodizio_pneus',
    esticar_corrente: 'esticar_corrente',
    lubrificar_corrente: 'lubrificar_corrente',
    ar_condicionado: 'ar_condicionado',
    bateria: 'bateria',
    documentacao: 'documentacao',
    outros: 'outros',
  };

  const rawCat = String(data.tipoManutencaoVal || data.category || 'outros');
  const category: MaintenanceCategory =
    catMap[rawCat] || (rawCat as MaintenanceCategory) || 'outros';
  const rawSide = String(data.ladoManutencao || data.side || '');

  return {
    id,
    vehicleId: String(data.veiculoId || data.vehicleId || ''),
    date: String(data.dataCadastro || data.date || new Date().toISOString().split('T')[0]),
    odometer: Number(data.kmManutencao ?? data.odometer ?? 0),
    category,
    title: String(data.tipoManutencao || data.title || 'Manutenção'),
    description: (data.descricaoManutencao as string) || (data.description as string) || undefined,
    workshop: (data.descricaoManutencao as string) || (data.workshop as string) || undefined,
    cost: Number(data.valorManutencao ?? data.cost ?? 0),
    nextDueOdometer: data.nextDueOdometer ? Number(data.nextDueOdometer) : undefined,
    nextDueDate: data.nextDueDate ? String(data.nextDueDate) : undefined,
    isCompleted: true,
    side: rawSide || undefined,
    notes: (data.observacoes as string) || (data.notes as string) || undefined,
    receiptUrl: (data.receiptUrl as string) || (data.notaFiscalUrl as string) || (data.fotoComprovante as string) || undefined,
    registeredBy: (data.registradoPor as string) || (data.registeredBy as string) || undefined,
  };
}

export function sortVehiclesByOrder(vehicles: Vehicle[], preferredId?: string | null): Vehicle[] {
  return [...vehicles].sort((a, b) => {
    const aPref = a.isPreferred || (preferredId ? a.id === preferredId : false);
    const bPref = b.isPreferred || (preferredId ? b.id === preferredId : false);
    if (aPref && !bPref) return -1;
    if (!aPref && bPref) return 1;

    const aOrder = a.order != null ? a.order : 999;
    const bOrder = b.order != null ? b.order : 999;
    if (aOrder !== bOrder) return aOrder - bOrder;

    return 0;
  });
}

let hasCheckedLegacyMedias = false;
let isPreloading = false;
let hasPreloadedOfflineData = false;
const maintenanceChangeListeners = new Set<() => void>();

export function getCurrentUserAttribution(): string {
  const user = auth.currentUser;
  if (!user) return 'Usuário';
  if (user.displayName && user.email) {
    return `${user.displayName} (${user.email})`;
  }
  return user.displayName || user.email || 'Usuário';
}

async function saveVehicleTotalizersToCacheMap(
  vehicleId: string,
  stats: VehicleTotalizersCache
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLE_TOTALIZERS);
    const map: Record<string, VehicleTotalizersCache> = raw ? JSON.parse(raw) : {};
    map[vehicleId] = stats;
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLE_TOTALIZERS, JSON.stringify(map));
  } catch (e) {
    console.warn('Aviso: falha ao salvar mapa de totalizadores em cache:', e);
  }
}

async function getVehicleTotalizersFromCacheMap(): Promise<Record<string, VehicleTotalizersCache>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLE_TOTALIZERS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Identifica se um veículo pertence à massa de dados de teste/demonstração antiga (Onix Plus Turbo / Mobi Drive)
 */
export function isDemoVehicle(v?: { id?: string; name?: string; model?: string } | null): boolean {
  if (!v) return false;
  const id = v.id || '';
  const name = (v.name || '').toLowerCase().trim();
  const model = (v.model || '').toLowerCase().trim();
  if (id === 'veh-1' || id === 'veh-2') return true;
  if (name.includes('onix plus turbo') || name.includes('mobi drive')) return true;
  if (model.includes('onix plus turbo') || model.includes('mobi drive')) return true;
  return false;
}

/**
 * Identifica se um lançamento pertence aos dados de demonstração antigos
 */
export function isDemoRecord(r?: { id?: string; vehicleId?: string } | null): boolean {
  if (!r) return false;
  const id = r.id || '';
  const vId = r.vehicleId || '';
  if (vId === 'veh-1' || vId === 'veh-2') return true;
  if (id === 'ref-1' || id === 'ref-2' || id === 'mnt-1' || id === 'mnt-2' || id === 'mnt-3') return true;
  return false;
}

/**
 * Identifica se um veículo é um resíduo/fantasma sem dados de identificação válidos
 * (ex: quando um documento no Firestore foi parcialmente recriado após exclusão ou transferência)
 */
export function isPhantomVehicle(
  v?: { plate?: string; brand?: string; model?: string; name?: string } | null
): boolean {
  if (!v) return true;
  const plate = (v.plate || '').toUpperCase().trim();
  const brand = (v.brand || '').trim();
  const model = (v.model || '').toLowerCase().trim();
  const name = (v.name || '').toLowerCase().trim();
  if (
    (!plate || plate === 'SEM-PLACA') &&
    !brand &&
    (!model || model === 'veículo' || model === 'veiculo') &&
    (!name || name === 'veículo' || name === 'veiculo')
  ) {
    return true;
  }
  return false;
}

export const StorageService = {
  /**
   * Verifica rapidamente se há conectividade com a nuvem
   */
  async checkOnlineStatus(force = false): Promise<boolean> {
    return checkOnlineStatus(force);
  },

  /**
   * Registra um listener para notificações de alterações em manutenções ou dados do veículo
   */
  onMaintenanceChange(listener: () => void): () => void {
    maintenanceChangeListeners.add(listener);
    return () => {
      maintenanceChangeListeners.delete(listener);
    };
  },

  notifyMaintenanceChange(): void {
    for (const listener of maintenanceChangeListeners) {
      try {
        listener();
      } catch (err) {
        console.warn('Erro em maintenanceChangeListener:', err);
      }
    }
  },

  /**
   * Leitores rápidos de cache local (sem requisições de rede)
   */
  async getCachedVehicles(): Promise<Vehicle[]> {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
      const preferredId = await AsyncStorage.getItem(STORAGE_KEYS.PREFERRED_VEHICLE);
      const list: Vehicle[] = json ? JSON.parse(json) : [];
      const sanitized = list.filter((v) => !isDemoVehicle(v) && !isPhantomVehicle(v));
      if (sanitized.length !== list.length) {
        AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(sanitized)).catch(() => {});
      }
      return sortVehiclesByOrder(sanitized, preferredId);
    } catch {
      return [];
    }
  },

  async getCachedRefuelings(vehicleId?: string): Promise<Refueling[]> {
    try {
      if (vehicleId) {
        if (vehicleId === 'veh-1' || vehicleId === 'veh-2') return [];
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.REFUELINGS + '_' + vehicleId);
        if (cached) {
          const parsed: Refueling[] = JSON.parse(cached);
          return sortRefuelingsDesc(parsed.filter((r) => !isDemoRecord(r)));
        }
      }
      const json = await AsyncStorage.getItem(STORAGE_KEYS.REFUELINGS);
      const all: Refueling[] = json ? JSON.parse(json) : [];
      const filtered = all.filter((r) => !isDemoRecord(r));
      if (vehicleId) {
        return sortRefuelingsDesc(filtered.filter((r) => r.vehicleId === vehicleId));
      }
      return sortRefuelingsDesc(filtered);
    } catch {
      return [];
    }
  },

  async getCachedMaintenances(vehicleId?: string): Promise<MaintenanceItem[]> {
    try {
      if (vehicleId) {
        if (vehicleId === 'veh-1' || vehicleId === 'veh-2') return [];
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.MAINTENANCES + '_' + vehicleId);
        if (cached) {
          const parsed: MaintenanceItem[] = JSON.parse(cached);
          return sortMaintenancesDesc(parsed.filter((m) => !isDemoRecord(m)));
        }
      }
      const json = await AsyncStorage.getItem(STORAGE_KEYS.MAINTENANCES);
      const all: MaintenanceItem[] = json ? JSON.parse(json) : [];
      const filtered = all.filter((m) => !isDemoRecord(m));
      if (vehicleId) {
        return sortMaintenancesDesc(filtered.filter((m) => m.vehicleId === vehicleId));
      }
      return sortMaintenancesDesc(filtered);
    } catch {
      return [];
    }
  },

  // Inicialização e sanitização de vestígios antigos
  async init(): Promise<void> {
    try {
      // 1. Sanitização proativa: limpa completamente qualquer vestígio de veículos de teste (veh-1, veh-2)
      try {
        const rawVehicles = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
        if (rawVehicles) {
          const list: Vehicle[] = JSON.parse(rawVehicles);
          const sanitized = list.filter((v) => !isDemoVehicle(v));
          if (sanitized.length !== list.length) {
            await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(sanitized));
          }
        }

        const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_VEHICLE);
        if (activeId === 'veh-1' || activeId === 'veh-2') {
          await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_VEHICLE);
        }

        const prefId = await AsyncStorage.getItem(STORAGE_KEYS.PREFERRED_VEHICLE);
        if (prefId === 'veh-1' || prefId === 'veh-2') {
          await AsyncStorage.removeItem(STORAGE_KEYS.PREFERRED_VEHICLE);
        }

        const allKeys = await AsyncStorage.getAllKeys();
        const demoKeys = allKeys.filter(
          (k) =>
            k.includes('veh-1') ||
            k.includes('veh-2') ||
            k === '@contagiro:refuelings_v1_veh-1' ||
            k === '@contagiro:refuelings_v1_veh-2' ||
            k === '@contagiro:maintenances_v1_veh-1' ||
            k === '@contagiro:maintenances_v1_veh-2'
        );
        if (demoKeys.length > 0) {
          await AsyncStorage.multiRemove(demoKeys);
        }

        // Garante que a flag de seeded fique marcada sem criar nada fictício
        await AsyncStorage.setItem(STORAGE_KEYS.HAS_SEEDED, 'true');
      } catch (cleanErr) {
        console.warn('Aviso: falha na sanitização de dados demo em init:', cleanErr);
      }

      // 2. Se há usuário conectado, pré-carrega os dados do Firestore
      if (auth.currentUser?.email) {
        if (!hasPreloadedOfflineData && !isPreloading) {
          this.preloadOfflineData().catch((err) => {
            console.warn('Aviso: Erro em preloadOfflineData durante init:', err);
          });
        }
      }
    } catch (e) {
      console.error('Erro ao inicializar StorageService:', e);
    }
  },

  // VEÍCULOS (TODAS AS INFORMAÇÕES DE CADASTRO, AVATARES E TOTALIZADORES EM CACHE)
  async getVehicles(): Promise<Vehicle[]> {
    const userEmail = auth.currentUser?.email;
    if (userEmail) {
      try {
        const querySnapshot = await withFirestoreTimeout(
          () => getDocs(collection(db, 'users', userEmail, 'veiculos')),
          1500
        );
        let list: Vehicle[] = [];
        if (!querySnapshot.empty) {
          for (const d of querySnapshot.docs) {
            const docData = d.data() as Record<string, unknown>;
            const hasVehicleIdentity = Boolean(
              docData.placa ||
              docData.modelo ||
              docData.marca ||
              docData.nome ||
              docData.name ||
              docData.model
            );
            const veh = mapFirestoreDocToVehicle(d.id, docData);
            if (isDemoVehicle(veh) || !hasVehicleIdentity || isPhantomVehicle(veh)) {
              withFirestoreTimeout(
                () => deleteDoc(doc(db, 'users', userEmail, 'veiculos', d.id)),
                1500
              ).catch(() => {});
              saveAvatarToLocalCache(`vehicle_${d.id}`, null).catch(() => {});
            } else {
              list.push(veh);
            }
          }
        }

        // Sincroniza e descobre veículos compartilhados recebidos de outros usuários
        try {
          const sharedPointersSnap = await withFirestoreTimeout(
            () => getDocs(collection(db, 'users', userEmail, 'veiculos_compartilhados')),
            1500
          ).catch(() => null);

          if (sharedPointersSnap && !sharedPointersSnap.empty) {
            const userKey = userEmail.toLowerCase().trim();
            for (const spDoc of sharedPointersSnap.docs) {
              const spData = spDoc.data();
              const vId = spDoc.id;
              const owner = String(spData.ownerEmail || '').toLowerCase().trim();
              if (!owner || owner === userKey) continue;

              try {
                const ownerVehSnap = await withFirestoreTimeout(
                  () => getDoc(doc(db, 'users', owner, 'veiculos', vId)),
                  1500
                );
                if (ownerVehSnap.exists()) {
                  const ovData = ownerVehSnap.data();
                  const sharedWithList: string[] = Array.isArray(ovData.sharedWith)
                    ? ovData.sharedWith.map((e: unknown) => String(e).toLowerCase().trim())
                    : [];

                  if (sharedWithList.includes(userKey)) {
                    const mappedShared = mapFirestoreDocToVehicle(vId, ovData);
                    mappedShared.isShared = true;
                    mappedShared.ownerEmail = owner;
                    mappedShared.sharedWith = sharedWithList;

                    const existingIdx = list.findIndex((v) => v.id === vId);
                    if (existingIdx >= 0) {
                      list[existingIdx] = {
                        ...list[existingIdx],
                        ...mappedShared,
                        isShared: true,
                        ownerEmail: owner,
                      };
                    } else {
                      list.push(mappedShared);
                    }
                  } else {
                    withFirestoreTimeout(() => deleteDoc(spDoc.ref), 1000).catch(() => {});
                    withFirestoreTimeout(
                      () => deleteDoc(doc(db, 'users', userEmail, 'veiculos', vId)),
                      1000
                    ).catch(() => {});
                    list = list.filter((v) => v.id !== vId);
                  }
                } else {
                  withFirestoreTimeout(() => deleteDoc(spDoc.ref), 1000).catch(() => {});
                  withFirestoreTimeout(
                    () => deleteDoc(doc(db, 'users', userEmail, 'veiculos', vId)),
                    1000
                  ).catch(() => {});
                  list = list.filter((v) => v.id !== vId);
                }
              } catch {}
            }
          }
        } catch {}

        const cachedList = await this.getCachedVehicles();
        const totalizersMap = await getVehicleTotalizersFromCacheMap();
        const queue = await SyncService.getQueue();
        const userKey = userEmail.toLowerCase().trim();

        const pendingVehicleSaves = new Map<string, Vehicle>();
        const pendingPeriodicConfigs = new Map<string, Record<string, unknown>>();
        const vehiclesWithPendingRefuelings = new Set<string>();
        const vehiclesWithPendingMaintenances = new Set<string>();

        for (const q of queue) {
          if (q.userEmail !== userKey) continue;
          if (q.action === 'SAVE_VEHICLE') {
            const pVeh = q.payload as Vehicle;
            if (!isDemoVehicle(pVeh)) {
              pendingVehicleSaves.set(q.entityId, pVeh);
            }
          } else if (q.action === 'SAVE_PERIODIC_CONFIG') {
            const p = q.payload as { vehicleId?: string; config?: Record<string, unknown> };
            const vId = p.vehicleId || q.entityId;
            if (vId && p.config) {
              pendingPeriodicConfigs.set(vId, p.config);
            }
          } else if (q.action === 'ADD_REFUELING') {
            const r = q.payload as Refueling;
            if (r?.vehicleId && !isDemoRecord(r)) vehiclesWithPendingRefuelings.add(r.vehicleId);
          } else if (q.action === 'ADD_MAINTENANCE') {
            const m = q.payload as MaintenanceItem;
            if (m?.vehicleId && !isDemoRecord(m)) vehiclesWithPendingMaintenances.add(m.vehicleId);
          }
        }

        // GARANTIA DE NÃO-SOBREPOSIÇÃO OFFLINE:
        // Nenhum dado do Firestore pode sobrescrever o que foi inserido no app quando sem rede.
        for (const [vId, pv] of pendingVehicleSaves.entries()) {
          if (isDemoVehicle(pv)) continue;
          const idx = list.findIndex((v) => v.id === vId);
          if (idx >= 0) {
            const fsVeh = list[idx];
            list[idx] = {
              ...fsVeh,
              ...pv,
              currentOdometer: Math.max(fsVeh.currentOdometer || 0, pv.currentOdometer || 0),
              createdAt: pv.createdAt || fsVeh.createdAt,
              transferredAt: pv.transferredAt || fsVeh.transferredAt,
              transferredFrom: pv.transferredFrom || fsVeh.transferredFrom,
            };
          } else {
            list.push(pv);
          }
        }

        // Também preserva veículos criados offline (veh-...) que estejam no cache local
        for (const cachedVeh of cachedList) {
          if (
            cachedVeh.id.startsWith('veh-') &&
            !isDemoVehicle(cachedVeh) &&
            !list.some((v) => v.id === cachedVeh.id)
          ) {
            list.push(cachedVeh);
          }
        }

        list = await Promise.all(
          list.map(async (v) => {
            const prev = cachedList.find((c) => c.id === v.id);
            const tCache = totalizersMap[v.id];
            const hasOfflineRef = vehiclesWithPendingRefuelings.has(v.id);
            const hasOfflineMnt = vehiclesWithPendingMaintenances.has(v.id);
            const hasOfflineVeh = pendingVehicleSaves.has(v.id);
            const pendingConfig = pendingPeriodicConfigs.get(v.id);

            const merged: Vehicle = {
              ...v,
              order: hasOfflineVeh && prev?.order != null ? prev.order : (v.order ?? prev?.order),
              isPreferred:
                hasOfflineVeh && prev?.isPreferred != null
                  ? prev.isPreferred
                  : (v.isPreferred ?? prev?.isPreferred),
              currentOdometer:
                hasOfflineRef || hasOfflineMnt || hasOfflineVeh
                  ? Math.max(v.currentOdometer || 0, prev?.currentOdometer || 0)
                  : v.currentOdometer || prev?.currentOdometer || 0,
              // Preserva totalizadores locais caso haja lançamentos offline pendentes
              totalGastoAbast: hasOfflineRef
                ? (prev?.totalGastoAbast ?? tCache?.totalGastoAbast ?? v.totalGastoAbast)
                : (v.totalGastoAbast ?? prev?.totalGastoAbast ?? tCache?.totalGastoAbast),
              totalLitrosAbast: hasOfflineRef
                ? (prev?.totalLitrosAbast ?? tCache?.totalLitrosAbast ?? v.totalLitrosAbast)
                : (v.totalLitrosAbast ?? prev?.totalLitrosAbast ?? tCache?.totalLitrosAbast),
              mediaGeralKmPorLitro: hasOfflineRef
                ? (prev?.mediaGeralKmPorLitro ??
                    tCache?.mediaGeralKmPorLitro ??
                    v.mediaGeralKmPorLitro)
                : (v.mediaGeralKmPorLitro ??
                    prev?.mediaGeralKmPorLitro ??
                    tCache?.mediaGeralKmPorLitro),
              custoMedioPorKm: hasOfflineRef
                ? (prev?.custoMedioPorKm ?? tCache?.custoMedioPorKm ?? v.custoMedioPorKm)
                : (v.custoMedioPorKm ?? prev?.custoMedioPorKm ?? tCache?.custoMedioPorKm),
              qtdAbastecimentos: hasOfflineRef
                ? (prev?.qtdAbastecimentos ?? tCache?.qtdAbastecimentos ?? v.qtdAbastecimentos)
                : (v.qtdAbastecimentos ?? prev?.qtdAbastecimentos ?? tCache?.qtdAbastecimentos),
              gastoManutencao: hasOfflineMnt
                ? (prev?.gastoManutencao ?? tCache?.gastoManutencao ?? v.gastoManutencao)
                : (v.gastoManutencao ?? prev?.gastoManutencao ?? tCache?.gastoManutencao),
              qtdManutencoes: hasOfflineMnt
                ? (prev?.qtdManutencoes ?? tCache?.qtdManutencoes ?? v.qtdManutencoes)
                : (v.qtdManutencoes ?? prev?.qtdManutencoes ?? tCache?.qtdManutencoes),
            };

            if (hasOfflineMnt && prev) {
              merged.ultimaTrocaOleoKm = Math.max(
                v.ultimaTrocaOleoKm || 0,
                prev.ultimaTrocaOleoKm || 0
              ) || undefined;
              merged.proxTrocaOleoKm = Math.max(
                v.proxTrocaOleoKm || 0,
                prev.proxTrocaOleoKm || 0
              ) || undefined;
              merged.ultimaRevisaoKm = Math.max(
                v.ultimaRevisaoKm || 0,
                prev.ultimaRevisaoKm || 0
              ) || undefined;
              merged.proxRevKm = Math.max(v.proxRevKm || 0, prev.proxRevKm || 0) || undefined;
              merged.manFreioDiant = Math.max(
                v.manFreioDiant || 0,
                prev.manFreioDiant || 0
              ) || undefined;
              merged.manFreioTras = Math.max(
                v.manFreioTras || 0,
                prev.manFreioTras || 0
              ) || undefined;
              merged.ultimaLubCorrenteKm = Math.max(
                v.ultimaLubCorrenteKm || 0,
                prev.ultimaLubCorrenteKm || 0
              ) || undefined;
              merged.proxLubCorrenteKm = Math.max(
                v.proxLubCorrenteKm || 0,
                prev.proxLubCorrenteKm || 0
              ) || undefined;
              merged.ultimaEsticarCorrenteKm = Math.max(
                v.ultimaEsticarCorrenteKm || 0,
                prev.ultimaEsticarCorrenteKm || 0
              ) || undefined;
              merged.proxEsticarCorrenteKm = Math.max(
                v.proxEsticarCorrenteKm || 0,
                prev.proxEsticarCorrenteKm || 0
              ) || undefined;
            }

            if (pendingConfig) {
              Object.assign(merged, pendingConfig);
            }

            // Garante que o avatar do veículo esteja salvo em Base64 no cache local
            const cachedAvatar = await ensureOfflineCachedImage(
              `vehicle_${v.id}`,
              merged.photoUrl || prev?.photoUrl
            );
            if (cachedAvatar) {
              merged.photoUrl = cachedAvatar;
            }

            return merged;
          })
        );

        const preferredId = await AsyncStorage.getItem(STORAGE_KEYS.PREFERRED_VEHICLE);
        list = sortVehiclesByOrder(list, preferredId);

        if (list.length > 0) {
          list.forEach((v, idx) => {
            v.order = idx;
            v.isPreferred = idx === 0;
          });
          await AsyncStorage.setItem(STORAGE_KEYS.PREFERRED_VEHICLE, list[0].id);
        }

        await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(list));

        const currentActive = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_VEHICLE);
        if (!currentActive || !list.some((v) => v.id === currentActive)) {
          if (list.length > 0) {
            await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_VEHICLE, list[0].id);
          }
        }
        return list;
      } catch (error) {
        console.warn('Offline: usando cache local de veículos:', error);
      }
    }

    return this.getCachedVehicles();
  },

  async getVehicleById(id: string): Promise<Vehicle | null> {
    const list = await this.getVehicles();
    const found = list.find((v) => v.id === id);
    if (found) return found;
    const cached = await this.getCachedVehicles();
    return cached.find((v) => v.id === id) || null;
  },

  async saveVehicle(vehicle: Vehicle): Promise<void> {
    const userEmail = auth.currentUser?.email;
    let savedOnline = false;
    const isOnline = await checkOnlineStatus();

    // Garante cache local do avatar do veículo antes e depois do salvamento
    if (vehicle.photoUrl) {
      const localPhoto = await ensureOfflineCachedImage(`vehicle_${vehicle.id}`, vehicle.photoUrl);
      if (localPhoto) {
        vehicle.photoUrl = localPhoto;
      }
    }

    if (vehicle.isShared) {
      throw new Error(
        'Usuários com acesso compartilhado não podem alterar os dados cadastrais do veículo.'
      );
    }

    if (isOnline && userEmail) {
      try {
        const isCar = vehicle.vehicleType !== 'moto';
        const docData: Record<string, unknown> = {
          tipoVeiculo: vehicle.vehicleType || (isCar ? 'carro' : 'moto'),
          placa: vehicle.plate.toUpperCase(),
          ano: vehicle.year,
          marca: vehicle.brand || '',
          modelo: vehicle.name || vehicle.model,
          capacidadeTanque: vehicle.tankCapacity,
          tanque: vehicle.tankCapacity,
          tankCapacity: vehicle.tankCapacity,
          cilindrada: parseEngineDisplacement(vehicle.engineDisplacement) || (isCar ? 1000 : 150),
          kmAtual: vehicle.currentOdometer,
          ultimoKm: vehicle.currentOdometer,
          ultimoComb:
            vehicle.fuelType === 'etanol'
              ? 'Etanol'
              : vehicle.fuelType === 'diesel'
              ? 'Diesel'
              : 'Gasolina',
          combustiveisAceitos: vehicle.acceptedFuelTypes || [vehicle.fuelType],
          acceptedFuelTypes: vehicle.acceptedFuelTypes || [vehicle.fuelType],
          photoUrl: vehicle.photoUrl || null,
          fotoUrl: vehicle.photoUrl || null,
          cadManPeriodica: vehicle.cadManPeriodica ?? false,
        };

        if (vehicle.ownerEmail) docData.ownerEmail = vehicle.ownerEmail;
        if (vehicle.sharedWith) docData.sharedWith = vehicle.sharedWith;
        if (vehicle.sharedAt) docData.sharedAt = vehicle.sharedAt;
        if (vehicle.isShared != null) docData.isShared = vehicle.isShared;

        if (vehicle.cadManPeriodica) {
          docData.revisaoKm = vehicle.revisaoKm ?? 10000;
          docData.revisaoMes = vehicle.revisaoMes ?? 12;
          docData.trocaOleoKm = vehicle.trocaOleoKm ?? 10000;
          docData.trocaOleoMeses = vehicle.trocaOleoMeses ?? 6;
          if (vehicle.ultimaRevisaoKm != null) docData.ultimaRevisaoKm = vehicle.ultimaRevisaoKm;
          if (vehicle.ultimaTrocaOleoKm != null) docData.ultimaTrocaOleoKm = vehicle.ultimaTrocaOleoKm;
          docData.proxRevKm =
            vehicle.proxRevKm ?? vehicle.currentOdometer + (vehicle.revisaoKm || 10000);
          docData.proxTrocaOleoKm =
            vehicle.proxTrocaOleoKm ?? vehicle.currentOdometer + (vehicle.trocaOleoKm || 10000);

          if (vehicle.vehicleType === 'moto') {
            if (vehicle.lubrificarCorrenteKm != null)
              docData.lubrificarCorrenteKm = vehicle.lubrificarCorrenteKm;
            if (vehicle.ultimaLubCorrenteKm != null)
              docData.ultimaLubCorrenteKm = vehicle.ultimaLubCorrenteKm;
            if (vehicle.proxLubCorrenteKm != null)
              docData.proxLubCorrenteKm = vehicle.proxLubCorrenteKm;
            if (vehicle.esticarCorrenteKm != null)
              docData.esticarCorrenteKm = vehicle.esticarCorrenteKm;
            if (vehicle.ultimaEsticarCorrenteKm != null)
              docData.ultimaEsticarCorrenteKm = vehicle.ultimaEsticarCorrenteKm;
            if (vehicle.proxEsticarCorrenteKm != null)
              docData.proxEsticarCorrenteKm = vehicle.proxEsticarCorrenteKm;
          }
        }

        if (vehicle.gastoManutencao != null) docData.gastoManutencao = vehicle.gastoManutencao;
        if (vehicle.manFreioDiant != null) docData.manFreioDiant = vehicle.manFreioDiant;
        if (vehicle.manFreioTras != null) docData.manFreioTras = vehicle.manFreioTras;
        if (vehicle.totalGastoAbast != null) docData.totalGastoAbast = vehicle.totalGastoAbast;
        if (vehicle.totalLitrosAbast != null) docData.totalLitrosAbast = vehicle.totalLitrosAbast;
        if (vehicle.mediaGeralKmPorLitro != null)
          docData.mediaGeralKmPorLitro = vehicle.mediaGeralKmPorLitro;
        if (vehicle.custoMedioPorKm != null) docData.custoMedioPorKm = vehicle.custoMedioPorKm;
        if (vehicle.qtdAbastecimentos != null) docData.qtdAbastecimentos = vehicle.qtdAbastecimentos;
        if (vehicle.qtdManutencoes != null) docData.qtdManutencoes = vehicle.qtdManutencoes;
        if (vehicle.order != null) docData.ordem = vehicle.order;
        if (vehicle.isPreferred != null) docData.preferido = vehicle.isPreferred;

        if (vehicle.createdAt) {
          docData.dataCadastro = vehicle.createdAt;
        } else {
          const nowIso = new Date().toISOString().split('T')[0];
          vehicle.createdAt = nowIso;
          docData.dataCadastro = nowIso;
        }
        if (vehicle.transferredAt) docData.dataTransferencia = vehicle.transferredAt;
        if (vehicle.transferredFrom) docData.transferidoDe = vehicle.transferredFrom;

        const oldId = vehicle.id;
        if (vehicle.id && !vehicle.id.startsWith('veh-')) {
          await withFirestoreTimeout(
            () => setDoc(doc(db, 'users', userEmail, 'veiculos', vehicle.id), docData, { merge: true }),
            1500
          );
        } else {
          const docRef = await withFirestoreTimeout(
            () => addDoc(collection(db, 'users', userEmail, 'veiculos'), docData),
            1500
          );
          vehicle.id = docRef.id;
          if (vehicle.photoUrl) {
            await saveAvatarToLocalCache(`vehicle_${vehicle.id}`, vehicle.photoUrl);
          }
        }
        savedOnline = true;
        if (oldId) await SyncService.removeByEntityId(oldId);
        await SyncService.removeByEntityId(vehicle.id);
      } catch (err) {
        console.warn('Offline: Falha ao salvar veículo no Firestore, salvando local e enfileirando:', err);
      }
    }

    if (userEmail && !savedOnline) {
      await SyncService.enqueue('SAVE_VEHICLE', vehicle.id, vehicle);
    }

    const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
    const vehicles: Vehicle[] = cachedRaw ? JSON.parse(cachedRaw) : [];
    const index = vehicles.findIndex((v) => v.id === vehicle.id);
    if (index >= 0) {
      vehicles[index] = vehicle;
    } else {
      if (vehicle.order == null) vehicle.order = vehicles.length;
      if (vehicle.isPreferred == null) vehicle.isPreferred = vehicles.length === 0;
      vehicles.push(vehicle);
    }
    const prefId = await AsyncStorage.getItem(STORAGE_KEYS.PREFERRED_VEHICLE);
    const sorted = sortVehiclesByOrder(vehicles, prefId);
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(sorted));
    if (sorted.length > 0 && !prefId) {
      await AsyncStorage.setItem(STORAGE_KEYS.PREFERRED_VEHICLE, sorted[0].id);
    }
    this.notifyMaintenanceChange();
  },

  async deleteVehicle(vehicleId: string): Promise<void> {
    const userEmail = auth.currentUser?.email;
    const online = await checkOnlineStatus(true);
    if (!online) {
      throw new Error(
        'Não é possível excluir veículos do banco de dados enquanto estiver offline. Conecte-se à internet e tente novamente.'
      );
    }

    const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
    const vehicles: Vehicle[] = cachedRaw ? JSON.parse(cachedRaw) : [];
    const vehToDelete = vehicles.find((v) => v.id === vehicleId);

    // Se o veículo for compartilhado por outro usuário, o destinatário apenas sai do compartilhamento
    if (vehToDelete?.isShared) {
      await this.leaveSharedVehicle(vehicleId);
      return;
    }

    // Se o proprietário estiver excluindo e houver compartilhamentos ativos, revoga o acesso de todos os destinatários
    if (userEmail && vehToDelete?.sharedWith && vehToDelete.sharedWith.length > 0) {
      for (const destEmail of vehToDelete.sharedWith) {
        const destKey = String(destEmail).toLowerCase().trim();
        if (destKey) {
          withFirestoreTimeout(
            () => deleteDoc(doc(db, 'users', destKey, 'veiculos_compartilhados', vehicleId)),
            2000
          ).catch(() => {});
          withFirestoreTimeout(
            () => deleteDoc(doc(db, 'users', destKey, 'veiculos', vehicleId)),
            2000
          ).catch(() => {});
        }
      }
    }

    if (userEmail && !vehicleId.startsWith('veh-')) {
      await withFirestoreTimeout(
        () => deleteDoc(doc(db, 'users', userEmail, 'veiculos', vehicleId)),
        2000
      );
      await SyncService.removeByVehicleId(vehicleId);
      await saveAvatarToLocalCache(`vehicle_${vehicleId}`, null);
    }

    const remaining = vehicles.filter((v) => v.id !== vehicleId);
    if (remaining.length > 0) {
      remaining.forEach((v, idx) => {
        v.order = idx;
        v.isPreferred = idx === 0;
      });
      await AsyncStorage.setItem(STORAGE_KEYS.PREFERRED_VEHICLE, remaining[0].id);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.PREFERRED_VEHICLE);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(remaining));
    const active = await this.getActiveVehicleId();
    if (active === vehicleId && remaining.length > 0) {
      await this.setActiveVehicleId(remaining[0].id);
    }
    this.notifyMaintenanceChange();
  },

  /**
   * Compartilha o veículo com outro usuário.
   * O destinatário poderá visualizar todo o histórico, cadastrar e editar abastecimentos e manutenções.
   */
  async shareVehicle(
    vehicleId: string,
    targetEmail: string
  ): Promise<{ success: boolean; sharedWith: string[] }> {
    const userEmail = auth.currentUser?.email;
    if (!userEmail) {
      throw new Error('Nenhum usuário conectado para realizar o compartilhamento.');
    }

    const online = await checkOnlineStatus(true);
    if (!online) {
      throw new Error(
        'Não é possível compartilhar veículos enquanto estiver offline. Conecte-se à internet e tente novamente.'
      );
    }

    const ownerKey = userEmail.toLowerCase().trim();
    const targetKey = targetEmail.toLowerCase().trim();

    if (!targetKey || !targetKey.includes('@') || !targetKey.includes('.')) {
      throw new Error('Informe um endereço de e-mail válido para o compartilhamento.');
    }

    if (ownerKey === targetKey) {
      throw new Error('Não é possível compartilhar um veículo com você mesmo.');
    }

    const ownerVehDocRef = doc(db, 'users', ownerKey, 'veiculos', vehicleId);
    const ownerVehSnap = await withFirestoreTimeout(() => getDoc(ownerVehDocRef), 3500);
    if (!ownerVehSnap.exists()) {
      throw new Error('Veículo não encontrado no banco de dados para compartilhamento.');
    }

    const vehData = ownerVehSnap.data() as Record<string, unknown>;
    const currentShared: string[] = Array.isArray(vehData.sharedWith)
      ? vehData.sharedWith.map((e) => String(e).toLowerCase().trim())
      : Array.isArray(vehData.compartilhadoCom)
      ? vehData.compartilhadoCom.map((e) => String(e).toLowerCase().trim())
      : [];

    if (currentShared.includes(targetKey)) {
      return { success: true, sharedWith: currentShared };
    }

    const newSharedWith = [...currentShared, targetKey];
    const nowIso = new Date().toISOString();

    const batch = writeBatch(db);

    // 1. Atualiza lista de compartilhamento no veículo do proprietário
    batch.set(
      ownerVehDocRef,
      {
        sharedWith: newSharedWith,
        compartilhadoCom: newSharedWith,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    // 2. Cria ponteiro na conta do destinatário
    const sharedPointerDocRef = doc(db, 'users', targetKey, 'veiculos_compartilhados', vehicleId);
    batch.set(
      sharedPointerDocRef,
      {
        vehicleId,
        ownerEmail: ownerKey,
        sharedAt: nowIso,
      },
      { merge: true }
    );

    // 3. Garante documento base do destinatário
    const targetUserDocRef = doc(db, 'users', targetKey);
    batch.set(
      targetUserDocRef,
      {
        email: targetKey,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    // 4. Cria documento espelho do veículo no destinatário para leitura rápida
    const targetVehDocRef = doc(db, 'users', targetKey, 'veiculos', vehicleId);
    batch.set(
      targetVehDocRef,
      {
        ...vehData,
        isShared: true,
        compartilhado: true,
        ownerEmail: ownerKey,
        proprietarioEmail: ownerKey,
        sharedWith: newSharedWith,
        compartilhadoCom: newSharedWith,
        sharedAt: nowIso,
      },
      { merge: true }
    );

    await withFirestoreTimeout(() => batch.commit(), 6000);

    // Atualiza cache local do proprietário
    const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
    if (cachedRaw) {
      const vehicles: Vehicle[] = JSON.parse(cachedRaw);
      const idx = vehicles.findIndex((v) => v.id === vehicleId);
      if (idx >= 0) {
        vehicles[idx].sharedWith = newSharedWith;
        await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
      }
    }

    this.notifyMaintenanceChange();
    return { success: true, sharedWith: newSharedWith };
  },

  /**
   * Revoga o acesso compartilhado de um usuário ao veículo.
   */
  async unshareVehicle(
    vehicleId: string,
    targetEmail: string
  ): Promise<{ success: boolean; sharedWith: string[] }> {
    const userEmail = auth.currentUser?.email;
    if (!userEmail) {
      throw new Error('Nenhum usuário conectado para revogar o compartilhamento.');
    }

    const online = await checkOnlineStatus(true);
    if (!online) {
      throw new Error(
        'Não é possível gerenciar compartilhamentos offline. Conecte-se à internet e tente novamente.'
      );
    }

    const ownerKey = userEmail.toLowerCase().trim();
    const targetKey = targetEmail.toLowerCase().trim();

    const ownerVehDocRef = doc(db, 'users', ownerKey, 'veiculos', vehicleId);
    const ownerVehSnap = await withFirestoreTimeout(() => getDoc(ownerVehDocRef), 3500);
    if (!ownerVehSnap.exists()) {
      throw new Error('Veículo não encontrado.');
    }

    const vehData = ownerVehSnap.data() as Record<string, unknown>;
    const currentShared: string[] = Array.isArray(vehData.sharedWith)
      ? vehData.sharedWith.map((e) => String(e).toLowerCase().trim())
      : Array.isArray(vehData.compartilhadoCom)
      ? vehData.compartilhadoCom.map((e) => String(e).toLowerCase().trim())
      : [];

    const newSharedWith = currentShared.filter((e) => e !== targetKey);

    const batch = writeBatch(db);
    batch.set(
      ownerVehDocRef,
      {
        sharedWith: newSharedWith,
        compartilhadoCom: newSharedWith,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Remove ponteiro e documento espelho no destinatário
    const sharedPointerDocRef = doc(db, 'users', targetKey, 'veiculos_compartilhados', vehicleId);
    batch.delete(sharedPointerDocRef);

    const targetVehDocRef = doc(db, 'users', targetKey, 'veiculos', vehicleId);
    batch.delete(targetVehDocRef);

    await withFirestoreTimeout(() => batch.commit(), 6000);

    // Atualiza cache local do proprietário
    const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
    if (cachedRaw) {
      const vehicles: Vehicle[] = JSON.parse(cachedRaw);
      const idx = vehicles.findIndex((v) => v.id === vehicleId);
      if (idx >= 0) {
        vehicles[idx].sharedWith = newSharedWith;
        await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
      }
    }

    this.notifyMaintenanceChange();
    return { success: true, sharedWith: newSharedWith };
  },

  /**
   * Usuário destinatário sai do compartilhamento de um veículo.
   */
  async leaveSharedVehicle(vehicleId: string): Promise<void> {
    const userEmail = auth.currentUser?.email;
    if (!userEmail) {
      throw new Error('Nenhum usuário conectado.');
    }

    const userKey = userEmail.toLowerCase().trim();
    const online = await checkOnlineStatus(true);
    if (!online) {
      throw new Error(
        'Não é possível sair do compartilhamento offline. Conecte-se à internet e tente novamente.'
      );
    }

    // Identifica o proprietário
    const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
    const vehicles: Vehicle[] = cachedRaw ? JSON.parse(cachedRaw) : [];
    const veh = vehicles.find((v) => v.id === vehicleId);
    const ownerKey = veh?.ownerEmail?.toLowerCase().trim();

    if (ownerKey && ownerKey !== userKey) {
      try {
        const ownerVehDocRef = doc(db, 'users', ownerKey, 'veiculos', vehicleId);
        const ownerVehSnap = await withFirestoreTimeout(() => getDoc(ownerVehDocRef), 3000);
        if (ownerVehSnap.exists()) {
          const vData = ownerVehSnap.data();
          const currentShared: string[] = Array.isArray(vData.sharedWith)
            ? vData.sharedWith.map((e: unknown) => String(e).toLowerCase().trim())
            : [];
          const updatedShared = currentShared.filter((e) => e !== userKey);
          await withFirestoreTimeout(
            () =>
              setDoc(
                ownerVehDocRef,
                { sharedWith: updatedShared, compartilhadoCom: updatedShared },
                { merge: true }
              ),
            2500
          );
        }
      } catch (e) {
        console.warn('Aviso: falha ao remover membro da lista do proprietário:', e);
      }
    }

    // Remove ponteiro e espelho local no Firestore
    await withFirestoreTimeout(
      () => deleteDoc(doc(db, 'users', userKey, 'veiculos_compartilhados', vehicleId)),
      2000
    ).catch(() => {});
    await withFirestoreTimeout(
      () => deleteDoc(doc(db, 'users', userKey, 'veiculos', vehicleId)),
      2000
    ).catch(() => {});

    // Remove do cache local
    const remaining = vehicles.filter((v) => v.id !== vehicleId);
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(remaining));
    await AsyncStorage.removeItem(STORAGE_KEYS.REFUELINGS + '_' + vehicleId);
    await AsyncStorage.removeItem(STORAGE_KEYS.MAINTENANCES + '_' + vehicleId);

    const activeId = await this.getActiveVehicleId();
    if (activeId === vehicleId) {
      if (remaining.length > 0) {
        await this.setActiveVehicleId(remaining[0].id);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_VEHICLE);
      }
    }

    this.notifyMaintenanceChange();
  },

  /**
   * Transfere o cadastro de um veículo e todo o seu histórico (abastecimentos e manutenções)
   * para outro usuário cadastrado no ContaGiro.
   */
  async transferVehicle(
    vehicleId: string,
    targetEmail: string
  ): Promise<{ success: boolean; refuelingsCount: number; maintenancesCount: number }> {
    const userEmail = auth.currentUser?.email;
    if (!userEmail) {
      throw new Error('Nenhum usuário conectado para realizar a transferência.');
    }

    const online = await checkOnlineStatus(true);
    if (!online) {
      throw new Error(
        'Não é possível transferir veículos enquanto estiver offline. Conecte-se à internet e tente novamente.'
      );
    }

    const sourceKey = userEmail.toLowerCase().trim();
    const targetKey = targetEmail.toLowerCase().trim();

    if (!targetKey || !targetKey.includes('@') || !targetKey.includes('.')) {
      throw new Error('Informe um endereço de e-mail válido para o destinatário.');
    }

    if (sourceKey === targetKey) {
      throw new Error('Não é possível transferir um veículo para o seu próprio e-mail.');
    }

    // 1. Sincroniza qualquer alteração local pendente antes de transferir
    try {
      await SyncService.syncNow();
    } catch {}

    // 2. Valida se o veículo de origem existe no Firestore
    let effectiveVehId = vehicleId;
    if (vehicleId.startsWith('veh-')) {
      const cachedVehicles = await this.getCachedVehicles();
      const current = cachedVehicles.find((v) => v.id === vehicleId);
      if (current) {
        await this.saveVehicle(current);
        effectiveVehId = current.id;
      }
    }

    const sourceVehDocRef = doc(db, 'users', sourceKey, 'veiculos', effectiveVehId);
    const sourceVehSnap = await withFirestoreTimeout(() => getDoc(sourceVehDocRef), 3500);
    if (!sourceVehSnap.exists()) {
      throw new Error('Veículo não encontrado no banco de dados para transferência.');
    }

    const vehData = sourceVehSnap.data() as Record<string, unknown>;
    const targetPlate = String(vehData.placa || '').toUpperCase().trim();

    // 3. Verifica se o destinatário já possui um veículo com a mesma placa
    if (targetPlate) {
      try {
        const targetVehColRef = collection(db, 'users', targetKey, 'veiculos');
        const targetVehsSnap = await withFirestoreTimeout(() => getDocs(targetVehColRef), 3500);
        const plateAlreadyExists = targetVehsSnap.docs.some(
          (d) => String(d.data().placa || '').toUpperCase().trim() === targetPlate
        );
        if (plateAlreadyExists) {
          throw new Error(`O usuário destinatário (${targetKey}) já possui um veículo com a placa ${targetPlate}.`);
        }
      } catch (e: any) {
        if (e?.message?.includes('já possui um veículo')) {
          throw e;
        }
      }
    }

    // 5. Prepara os dados do veículo para o novo proprietário
    const nowIso = new Date().toISOString().split('T')[0];
    const dataCadastro = (vehData.dataCadastro as string) || (vehData.createdAt as string) || nowIso;
    const dataTransferencia = nowIso;
    const transferidoDe = sourceKey;

    const targetVehData: Record<string, unknown> = {
      ...vehData,
      dataCadastro,
      dataTransferencia,
      transferidoDe,
      preferido: false,
      ordem: 999,
    };

    // 6. Busca todos os abastecimentos do veículo
    const sourceRefColRef = collection(db, 'users', sourceKey, 'veiculos', effectiveVehId, 'abastecimentos');
    const sourceRefSnap = await withFirestoreTimeout(() => getDocs(sourceRefColRef), 5000);
    const refDocs = sourceRefSnap.docs;

    // 7. Busca todas as manutenções do veículo
    const sourceMntColRef = collection(db, 'users', sourceKey, 'manutencoes');
    const sourceMntSnap = await withFirestoreTimeout(() => getDocs(sourceMntColRef), 5000);
    const mntDocs = sourceMntSnap.docs.filter((d) => {
      const data = d.data();
      return String(data.veiculoId || data.idVeiculo || '') === effectiveVehId;
    });

    // 8. Grava no destinatário e remove da origem em lote atômico (batches)
    const targetVehDocRef = doc(db, 'users', targetKey, 'veiculos', effectiveVehId);

    type BatchOp =
      | { type: 'set'; ref: any; data: Record<string, unknown> }
      | { type: 'delete'; ref: any };

    const ops: BatchOp[] = [];

    // Garante que o documento raiz do usuário de destino exista no Firestore
    ops.push({
      type: 'set',
      ref: doc(db, 'users', targetKey),
      data: {
        email: targetKey,
        updatedAt: new Date().toISOString(),
      },
    });

    // Cria veículo no destino
    ops.push({ type: 'set', ref: targetVehDocRef, data: targetVehData });

    // Copia abastecimentos para o destino
    for (const rDoc of refDocs) {
      const targetRefDocRef = doc(
        db,
        'users',
        targetKey,
        'veiculos',
        effectiveVehId,
        'abastecimentos',
        rDoc.id
      );
      ops.push({ type: 'set', ref: targetRefDocRef, data: rDoc.data() });
    }

    // Copia manutenções para o destino
    for (const mDoc of mntDocs) {
      const targetMntDocRef = doc(db, 'users', targetKey, 'manutencoes', mDoc.id);
      ops.push({ type: 'set', ref: targetMntDocRef, data: mDoc.data() });
    }

    // Remove abastecimentos da origem
    for (const rDoc of refDocs) {
      ops.push({ type: 'delete', ref: rDoc.ref });
    }

    // Remove manutenções da origem
    for (const mDoc of mntDocs) {
      ops.push({ type: 'delete', ref: mDoc.ref });
    }

    // Remove veículo da origem
    ops.push({ type: 'delete', ref: sourceVehDocRef });

    // Executa em chunks de 400
    const CHUNK_SIZE = 400;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const op of chunk) {
        if (op.type === 'set') {
          batch.set(op.ref, op.data, { merge: true });
        } else {
          batch.delete(op.ref);
        }
      }
      await withFirestoreTimeout(() => batch.commit(), 8000);
    }

    // 9. Garante a exclusão do veículo na origem e limpa caches locais no aparelho do usuário de origem
    await withFirestoreTimeout(() => deleteDoc(sourceVehDocRef), 3000).catch(() => {});
    if (effectiveVehId !== vehicleId) {
      await withFirestoreTimeout(
        () => deleteDoc(doc(db, 'users', sourceKey, 'veiculos', vehicleId)),
        3000
      ).catch(() => {});
    }

    const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
    const vehicles: Vehicle[] = cachedRaw ? JSON.parse(cachedRaw) : [];
    const remaining = vehicles.filter((v) => v.id !== effectiveVehId && v.id !== vehicleId);

    if (remaining.length > 0) {
      remaining.forEach((v, idx) => {
        v.order = idx;
        v.isPreferred = idx === 0;
      });
      await AsyncStorage.setItem(STORAGE_KEYS.PREFERRED_VEHICLE, remaining[0].id);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.PREFERRED_VEHICLE);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(remaining));

    const activeId = await this.getActiveVehicleId();
    if (activeId === effectiveVehId || activeId === vehicleId) {
      if (remaining.length > 0) {
        await this.setActiveVehicleId(remaining[0].id);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_VEHICLE);
      }
    }

    // Limpa cache de fotos do veículo transferido
    await saveAvatarToLocalCache(`vehicle_${effectiveVehId}`, null);
    if (effectiveVehId !== vehicleId) {
      await saveAvatarToLocalCache(`vehicle_${vehicleId}`, null);
    }

    // Limpa caches específicos do veículo
    await AsyncStorage.removeItem(STORAGE_KEYS.REFUELINGS + '_' + effectiveVehId);
    await AsyncStorage.removeItem(STORAGE_KEYS.MAINTENANCES + '_' + effectiveVehId);
    if (effectiveVehId !== vehicleId) {
      await AsyncStorage.removeItem(STORAGE_KEYS.REFUELINGS + '_' + vehicleId);
      await AsyncStorage.removeItem(STORAGE_KEYS.MAINTENANCES + '_' + vehicleId);
    }

    // Limpa registros agregados
    const allRefsRaw = await AsyncStorage.getItem(STORAGE_KEYS.REFUELINGS);
    if (allRefsRaw) {
      const allRefs: Refueling[] = JSON.parse(allRefsRaw);
      const remRefs = allRefs.filter((r) => r.vehicleId !== effectiveVehId && r.vehicleId !== vehicleId);
      await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(remRefs));
    }

    const allMntsRaw = await AsyncStorage.getItem(STORAGE_KEYS.MAINTENANCES);
    if (allMntsRaw) {
      const allMnts: MaintenanceItem[] = JSON.parse(allMntsRaw);
      const remMnts = allMnts.filter((m) => m.vehicleId !== effectiveVehId && m.vehicleId !== vehicleId);
      await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(remMnts));
    }

    // Limpa totalizadores
    const rawTot = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLE_TOTALIZERS);
    if (rawTot) {
      const map = JSON.parse(rawTot);
      delete map[effectiveVehId];
      delete map[vehicleId];
      await AsyncStorage.setItem(STORAGE_KEYS.VEHICLE_TOTALIZERS, JSON.stringify(map));
    }

    // Limpa todas as operações pendentes associadas a este veículo na fila de sincronização
    await SyncService.removeByVehicleId(effectiveVehId);
    if (effectiveVehId !== vehicleId) {
      await SyncService.removeByVehicleId(vehicleId);
    }

    this.notifyMaintenanceChange();

    return {
      success: true,
      refuelingsCount: refDocs.length,
      maintenancesCount: mntDocs.length,
    };
  },

  async getActiveVehicleId(): Promise<string | null> {
    try {
      const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_VEHICLE);
      if (activeId && activeId !== 'veh-1' && activeId !== 'veh-2') {
        const cached = await this.getCachedVehicles();
        if (cached.some((v) => v.id === activeId)) return activeId;
      }
      const list = await this.getCachedVehicles();
      if (list.length > 0) {
        await this.setActiveVehicleId(list[0].id);
        return list[0].id;
      }
      return null;
    } catch {
      return null;
    }
  },

  async setActiveVehicleId(vehicleId: string): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_VEHICLE, vehicleId);
  },

  async getActiveVehicle(): Promise<Vehicle | null> {
    const vehicles = await this.getVehicles();
    const activeId = await this.getActiveVehicleId();
    return vehicles.find((v) => v.id === activeId) || vehicles[0] || null;
  },

  // ORDENAÇÃO E PREFERÊNCIA DE VEÍCULOS (VEÍCULO PREFERIDO NO TOPO)
  async getPreferredVehicleId(): Promise<string | null> {
    try {
      const prefId = await AsyncStorage.getItem(STORAGE_KEYS.PREFERRED_VEHICLE);
      if (prefId && prefId !== 'veh-1' && prefId !== 'veh-2') {
        const cached = await this.getCachedVehicles();
        if (cached.some((v) => v.id === prefId)) return prefId;
      }
      const list = await this.getCachedVehicles();
      const preferred = list.find((v) => v.isPreferred) || list[0];
      return preferred?.id || null;
    } catch {
      return null;
    }
  },

  async setPreferredVehicle(vehicleId: string): Promise<Vehicle[]> {
    const list = await this.getCachedVehicles();
    const targetIdx = list.findIndex((v) => v.id === vehicleId);
    if (targetIdx < 0) return list;

    const [selected] = list.splice(targetIdx, 1);
    list.unshift(selected);

    list.forEach((v, idx) => {
      v.order = idx;
      v.isPreferred = idx === 0;
    });

    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(list));
    await AsyncStorage.setItem(STORAGE_KEYS.PREFERRED_VEHICLE, vehicleId);
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_VEHICLE, vehicleId);

    const userEmail = auth.currentUser?.email;
    if (userEmail) {
      try {
        const batch = writeBatch(db);
        list.forEach((v) => {
          if (!v.id.startsWith('veh-')) {
            const vRef = doc(db, 'users', userEmail, 'veiculos', v.id);
            batch.set(vRef, { ordem: v.order, preferido: v.isPreferred }, { merge: true });
          }
        });
        await withFirestoreTimeout(() => batch.commit(), 1500);
      } catch (err) {
        console.warn('Offline: Falha ao sincronizar preferência no Firestore:', err);
        for (const v of list) {
          await SyncService.enqueue('SAVE_VEHICLE', v.id, v);
        }
      }
    }

    return list;
  },

  async moveVehicle(vehicleId: string, direction: 'up' | 'down'): Promise<Vehicle[]> {
    const list = await this.getCachedVehicles();
    const idx = list.findIndex((v) => v.id === vehicleId);
    if (idx < 0) return list;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return list;

    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;

    list.forEach((v, i) => {
      v.order = i;
      v.isPreferred = i === 0;
    });

    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(list));
    if (list.length > 0) {
      await AsyncStorage.setItem(STORAGE_KEYS.PREFERRED_VEHICLE, list[0].id);
    }

    const userEmail = auth.currentUser?.email;
    if (userEmail) {
      try {
        const batch = writeBatch(db);
        list.forEach((v) => {
          if (!v.id.startsWith('veh-')) {
            const vRef = doc(db, 'users', userEmail, 'veiculos', v.id);
            batch.set(vRef, { ordem: v.order, preferido: v.isPreferred }, { merge: true });
          }
        });
        await withFirestoreTimeout(() => batch.commit(), 1500);
      } catch (err) {
        console.warn('Offline: Falha ao sincronizar movimento de veículo no Firestore:', err);
        for (const v of list) {
          await SyncService.enqueue('SAVE_VEHICLE', v.id, v);
        }
      }
    }

    return list;
  },

  async reorderVehicles(orderedVehicleIds: string[]): Promise<Vehicle[]> {
    const list = await this.getCachedVehicles();
    const reordered: Vehicle[] = [];

    orderedVehicleIds.forEach((id) => {
      const v = list.find((item) => item.id === id);
      if (v) reordered.push(v);
    });

    list.forEach((v) => {
      if (!reordered.some((item) => item.id === v.id)) {
        reordered.push(v);
      }
    });

    reordered.forEach((v, idx) => {
      v.order = idx;
      v.isPreferred = idx === 0;
    });

    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(reordered));
    if (reordered.length > 0) {
      await AsyncStorage.setItem(STORAGE_KEYS.PREFERRED_VEHICLE, reordered[0].id);
    }

    const userEmail = auth.currentUser?.email;
    if (userEmail) {
      try {
        const batch = writeBatch(db);
        reordered.forEach((v) => {
          if (!v.id.startsWith('veh-')) {
            const vRef = doc(db, 'users', userEmail, 'veiculos', v.id);
            batch.set(vRef, { ordem: v.order, preferido: v.isPreferred }, { merge: true });
          }
        });
        await withFirestoreTimeout(() => batch.commit(), 1500);
      } catch (err) {
        console.warn('Offline: Falha ao salvar reordenação no Firestore:', err);
        for (const v of reordered) {
          await SyncService.enqueue('SAVE_VEHICLE', v.id, v);
        }
      }
    }

    return reordered;
  },

  // TOTALIZADORES E RECÁLCULO DE MÉTRICAS (DISPONÍVEIS ONLINE E OFFLINE)
  async updateVehicleTotalizers(
    vehicleId: string,
    userEmailParam?: string,
    refuelingsParam?: Refueling[],
    maintenancesParam?: MaintenanceItem[]
  ): Promise<Vehicle | null> {
    try {
      const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
      const vehicles: Vehicle[] = cachedRaw ? JSON.parse(cachedRaw) : [];
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      if (!vehicle) return null;

      let refuelings = refuelingsParam;
      if (!refuelings) {
        refuelings = await this.getCachedRefuelings(vehicleId);
      }

      let maintenances = maintenancesParam;
      if (!maintenances) {
        maintenances = await this.getCachedMaintenances(vehicleId);
      }

      let totalGastoAbast = 0;
      let totalLitrosAbast = 0;
      const validConsumptions: number[] = [];
      const validCostsPerKm: number[] = [];

      (refuelings || []).forEach((r) => {
        const amount = Number(r.totalAmount || 0);
        const liters = Number(r.liters || 0);
        totalGastoAbast += amount;
        totalLitrosAbast += liters;

        const m = Number(r.consumptionKmPerLiter);
        if (!isNaN(m) && m > 0 && m < 50) {
          validConsumptions.push(m);
        }

        const c = Number(r.costPerKm);
        if (!isNaN(c) && c > 0) {
          validCostsPerKm.push(c);
        }
      });

      const mediaGeralKmPorLitro =
        validConsumptions.length > 0
          ? Number(
              (validConsumptions.reduce((a, b) => a + b, 0) / validConsumptions.length).toFixed(2)
            )
          : 0;

      const custoMedioPorKm =
        validCostsPerKm.length > 0
          ? Number((validCostsPerKm.reduce((a, b) => a + b, 0) / validCostsPerKm.length).toFixed(2))
          : 0;

      const gastoManutencao = (maintenances || []).reduce(
        (acc, m) => acc + Number(m.cost || 0),
        0
      );

      // Se a lista passada for completa (ou se o veículo tinha <= 5 registros), substitui os totalizadores
      const fullRefListProvided =
        Boolean(refuelingsParam) ||
        (vehicle.qtdAbastecimentos || 0) <= (refuelings || []).length;
      const fullMntListProvided =
        Boolean(maintenancesParam) ||
        (vehicle.qtdManutencoes || 0) <= (maintenances || []).length;

      if (fullRefListProvided) {
        vehicle.totalGastoAbast = Number(totalGastoAbast.toFixed(2));
        vehicle.totalLitrosAbast = Number(totalLitrosAbast.toFixed(2));
        vehicle.mediaGeralKmPorLitro = mediaGeralKmPorLitro;
        vehicle.custoMedioPorKm = custoMedioPorKm;
        vehicle.qtdAbastecimentos = (refuelings || []).length;
      }

      if (fullMntListProvided) {
        vehicle.gastoManutencao = Number(gastoManutencao.toFixed(2));
        vehicle.qtdManutencoes = (maintenances || []).length;
      }

      await saveVehicleTotalizersToCacheMap(vehicleId, {
        totalGastoAbast: vehicle.totalGastoAbast || 0,
        totalLitrosAbast: vehicle.totalLitrosAbast || 0,
        mediaGeralKmPorLitro: vehicle.mediaGeralKmPorLitro || 0,
        custoMedioPorKm: vehicle.custoMedioPorKm || 0,
        qtdAbastecimentos: vehicle.qtdAbastecimentos || 0,
        gastoManutencao: vehicle.gastoManutencao || 0,
        qtdManutencoes: vehicle.qtdManutencoes || 0,
        updatedAt: new Date().toISOString(),
      });

      const idx = vehicles.findIndex((v) => v.id === vehicleId);
      if (idx >= 0) {
        vehicles[idx] = vehicle;
        await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
      }

      const userEmail = userEmailParam || auth.currentUser?.email;
      if (userEmail && !vehicleId.startsWith('veh-')) {
        const isOnline = await checkOnlineStatus();
        if (isOnline) {
          try {
            // Não grava totalizadores no Firestore se o veículo já foi excluído ou transferido
            const currentList = await this.getCachedVehicles();
            if (!currentList.some((v) => v.id === vehicleId)) {
              return vehicle;
            }

            await withFirestoreTimeout(
              () =>
                setDoc(
                  doc(db, 'users', userEmail, 'veiculos', vehicleId),
                  {
                    totalGastoAbast: vehicle.totalGastoAbast,
                    totalLitrosAbast: vehicle.totalLitrosAbast,
                    mediaGeralKmPorLitro: vehicle.mediaGeralKmPorLitro,
                    custoMedioPorKm: vehicle.custoMedioPorKm,
                    qtdAbastecimentos: vehicle.qtdAbastecimentos,
                    gastoManutencao: vehicle.gastoManutencao,
                    qtdManutencoes: vehicle.qtdManutencoes,
                  },
                  { merge: true }
                ),
              1500
            );
          } catch (e) {
            console.warn('Offline: Totalizadores salvos localmente para sincronização futura:', e);
          }
        }
      }

      return vehicle;
    } catch (e) {
      console.warn('Erro ao atualizar totalizadores do veículo:', e);
      return null;
    }
  },

  async recalculateVehicleStats(userEmailOrVehId: string, vehicleId?: string): Promise<void> {
    const targetVehId = vehicleId || userEmailOrVehId;
    const targetEmail = vehicleId ? userEmailOrVehId : undefined;
    await this.updateVehicleTotalizers(targetVehId, targetEmail);
  },

  /**
   * Sincroniza e pré-carrega proativamente todas as informações necessárias para operação offline:
   * 1. Todas as informações de cadastro de todos os veículos
   * 2. As imagens dos avatares de todos os veículos (convertidas para Base64 no cache local)
   * 3. Os 5 últimos abastecimentos de TODOS os veículos
   * 4. Os 5 últimos registros de manutenção de TODOS os veículos
   * 5. Os totalizadores de abastecimento, média de consumo e gasto total em manutenção de TODOS os veículos
   *
   * IMPORTANTE: Dados do Firestore NUNCA sobrepõem dados inseridos no app quando sem rede.
   */
  async preloadOfflineData(force = false): Promise<void> {
    const userEmail = auth.currentUser?.email;
    if (!userEmail) return;
    if (isPreloading) return;
    if (hasPreloadedOfflineData && !force) return;

    const online = await checkOnlineStatus();
    if (!online) return;

    isPreloading = true;
    try {
      const queue = await SyncService.getQueue();
      const userKey = userEmail.toLowerCase().trim();

      const pendingVehicleSaves = new Map<string, Vehicle>();
      const pendingPeriodicConfigs = new Map<string, Record<string, unknown>>();
      const pendingRefuelings = queue
        .filter((q) => q.action === 'ADD_REFUELING' && q.userEmail === userKey)
        .map((q) => q.payload as Refueling);
      const pendingMaintenances = queue
        .filter((q) => q.action === 'ADD_MAINTENANCE' && q.userEmail === userKey)
        .map((q) => q.payload as MaintenanceItem);

      const pendingRefIds = new Set(pendingRefuelings.map((r) => r.id));
      const pendingMntIds = new Set(pendingMaintenances.map((m) => m.id));

      for (const q of queue) {
        if (q.userEmail !== userKey) continue;
        if (q.action === 'SAVE_VEHICLE') {
          const pVeh = q.payload as Vehicle;
          if (!isDemoVehicle(pVeh)) {
            pendingVehicleSaves.set(q.entityId, pVeh);
          }
        } else if (q.action === 'SAVE_PERIODIC_CONFIG') {
          const p = q.payload as { vehicleId?: string; config?: Record<string, unknown> };
          const vId = p.vehicleId || q.entityId;
          if (vId && p.config) pendingPeriodicConfigs.set(vId, p.config);
        }
      }

      // 1. Busca todos os veículos do Firestore com timeout rápido
      const vehSnap = await withFirestoreTimeout(
        () => getDocs(collection(db, 'users', userEmail, 'veiculos')),
        2000
      );

      const cachedVehicles = await this.getCachedVehicles();
      let vehicles: Vehicle[] = [];
      for (const d of vehSnap.docs) {
        const docData = d.data() as Record<string, unknown>;
        const hasVehicleIdentity = Boolean(
          docData.placa ||
          docData.modelo ||
          docData.marca ||
          docData.nome ||
          docData.name ||
          docData.model
        );
        const v = mapFirestoreDocToVehicle(d.id, docData);
        if (isDemoVehicle(v) || !hasVehicleIdentity || isPhantomVehicle(v)) {
          withFirestoreTimeout(
            () => deleteDoc(doc(db, 'users', userEmail, 'veiculos', d.id)),
            1500
          ).catch(() => {});
          saveAvatarToLocalCache(`vehicle_${d.id}`, null).catch(() => {});
        } else {
          vehicles.push(v);
        }
      }

      // Mescla veículos criados/editados offline sem deixar o Firestore sobrepor
      for (const [vId, pv] of pendingVehicleSaves.entries()) {
        if (isDemoVehicle(pv)) continue;
        const idx = vehicles.findIndex((v) => v.id === vId);
        if (idx >= 0) {
          const fsVeh = vehicles[idx];
          vehicles[idx] = {
            ...fsVeh,
            ...pv,
            currentOdometer: Math.max(fsVeh.currentOdometer || 0, pv.currentOdometer || 0),
          };
        } else {
          vehicles.push(pv);
        }
      }
      for (const cv of cachedVehicles) {
        if (
          cv.id.startsWith('veh-') &&
          !isDemoVehicle(cv) &&
          !vehicles.some((v) => v.id === cv.id)
        ) {
          vehicles.push(cv);
        }
      }

      if (vehicles.length === 0) return;

      // 2. Busca todas as manutenções do Firestore e mescla com as pendentes offline
      let allMaintenancesFull: MaintenanceItem[] = [];
      try {
        const maintSnap = await withFirestoreTimeout(
          () => getDocs(collection(db, 'users', userEmail, 'manutencoes')),
          2000
        );
        allMaintenancesFull = maintSnap.docs
          .map((d) => {
            const m = mapFirestoreDocToMaintenance(d.id, d.data());
            if (isDemoRecord(m)) {
              withFirestoreTimeout(
                () => deleteDoc(doc(db, 'users', userEmail, 'manutencoes', d.id)),
                1500
              ).catch(() => {});
            }
            return m;
          })
          .filter((m) => !isDemoRecord(m));

        // Limpa duplicatas existentes no Firestore
        const { unique: dedupedMnts, duplicateIds: dupMntIds } =
          deduplicateMaintenances(allMaintenancesFull);
        allMaintenancesFull = dedupedMnts;
        if (dupMntIds.length > 0) {
          for (const dId of dupMntIds) {
            withFirestoreTimeout(
              () => deleteDoc(doc(db, 'users', userEmail, 'manutencoes', dId)),
              1500
            ).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('Aviso: Falha ao carregar manutenções em preloadOfflineData:', e);
        allMaintenancesFull = await this.getCachedMaintenances();
      }

      for (const pm of pendingMaintenances) {
        const pmFp = getMaintenanceFingerprint(pm);
        const existingIdx = allMaintenancesFull.findIndex(
          (m) => m.id === pm.id || getMaintenanceFingerprint(m) === pmFp
        );
        if (existingIdx === -1) {
          allMaintenancesFull.unshift(pm);
        } else {
          const existing = allMaintenancesFull[existingIdx];
          allMaintenancesFull[existingIdx] = {
            ...existing,
            ...pm,
            id: existing.id || pm.id,
            receiptUrl: pm.receiptUrl || existing.receiptUrl,
            notes: pm.notes || existing.notes,
          };
          const fsHasReceipt = Boolean(existing.receiptUrl);
          const pmHasReceipt = Boolean(pm.receiptUrl);
          if (!pmHasReceipt || fsHasReceipt) {
            SyncService.removeByEntityId(pm.id).catch(() => {});
          }
        }
      }
      allMaintenancesFull = deduplicateMaintenances(allMaintenancesFull).unique;

      // 3. Para cada veículo, carrega abastecimentos, calcula totalizadores completos,
      // faz cache das imagens de avatar em Base64 e salva os 5 últimos registros no cache local
      let allCachedRefuelings: Refueling[] = [];
      let allCachedMaintenances: MaintenanceItem[] = [];

      await Promise.all(
        vehicles.map(async (vehicle) => {
          const prev = cachedVehicles.find((c) => c.id === vehicle.id);

          try {
            // 3a. Garante avatar do veículo em Base64 para funcionamento offline
            const cachedAvatar = await ensureOfflineCachedImage(
              `vehicle_${vehicle.id}`,
              vehicle.photoUrl || prev?.photoUrl
            );
            if (cachedAvatar) {
              vehicle.photoUrl = cachedAvatar;
            }

            // 3b. Abastecimentos do veículo
            let vRefuelingsFull: Refueling[] = [];
            if (!vehicle.id.startsWith('veh-')) {
              const abastSnap = await withFirestoreTimeout(
                () =>
                  getDocs(
                    collection(db, 'users', userEmail, 'veiculos', vehicle.id, 'abastecimentos')
                  ),
                2000
              );
              vRefuelingsFull = abastSnap.docs.map((d) =>
                mapFirestoreDocToRefueling(d.id, { ...d.data(), idVeiculo: vehicle.id })
              );

              // Limpa duplicatas existentes no Firestore para este veículo
              const { unique: dedupedRefs, duplicateIds: dupRefIds } =
                deduplicateRefuelings(vRefuelingsFull);
              vRefuelingsFull = dedupedRefs;
              if (dupRefIds.length > 0) {
                for (const dId of dupRefIds) {
                  withFirestoreTimeout(
                    () =>
                      deleteDoc(
                        doc(db, 'users', userEmail, 'veiculos', vehicle.id, 'abastecimentos', dId)
                      ),
                    1500
                  ).catch(() => {});
                }
              }
            } else {
              vRefuelingsFull = await this.getCachedRefuelings(vehicle.id);
            }

            // Mescla abastecimentos inseridos offline para este veículo
            const vPendingRefs = pendingRefuelings.filter((r) => r.vehicleId === vehicle.id);
            for (const pr of vPendingRefs) {
              const prFp = getRefuelingFingerprint(pr);
              const alreadyInList = vRefuelingsFull.some(
                (r) => r.id === pr.id || getRefuelingFingerprint(r) === prFp
              );
              if (!alreadyInList) {
                vRefuelingsFull.unshift(pr);
              } else {
                SyncService.removeByEntityId(pr.id).catch(() => {});
              }
            }
            vRefuelingsFull = deduplicateRefuelings(vRefuelingsFull).unique;

            const sortedVRefuelingsFull = sortRefuelingsDesc(vRefuelingsFull);
            const cachedFiveRefuelings = limitRefuelingsPerVehicleForCache(
              sortedVRefuelingsFull,
              pendingRefIds
            );

            await AsyncStorage.setItem(
              STORAGE_KEYS.REFUELINGS + '_' + vehicle.id,
              JSON.stringify(cachedFiveRefuelings)
            );
            allCachedRefuelings = allCachedRefuelings.concat(cachedFiveRefuelings);

            // 3c. Manutenções do veículo
            const vMaintenancesFull = sortMaintenancesDesc(
              allMaintenancesFull.filter((m) => m.vehicleId === vehicle.id)
            );
            const cachedFiveMaintenances = limitMaintenancesPerVehicleForCache(
              vMaintenancesFull,
              pendingMntIds
            );

            await AsyncStorage.setItem(
              STORAGE_KEYS.MAINTENANCES + '_' + vehicle.id,
              JSON.stringify(cachedFiveMaintenances)
            );
            allCachedMaintenances = allCachedMaintenances.concat(cachedFiveMaintenances);

            // 3d. Calcula todos os totalizadores do veículo a partir do histórico completo + offline
            let totalGastoAbast = 0;
            let totalLitrosAbast = 0;
            const validConsumptions: number[] = [];
            const validCostsPerKm: number[] = [];

            sortedVRefuelingsFull.forEach((r) => {
              totalGastoAbast += Number(r.totalAmount || 0);
              totalLitrosAbast += Number(r.liters || 0);
              if (
                typeof r.consumptionKmPerLiter === 'number' &&
                r.consumptionKmPerLiter > 0 &&
                r.consumptionKmPerLiter < 50
              ) {
                validConsumptions.push(r.consumptionKmPerLiter);
              }
              if (typeof r.costPerKm === 'number' && r.costPerKm > 0) {
                validCostsPerKm.push(r.costPerKm);
              }
            });

            const mediaGeralKmPorLitro =
              validConsumptions.length > 0
                ? Number(
                    (
                      validConsumptions.reduce((a, b) => a + b, 0) / validConsumptions.length
                    ).toFixed(2)
                  )
                : 0;

            const custoMedioPorKm =
              validCostsPerKm.length > 0
                ? Number(
                    (validCostsPerKm.reduce((a, b) => a + b, 0) / validCostsPerKm.length).toFixed(2)
                  )
                : 0;

            const gastoManutencao = vMaintenancesFull.reduce(
              (acc, m) => acc + Number(m.cost || 0),
              0
            );

            vehicle.totalGastoAbast = Number(totalGastoAbast.toFixed(2));
            vehicle.totalLitrosAbast = Number(totalLitrosAbast.toFixed(2));
            vehicle.mediaGeralKmPorLitro = mediaGeralKmPorLitro;
            vehicle.custoMedioPorKm = custoMedioPorKm;
            vehicle.qtdAbastecimentos = sortedVRefuelingsFull.length;
            vehicle.gastoManutencao = Number(gastoManutencao.toFixed(2));
            vehicle.qtdManutencoes = vMaintenancesFull.length;

            // Preserva odômetro e marcadores de manutenção caso haja lançamentos offline maiores
            const maxRefKm =
              sortedVRefuelingsFull.length > 0
                ? Math.max(...sortedVRefuelingsFull.map((r) => Number(r.odometer || 0)))
                : 0;
            const maxMntKm =
              vMaintenancesFull.length > 0
                ? Math.max(...vMaintenancesFull.map((m) => Number(m.odometer || 0)))
                : 0;
            vehicle.currentOdometer = Math.max(
              vehicle.currentOdometer || 0,
              prev?.currentOdometer || 0,
              maxRefKm,
              maxMntKm
            );

            const pendingConfig = pendingPeriodicConfigs.get(vehicle.id);
            if (pendingConfig) {
              Object.assign(vehicle, pendingConfig);
            }

            await saveVehicleTotalizersToCacheMap(vehicle.id, {
              totalGastoAbast: vehicle.totalGastoAbast,
              totalLitrosAbast: vehicle.totalLitrosAbast,
              mediaGeralKmPorLitro: vehicle.mediaGeralKmPorLitro,
              custoMedioPorKm: vehicle.custoMedioPorKm,
              qtdAbastecimentos: vehicle.qtdAbastecimentos,
              gastoManutencao: vehicle.gastoManutencao,
              qtdManutencoes: vehicle.qtdManutencoes,
              updatedAt: new Date().toISOString(),
            });
          } catch (e) {
            console.warn(`Aviso: Erro ao pré-carregar dados do veículo ${vehicle.id}:`, e);
          }
        })
      );

      // 4. Salva a lista completa de veículos com todos os cadastros, avatares e totalizadores
      const preferredId = await AsyncStorage.getItem(STORAGE_KEYS.PREFERRED_VEHICLE);
      const sortedVehicles = sortVehiclesByOrder(vehicles, preferredId);
      if (sortedVehicles.length > 0) {
        sortedVehicles.forEach((v, idx) => {
          v.order = idx;
          v.isPreferred = idx === 0;
        });
        await AsyncStorage.setItem(STORAGE_KEYS.PREFERRED_VEHICLE, sortedVehicles[0].id);
      }
      await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(sortedVehicles));

      // 5. Salva os 5 últimos abastecimentos e 5 últimas manutenções de cada veículo no cache agregado
      await AsyncStorage.setItem(
        STORAGE_KEYS.REFUELINGS,
        JSON.stringify(sortRefuelingsDesc(allCachedRefuelings))
      );
      await AsyncStorage.setItem(
        STORAGE_KEYS.MAINTENANCES,
        JSON.stringify(sortMaintenancesDesc(allCachedMaintenances))
      );

      hasPreloadedOfflineData = true;
    } catch (err) {
      console.warn('Aviso: Falha ao pré-carregar dados para modo offline:', err);
    } finally {
      isPreloading = false;
    }
  },

  // MIGRAÇÃO INTELIGENTE DE ESTRUTURA (medias -> veiculos/{id}/abastecimentos)
  async migrateLegacyMedias(userEmail: string): Promise<number> {
    if (hasCheckedLegacyMedias) return 0;
    try {
      const online = await checkOnlineStatus();
      if (!online) return 0;

      hasCheckedLegacyMedias = true;
      const legacySnap = await withFirestoreTimeout(
        () => getDocs(collection(db, 'users', userEmail, 'medias')),
        1500
      );
      if (legacySnap.empty) return 0;

      const vehicles = await this.getCachedVehicles();
      if (vehicles.length === 0) return 0;

      let count = 0;
      const touchedVehicleIds = new Set<string>();

      for (const legacyDoc of legacySnap.docs) {
        const data = legacyDoc.data();
        const legacyPlate = String(data.placa || '').toUpperCase();
        const legacyVehId = String(data.idVeiculo || '');

        const targetVeh =
          vehicles.find((v) => v.id === legacyVehId) ||
          vehicles.find((v) => v.plate.toUpperCase() === legacyPlate) ||
          vehicles[0];

        if (targetVeh) {
          const batch = writeBatch(db);
          const newDocRef = doc(
            db,
            'users',
            userEmail,
            'veiculos',
            targetVeh.id,
            'abastecimentos',
            legacyDoc.id
          );

          batch.set(newDocRef, {
            ...data,
            idVeiculo: targetVeh.id,
            placa: targetVeh.plate,
          });
          batch.delete(doc(db, 'users', userEmail, 'medias', legacyDoc.id));
          await withFirestoreTimeout(() => batch.commit(), 1500);

          touchedVehicleIds.add(targetVeh.id);
          count++;
        }
      }

      for (const vehId of touchedVehicleIds) {
        await this.recalculateVehicleStats(userEmail, vehId);
      }

      return count;
    } catch (err) {
      console.warn('Erro durante migração automática de medias:', err);
      return 0;
    }
  },

  // ABASTECIMENTOS (ESTRUTURA HIERÁRQUICA: users/{email}/veiculos/{veiculoId}/abastecimentos)
  async getRefuelings(vehicleId?: string): Promise<Refueling[]> {
    const userEmail = auth.currentUser?.email;
    if (userEmail) {
      try {
        await this.migrateLegacyMedias(userEmail);
        const queue = await SyncService.getQueue();
        const userKey = userEmail.toLowerCase().trim();
        const allPendingAdds = queue
          .filter((q) => q.action === 'ADD_REFUELING' && q.userEmail === userKey)
          .map((q) => q.payload as Refueling)
          .filter((r) => !isDemoRecord(r));
        const pendingIds = new Set(allPendingAdds.map((r) => r.id));

        if (vehicleId) {
          if (vehicleId === 'veh-1' || vehicleId === 'veh-2') {
            return [];
          }
          if (vehicleId.startsWith('veh-')) {
            return this.getCachedRefuelings(vehicleId);
          }

          const cachedVehicles = await this.getCachedVehicles();
          const targetVeh = cachedVehicles.find((v) => v.id === vehicleId);
          const effectiveOwner =
            targetVeh?.isShared && targetVeh.ownerEmail
              ? targetVeh.ownerEmail.toLowerCase().trim()
              : userEmail;

          const subSnap = await withFirestoreTimeout(
            () =>
              getDocs(
                collection(db, 'users', effectiveOwner, 'veiculos', vehicleId, 'abastecimentos')
              ),
            1500
          );
          let list: Refueling[] = subSnap.docs
            .map((d) => {
              const r = mapFirestoreDocToRefueling(d.id, { ...d.data(), idVeiculo: vehicleId });
              if (isDemoRecord(r)) {
                withFirestoreTimeout(
                  () =>
                    deleteDoc(
                      doc(db, 'users', effectiveOwner, 'veiculos', vehicleId, 'abastecimentos', d.id)
                    ),
                  1500
                ).catch(() => {});
              }
              return r;
            })
            .filter((r) => !isDemoRecord(r));

          // Limpa duplicatas no Firestore se existirem
          const { unique: dedupedFsList, duplicateIds: dupFsIds } = deduplicateRefuelings(list);
          list = dedupedFsList;
          if (dupFsIds.length > 0) {
            for (const dupId of dupFsIds) {
              withFirestoreTimeout(
                () =>
                  deleteDoc(
                    doc(db, 'users', effectiveOwner, 'veiculos', vehicleId, 'abastecimentos', dupId)
                  ),
                1500
              ).catch(() => {});
            }
          }

          // PRESERVAÇÃO DE DADOS OFFLINE: mescla abastecimentos pendentes sem perder nenhum dado local
          const pendingAddsForVeh = allPendingAdds.filter((r) => r.vehicleId === vehicleId);
          for (const pa of pendingAddsForVeh) {
            const paFp = getRefuelingFingerprint(pa);
            const alreadyInList = list.some(
              (r) => r.id === pa.id || getRefuelingFingerprint(r) === paFp
            );
            if (!alreadyInList) {
              list.unshift(pa);
            } else {
              SyncService.removeByEntityId(pa.id).catch(() => {});
            }
          }

          const sortedFull = sortRefuelingsDesc(deduplicateRefuelings(list).unique);

          // Atualiza totalizadores completos do veículo a partir da lista completa + offline
          await this.updateVehicleTotalizers(vehicleId, userEmail, sortedFull);

          // Mantém no cache do aparelho apenas os 5 últimos abastecimentos deste veículo
          const cachedFive = limitRefuelingsPerVehicleForCache(sortedFull, pendingIds);
          await AsyncStorage.setItem(
            STORAGE_KEYS.REFUELINGS + '_' + vehicleId,
            JSON.stringify(cachedFive)
          );

          // Atualiza também a fatia deste veículo no cache geral REFUELINGS
          try {
            const allCachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.REFUELINGS);
            const allCached: Refueling[] = allCachedRaw ? JSON.parse(allCachedRaw) : [];
            const others = allCached.filter((r) => r.vehicleId !== vehicleId);
            const mergedCache = limitRefuelingsPerVehicleForCache(
              [...others, ...cachedFive],
              pendingIds
            );
            await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(mergedCache));
          } catch {}

          return sortedFull;
        } else {
          // Busca agregada paralela de todos os veículos
          const vehicles = await this.getCachedVehicles();
          const results = await Promise.all(
            vehicles.map(async (v) => {
              if (v.id.startsWith('veh-')) {
                return this.getCachedRefuelings(v.id);
              }
              const effectiveOwner =
                v.isShared && v.ownerEmail ? v.ownerEmail.toLowerCase().trim() : userEmail;
              try {
                const subSnap = await withFirestoreTimeout(
                  () =>
                    getDocs(
                      collection(db, 'users', effectiveOwner, 'veiculos', v.id, 'abastecimentos')
                    ),
                  1500
                );
                let vList = subSnap.docs.map((d) =>
                  mapFirestoreDocToRefueling(d.id, { ...d.data(), idVeiculo: v.id })
                );
                const { unique: dedupedVList, duplicateIds: dupVIds } = deduplicateRefuelings(vList);
                vList = dedupedVList;
                if (dupVIds.length > 0) {
                  for (const dupId of dupVIds) {
                    withFirestoreTimeout(
                      () =>
                        deleteDoc(
                          doc(db, 'users', effectiveOwner, 'veiculos', v.id, 'abastecimentos', dupId)
                        ),
                      1500
                    ).catch(() => {});
                  }
                }

                const pendingForV = allPendingAdds.filter((r) => r.vehicleId === v.id);
                for (const pa of pendingForV) {
                  const paFp = getRefuelingFingerprint(pa);
                  const alreadyInList = vList.some(
                    (r) => r.id === pa.id || getRefuelingFingerprint(r) === paFp
                  );
                  if (!alreadyInList) {
                    vList.unshift(pa);
                  } else {
                    SyncService.removeByEntityId(pa.id).catch(() => {});
                  }
                }
                const sortedVFull = sortRefuelingsDesc(deduplicateRefuelings(vList).unique);
                await this.updateVehicleTotalizers(v.id, effectiveOwner, sortedVFull);

                const cachedFive = limitRefuelingsPerVehicleForCache(sortedVFull, pendingIds);
                await AsyncStorage.setItem(
                  STORAGE_KEYS.REFUELINGS + '_' + v.id,
                  JSON.stringify(cachedFive)
                );
                return sortedVFull;
              } catch {
                return this.getCachedRefuelings(v.id);
              }
            })
          );

          let allList: Refueling[] = results.flat();
          for (const pa of allPendingAdds) {
            const paFp = getRefuelingFingerprint(pa);
            const alreadyInList = allList.some(
              (r) => r.id === pa.id || getRefuelingFingerprint(r) === paFp
            );
            if (!alreadyInList) {
              allList.unshift(pa);
            } else {
              SyncService.removeByEntityId(pa.id).catch(() => {});
            }
          }

          const sortedAllFull = sortRefuelingsDesc(deduplicateRefuelings(allList).unique);
          const cachedFiveAll = limitRefuelingsPerVehicleForCache(sortedAllFull, pendingIds);
          await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(cachedFiveAll));
          return sortedAllFull;
        }
      } catch (error) {
        console.warn('Offline: usando cache local de abastecimentos (5 últimos por veículo):', error);
      }
    }

    return this.getCachedRefuelings(vehicleId);
  },

  async addRefueling(refueling: Refueling): Promise<Refueling> {
    const userEmail = auth.currentUser?.email;
    // Lê imediatamente do cache local para não bloquear em chamadas de rede
    const vehicles = await this.getCachedVehicles();
    const vehicle = vehicles.find((v) => v.id === refueling.vehicleId);
    const existingRefuelings = await this.getCachedRefuelings(refueling.vehicleId);

    const prev = existingRefuelings
      .filter((r) => r.odometer < refueling.odometer)
      .sort((a, b) => b.odometer - a.odometer)[0];
    const kmAntigo = prev ? prev.odometer : vehicle ? vehicle.currentOdometer : refueling.odometer;

    let distanceTraveled: number | undefined;
    let consumptionKmPerLiter: number | undefined;
    let costPerKm: number | undefined;

    if (kmAntigo != null && refueling.odometer > kmAntigo && refueling.liters > 0) {
      distanceTraveled = refueling.odometer - kmAntigo;
      if (refueling.isFullTank) {
        consumptionKmPerLiter = Number((distanceTraveled / refueling.liters).toFixed(2));
      }
      costPerKm = Number((refueling.totalAmount / distanceTraveled).toFixed(2));
    }

    const tempId =
      refueling.id || `ref-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const userAttribution = getCurrentUserAttribution();
    const calculatedRefueling: Refueling = {
      ...refueling,
      id: tempId,
      plate: vehicle?.plate || refueling.plate,
      previousOdometer: kmAntigo,
      distanceTraveled,
      consumptionKmPerLiter,
      costPerKm,
      registeredBy: refueling.registeredBy || userAttribution,
    };

    // 1. Calcula imediatamente os novos totalizadores do veículo (preservando histórico > 5 itens)
    if (vehicle) {
      if (refueling.odometer >= vehicle.currentOdometer) {
        vehicle.currentOdometer = refueling.odometer;
      }

      const prevCount = vehicle.qtdAbastecimentos ?? existingRefuelings.length;
      const hadMoreThanCached = prevCount > existingRefuelings.length;

      if (hadMoreThanCached) {
        const newCount = prevCount + 1;
        vehicle.totalGastoAbast = Number(
          ((vehicle.totalGastoAbast || 0) + Number(calculatedRefueling.totalAmount || 0)).toFixed(2)
        );
        vehicle.totalLitrosAbast = Number(
          ((vehicle.totalLitrosAbast || 0) + Number(calculatedRefueling.liters || 0)).toFixed(2)
        );
        if (
          consumptionKmPerLiter &&
          consumptionKmPerLiter > 0 &&
          consumptionKmPerLiter < 50
        ) {
          const prevAvg = vehicle.mediaGeralKmPorLitro || 0;
          vehicle.mediaGeralKmPorLitro =
            prevAvg > 0
              ? Number(((prevAvg * prevCount + consumptionKmPerLiter) / newCount).toFixed(2))
              : consumptionKmPerLiter;
        }
        if (costPerKm && costPerKm > 0) {
          const prevCost = vehicle.custoMedioPorKm || 0;
          vehicle.custoMedioPorKm =
            prevCost > 0
              ? Number(((prevCost * prevCount + costPerKm) / newCount).toFixed(2))
              : costPerKm;
        }
        vehicle.qtdAbastecimentos = newCount;
      } else {
        const updatedList = [
          calculatedRefueling,
          ...existingRefuelings.filter((r) => r.id !== calculatedRefueling.id),
        ];
        let totalGasto = 0;
        let totalLitros = 0;
        const validConsumptions: number[] = [];
        const validCosts: number[] = [];
        updatedList.forEach((r) => {
          totalGasto += Number(r.totalAmount || 0);
          totalLitros += Number(r.liters || 0);
          if (r.consumptionKmPerLiter && r.consumptionKmPerLiter > 0 && r.consumptionKmPerLiter < 50) {
            validConsumptions.push(r.consumptionKmPerLiter);
          }
          if (r.costPerKm && r.costPerKm > 0) {
            validCosts.push(r.costPerKm);
          }
        });
        vehicle.totalGastoAbast = Number(totalGasto.toFixed(2));
        vehicle.totalLitrosAbast = Number(totalLitros.toFixed(2));
        vehicle.mediaGeralKmPorLitro =
          validConsumptions.length > 0
            ? Number(
                (
                  validConsumptions.reduce((a, b) => a + b, 0) / validConsumptions.length
                ).toFixed(2)
              )
            : vehicle.mediaGeralKmPorLitro || 0;
        vehicle.custoMedioPorKm =
          validCosts.length > 0
            ? Number((validCosts.reduce((a, b) => a + b, 0) / validCosts.length).toFixed(2))
            : vehicle.custoMedioPorKm || 0;
        vehicle.qtdAbastecimentos = updatedList.length;
      }

      await saveVehicleTotalizersToCacheMap(vehicle.id, {
        totalGastoAbast: vehicle.totalGastoAbast || 0,
        totalLitrosAbast: vehicle.totalLitrosAbast || 0,
        mediaGeralKmPorLitro: vehicle.mediaGeralKmPorLitro || 0,
        custoMedioPorKm: vehicle.custoMedioPorKm || 0,
        qtdAbastecimentos: vehicle.qtdAbastecimentos || 0,
        gastoManutencao: vehicle.gastoManutencao || 0,
        qtdManutencoes: vehicle.qtdManutencoes || 0,
        updatedAt: new Date().toISOString(),
      });
    }

    // 2. Gravação Online com proteção total contra mutações duplicadas:
    // NUNCA chama batch.commit() no Firestore se estiver offline (evita acúmulo duplo na fila interna do SDK)
    let savedOnline = false;
    const isOnline = await checkOnlineStatus();

    if (isOnline && userEmail && refueling.vehicleId && !refueling.vehicleId.startsWith('veh-')) {
      try {
        const rawComb =
          refueling.fuelType === 'etanol'
            ? 'Etanol'
            : refueling.fuelType === 'diesel'
            ? 'Diesel'
            : refueling.fuelType === 'gnv'
            ? 'GNV'
            : 'Gasolina';

        const effectiveOwner =
          vehicle?.isShared && vehicle.ownerEmail
            ? vehicle.ownerEmail.toLowerCase().trim()
            : userEmail;

        const firestoreData: Record<string, unknown> = {
          idVeiculo: vehicle?.id || refueling.vehicleId,
          placa: vehicle?.plate || refueling.plate || '',
          data: refueling.date,
          combustivel: rawComb,
          kmAntigo: kmAntigo,
          kmAtual: refueling.odometer,
          qdtAbastecida: refueling.liters,
          valorLitro: refueling.pricePerLiter,
          totalAmount: refueling.totalAmount,
          media: consumptionKmPerLiter || 0,
          seTanqueCheio: refueling.isFullTank,
          seAditivado: Boolean(refueling.isAdditivated),
          observacao: refueling.notes || refueling.gasStation || '',
          registradoPor: calculatedRefueling.registeredBy || userAttribution,
        };

        const batch = writeBatch(db);
        const subColRef = collection(
          db,
          'users',
          effectiveOwner,
          'veiculos',
          refueling.vehicleId,
          'abastecimentos'
        );
        // Usa ID idempotente para evitar criar documentos diferentes com o mesmo abastecimento
        const targetDoc = doc(subColRef, calculatedRefueling.id);
        batch.set(targetDoc, firestoreData, { merge: true });

        if (vehicle) {
          const vehicleDocRef = doc(db, 'users', effectiveOwner, 'veiculos', refueling.vehicleId);
          batch.set(
            vehicleDocRef,
            {
              kmAtual: vehicle.currentOdometer,
              ultimoKm: vehicle.currentOdometer,
              ultimoComb: rawComb,
              totalGastoAbast: vehicle.totalGastoAbast,
              totalLitrosAbast: vehicle.totalLitrosAbast,
              mediaGeralKmPorLitro: vehicle.mediaGeralKmPorLitro,
              custoMedioPorKm: vehicle.custoMedioPorKm,
              qtdAbastecimentos: vehicle.qtdAbastecimentos,
            },
            { merge: true }
          );
        }

        await withFirestoreTimeout(() => batch.commit(), 1500);
        savedOnline = true;
        await SyncService.removeByEntityId(tempId);
        await SyncService.removeByEntityId(calculatedRefueling.id);
      } catch (err) {
        console.warn('Offline/Timeout: Abastecimento salvo localmente e enfileirado para sincronização:', err);
      }
    }

    if (userEmail && !savedOnline) {
      await SyncService.enqueue('ADD_REFUELING', calculatedRefueling.id, calculatedRefueling);
    }

    // 3. Atualiza cache local mantendo os 5 últimos abastecimentos do veículo
    const queue = await SyncService.getQueue();
    const pendingRefIds = new Set(
      queue.filter((q) => q.action === 'ADD_REFUELING').map((q) => q.entityId)
    );

    const vehicleKey = STORAGE_KEYS.REFUELINGS + '_' + refueling.vehicleId;
    const updatedForVeh = limitRefuelingsPerVehicleForCache(
      [
        calculatedRefueling,
        ...existingRefuelings.filter((r) => r.id !== calculatedRefueling.id && r.id !== tempId),
      ],
      pendingRefIds
    );
    await AsyncStorage.setItem(vehicleKey, JSON.stringify(updatedForVeh));

    const allCached = await this.getCachedRefuelings();
    const updatedAll = limitRefuelingsPerVehicleForCache(
      [
        calculatedRefueling,
        ...allCached.filter((r) => r.id !== calculatedRefueling.id && r.id !== tempId),
      ],
      pendingRefIds
    );
    await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(updatedAll));

    if (vehicle) {
      const vIdx = vehicles.findIndex((v) => v.id === vehicle.id);
      if (vIdx >= 0) {
        vehicles[vIdx] = vehicle;
        await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
      }
    }

    // Atualiza preço de combustível sem bloquear a resposta ao usuário
    this.saveLatestFuelPrice(refueling.fuelType, refueling.pricePerLiter).catch(() => {});
    this.notifyMaintenanceChange();

    return calculatedRefueling;
  },

  async deleteRefueling(id: string, vehicleId?: string): Promise<void> {
    const userEmail = auth.currentUser?.email;
    const online = await checkOnlineStatus(true);
    if (!online) {
      throw new Error(
        'Não é possível excluir abastecimentos do banco de dados enquanto estiver offline. Conecte-se à internet e tente novamente.'
      );
    }

    const all = await this.getCachedRefuelings();
    const itemToDelete = all.find((r) => r.id === id);
    const effectiveVehId = vehicleId || itemToDelete?.vehicleId;
    const cachedVehicles = await this.getCachedVehicles();
    const targetVeh = cachedVehicles.find((v) => v.id === effectiveVehId);
    const effectiveOwner =
      targetVeh?.isShared && targetVeh.ownerEmail
        ? targetVeh.ownerEmail.toLowerCase().trim()
        : userEmail;

    if (effectiveOwner && effectiveVehId) {
      await withFirestoreTimeout(
        () =>
          deleteDoc(
            doc(db, 'users', effectiveOwner, 'veiculos', effectiveVehId, 'abastecimentos', id)
          ),
        2000
      ).catch(() => {});
      await SyncService.removeByEntityId(id);

      try {
        await withFirestoreTimeout(
          () => deleteDoc(doc(db, 'users', effectiveOwner, 'medias', id)),
          1000
        );
      } catch {}
    } else {
      await SyncService.removeByEntityId(id);
    }

    if (effectiveVehId) {
      // Recarrega do Firestore para atualizar os 5 últimos e recalcular totalizadores reais
      await this.getRefuelings(effectiveVehId);
    } else {
      const remaining = all.filter((r) => r.id !== id);
      await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(remaining));
    }
    this.notifyMaintenanceChange();
  },

  // MANUTENÇÕES
  async getMaintenances(vehicleId?: string): Promise<MaintenanceItem[]> {
    const userEmail = auth.currentUser?.email;
    if (userEmail) {
      try {
        const cachedVehicles = await this.getCachedVehicles();
        const targetVeh = vehicleId ? cachedVehicles.find((v) => v.id === vehicleId) : undefined;
        const sharedVehicles = cachedVehicles.filter((v) => v.isShared && v.ownerEmail);

        let list: MaintenanceItem[] = [];

        if (targetVeh?.isShared && targetVeh.ownerEmail) {
          const ownerKey = targetVeh.ownerEmail.toLowerCase().trim();
          const snap = await withFirestoreTimeout(
            () => getDocs(collection(db, 'users', ownerKey, 'manutencoes')),
            3000
          );
          list = snap.docs
            .map((d) => mapFirestoreDocToMaintenance(d.id, d.data()))
            .filter((m) => m.vehicleId === vehicleId && !isDemoRecord(m));
        } else {
          const snap = await withFirestoreTimeout(
            () => getDocs(collection(db, 'users', userEmail, 'manutencoes')),
            3000
          );
          list = snap.docs
            .map((d) => {
              const m = mapFirestoreDocToMaintenance(d.id, d.data());
              if (isDemoRecord(m)) {
                withFirestoreTimeout(
                  () => deleteDoc(doc(db, 'users', userEmail, 'manutencoes', d.id)),
                  1500
                ).catch(() => {});
              }
              return m;
            })
            .filter((m) => !isDemoRecord(m));

          if (!vehicleId && sharedVehicles.length > 0) {
            for (const sv of sharedVehicles) {
              if (!sv.ownerEmail) continue;
              try {
                const sSnap = await withFirestoreTimeout(
                  () =>
                    getDocs(
                      collection(db, 'users', sv.ownerEmail!.toLowerCase().trim(), 'manutencoes')
                    ),
                  2000
                );
                const sList = sSnap.docs
                  .map((d) => mapFirestoreDocToMaintenance(d.id, d.data()))
                  .filter((m) => m.vehicleId === sv.id && !isDemoRecord(m));
                list.push(...sList);
              } catch {}
            }
          }
        }

        // Limpa duplicatas no Firestore se existirem
        const { unique: dedupedFsMnts, duplicateIds: dupFsMntIds } = deduplicateMaintenances(list);
        list = dedupedFsMnts;
        if (dupFsMntIds.length > 0) {
          for (const dId of dupFsMntIds) {
            withFirestoreTimeout(
              () => deleteDoc(doc(db, 'users', userEmail, 'manutencoes', dId)),
              1500
            ).catch(() => {});
          }
        }

        const queue = await SyncService.getQueue();
        const userKey = userEmail.toLowerCase().trim();
        const pendingAdds = queue
          .filter((q) => q.action === 'ADD_MAINTENANCE' && q.userEmail === userKey)
          .map((q) => q.payload as MaintenanceItem)
          .filter((m) => !isDemoRecord(m));
        const pendingIds = new Set(pendingAdds.map((m) => m.id));

        for (const pa of pendingAdds) {
          const paFp = getMaintenanceFingerprint(pa);
          const existingIdx = list.findIndex(
            (m) => m.id === pa.id || getMaintenanceFingerprint(m) === paFp
          );
          if (existingIdx === -1) {
            list.unshift(pa);
          } else {
            const existing = list[existingIdx];
            list[existingIdx] = {
              ...existing,
              ...pa,
              id: existing.id || pa.id,
              receiptUrl: pa.receiptUrl || existing.receiptUrl,
              notes: pa.notes || existing.notes,
            };
            const fsHasReceipt = Boolean(existing.receiptUrl);
            const paHasReceipt = Boolean(pa.receiptUrl);
            if (!paHasReceipt || fsHasReceipt) {
              SyncService.removeByEntityId(pa.id).catch(() => {});
            }
          }
        }

        const sortedAllFull = sortMaintenancesDesc(deduplicateMaintenances(list).unique);
        const cachedFiveAll = limitMaintenancesPerVehicleForCache(sortedAllFull, pendingIds);
        await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(cachedFiveAll));

        // Atualiza cache individual (5 últimas por veículo) e totalizadores de manutenção
        try {
          const vList = await this.getCachedVehicles();
          for (const v of vList) {
            const forVFull = sortedAllFull.filter((m) => m.vehicleId === v.id);
            const forVFive = limitMaintenancesPerVehicleForCache(forVFull, pendingIds);
            await AsyncStorage.setItem(
              STORAGE_KEYS.MAINTENANCES + '_' + v.id,
              JSON.stringify(forVFive)
            );
            await this.updateVehicleTotalizers(v.id, userEmail, undefined, forVFull);
          }
        } catch {}

        if (vehicleId) {
          return sortedAllFull.filter((m) => m.vehicleId === vehicleId);
        }
        return sortedAllFull;
      } catch (err) {
        console.warn('Offline: usando cache local de manutenções (5 últimas por veículo):', err);
      }
    }

    return this.getCachedMaintenances(vehicleId);
  },

  async addMaintenance(maintenance: MaintenanceItem): Promise<MaintenanceItem> {
    const userEmail = auth.currentUser?.email;
    const vehicles = await this.getCachedVehicles();
    const vehicle = vehicles.find((v) => v.id === maintenance.vehicleId);
    const existingMaintenances = await this.getCachedMaintenances(maintenance.vehicleId);

    const tempId =
      maintenance.id || `mnt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const userAttribution = getCurrentUserAttribution();
    const calculatedMnt: MaintenanceItem = {
      ...maintenance,
      id: tempId,
      registeredBy: maintenance.registeredBy || userAttribution,
    };

    // 1. Atualiza imediatamente o veículo e seus totalizadores (funciona 100% offline e online)
    const vehUpdates: Record<string, unknown> = {};
    if (vehicle) {
      const isExisting = existingMaintenances.some((m) => m.id === calculatedMnt.id);
      const prevMntCount = vehicle.qtdManutencoes ?? existingMaintenances.length;
      const hadMoreThanCached = prevMntCount > existingMaintenances.length;

      if (isExisting) {
        const oldItem = existingMaintenances.find((m) => m.id === calculatedMnt.id);
        const oldCost = oldItem ? Number(oldItem.cost || 0) : 0;
        const diff = Number(maintenance.cost || 0) - oldCost;
        vehicle.gastoManutencao = Number(
          Math.max(0, (vehicle.gastoManutencao || 0) + diff).toFixed(2)
        );
      } else if (hadMoreThanCached) {
        vehicle.gastoManutencao = Number(
          ((vehicle.gastoManutencao || 0) + Number(maintenance.cost || 0)).toFixed(2)
        );
        vehicle.qtdManutencoes = prevMntCount + 1;
      } else {
        const updatedMnts = [
          calculatedMnt,
          ...existingMaintenances.filter((m) => m.id !== calculatedMnt.id),
        ];
        vehicle.gastoManutencao = Number(
          updatedMnts.reduce((acc, m) => acc + Number(m.cost || 0), 0).toFixed(2)
        );
        vehicle.qtdManutencoes = updatedMnts.length;
      }

      vehUpdates.gastoManutencao = vehicle.gastoManutencao;
      vehUpdates.qtdManutencoes = vehicle.qtdManutencoes;

      if (maintenance.odometer > vehicle.currentOdometer) {
        vehicle.currentOdometer = maintenance.odometer;
        vehUpdates.kmAtual = maintenance.odometer;
        vehUpdates.ultimoKm = maintenance.odometer;
      }

      if (maintenance.category === 'oleo_filtro') {
        vehicle.ultimaTrocaOleoKm = maintenance.odometer;
        const oilInterval = vehicle.trocaOleoKm || (vehicle.vehicleType === 'moto' ? 3000 : 10000);
        vehicle.proxTrocaOleoKm = maintenance.nextDueOdometer || (maintenance.odometer + oilInterval);
        vehUpdates.ultimaTrocaOleoKm = vehicle.ultimaTrocaOleoKm;
        vehUpdates.proxTrocaOleoKm = vehicle.proxTrocaOleoKm;
      } else if (maintenance.category === 'revisao_geral') {
        vehicle.ultimaRevisaoKm = maintenance.odometer;
        const revInterval = vehicle.revisaoKm || (vehicle.vehicleType === 'moto' ? 6000 : 10000);
        const oilInterval = vehicle.trocaOleoKm || (vehicle.vehicleType === 'moto' ? 3000 : 10000);
        vehicle.proxRevKm = maintenance.nextDueOdometer || (maintenance.odometer + revInterval);
        vehicle.ultimaTrocaOleoKm = maintenance.odometer;
        vehicle.proxTrocaOleoKm = maintenance.odometer + oilInterval;
        vehUpdates.ultimaRevisaoKm = vehicle.ultimaRevisaoKm;
        vehUpdates.proxRevKm = vehicle.proxRevKm;
        vehUpdates.ultimaTrocaOleoKm = vehicle.ultimaTrocaOleoKm;
        vehUpdates.proxTrocaOleoKm = vehicle.proxTrocaOleoKm;
      } else if (maintenance.category === 'freios') {
        if (maintenance.side?.includes('DIANT')) {
          vehicle.manFreioDiant = maintenance.odometer;
          vehUpdates.manFreioDiant = maintenance.odometer;
        }
        if (maintenance.side?.includes('TRAS')) {
          vehicle.manFreioTras = maintenance.odometer;
          vehUpdates.manFreioTras = maintenance.odometer;
        }
      } else if (maintenance.category === 'lubrificar_corrente') {
        vehicle.ultimaLubCorrenteKm = maintenance.odometer;
        vehicle.proxLubCorrenteKm =
          maintenance.odometer + (vehicle.lubrificarCorrenteKm || 500);
        vehUpdates.ultimaLubCorrenteKm = vehicle.ultimaLubCorrenteKm;
        vehUpdates.proxLubCorrenteKm = vehicle.proxLubCorrenteKm;
      } else if (maintenance.category === 'esticar_corrente') {
        vehicle.ultimaEsticarCorrenteKm = maintenance.odometer;
        vehicle.proxEsticarCorrenteKm =
          maintenance.odometer + (vehicle.esticarCorrenteKm || 1500);
        vehUpdates.ultimaEsticarCorrenteKm = vehicle.ultimaEsticarCorrenteKm;
        vehUpdates.proxEsticarCorrenteKm = vehicle.proxEsticarCorrenteKm;
      }

      await saveVehicleTotalizersToCacheMap(vehicle.id, {
        totalGastoAbast: vehicle.totalGastoAbast || 0,
        totalLitrosAbast: vehicle.totalLitrosAbast || 0,
        mediaGeralKmPorLitro: vehicle.mediaGeralKmPorLitro || 0,
        custoMedioPorKm: vehicle.custoMedioPorKm || 0,
        qtdAbastecimentos: vehicle.qtdAbastecimentos || 0,
        gastoManutencao: vehicle.gastoManutencao || 0,
        qtdManutencoes: vehicle.qtdManutencoes || 0,
        updatedAt: new Date().toISOString(),
      });
    }

    // 2. Gravação Online com proteção contra mutações duplicadas:
    // NUNCA chama batch.commit() no Firestore se estiver offline
    let savedOnline = false;
    const isOnline = await checkOnlineStatus();

    if (isOnline && userEmail) {
      try {
        const catValMap: Record<string, string> = {
          oleo_filtro: 'TROLEO',
          revisao_geral: 'REVISAO',
          troca_pneus: 'PNEUS',
          pneus: 'PNEUS',
          freios: 'MANFREIO',
          alinhamento_balanceamento: 'ALINHAMENTO',
          rodizio_pneus: 'RODIZIO_PNEUS',
          esticar_corrente: 'ESTICAR_CORRENTE',
          lubrificar_corrente: 'LUBRIFICAR_CORRENTE',
          suspensao: 'MANMOTOR',
          ar_condicionado: 'AR_CONDICIONADO',
          bateria: 'BATERIA',
          documentacao: 'DOCUMENTACAO',
          outros: 'OUTROS',
        };

        const effectiveOwner =
          vehicle?.isShared && vehicle.ownerEmail
            ? vehicle.ownerEmail.toLowerCase().trim()
            : userEmail;

        const firestoreData: Record<string, unknown> = {
          veiculoId: maintenance.vehicleId,
          veiculo: vehicle?.plate || '',
          dataCadastro: maintenance.date,
          kmManutencao: maintenance.odometer,
          tipoManutencaoVal: catValMap[maintenance.category] || maintenance.category,
          tipoManutencao: maintenance.title,
          ladoManutencao: maintenance.side || '',
          descricaoManutencao: maintenance.description || maintenance.workshop || '',
          valorManutencao: maintenance.cost,
          observacoes: maintenance.notes || '',
          receiptUrl: maintenance.receiptUrl || '',
          registradoPor: calculatedMnt.registeredBy || userAttribution,
        };

        const batch = writeBatch(db);
        const mntDocRef = doc(
          collection(db, 'users', effectiveOwner, 'manutencoes'),
          calculatedMnt.id
        );
        batch.set(mntDocRef, firestoreData, { merge: true });

        if (vehicle && !vehicle.id.startsWith('veh-')) {
          const vehicleDocRef = doc(db, 'users', effectiveOwner, 'veiculos', vehicle.id);
          batch.set(vehicleDocRef, vehUpdates, { merge: true });
        }

        const commitTimeout = calculatedMnt.receiptUrl ? 7000 : 3000;
        await withFirestoreTimeout(() => batch.commit(), commitTimeout);
        savedOnline = true;
        await SyncService.removeByEntityId(tempId);
        await SyncService.removeByEntityId(calculatedMnt.id);
      } catch (err) {
        console.warn('Offline/Timeout: Manutenção salva localmente e enfileirada para sincronização:', err);
      }
    }

    if (userEmail && !savedOnline) {
      await SyncService.enqueue('ADD_MAINTENANCE', calculatedMnt.id, calculatedMnt);
    }

    // 3. Atualiza cache local mantendo os 5 últimos registros de manutenção por veículo
    const queue = await SyncService.getQueue();
    const pendingMntIds = new Set(
      queue.filter((q) => q.action === 'ADD_MAINTENANCE').map((q) => q.entityId)
    );

    if (calculatedMnt.vehicleId) {
      const vehicleKey = STORAGE_KEYS.MAINTENANCES + '_' + calculatedMnt.vehicleId;
      const updatedVehMnts = limitMaintenancesPerVehicleForCache(
        [
          calculatedMnt,
          ...existingMaintenances.filter((m) => m.id !== calculatedMnt.id && m.id !== tempId),
        ],
        pendingMntIds
      );
      await AsyncStorage.setItem(vehicleKey, JSON.stringify(updatedVehMnts));
    }

    const allCachedMnts = await this.getCachedMaintenances();
    const updatedAllMnts = limitMaintenancesPerVehicleForCache(
      [
        calculatedMnt,
        ...allCachedMnts.filter((m) => m.id !== calculatedMnt.id && m.id !== tempId),
      ],
      pendingMntIds
    );
    await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(updatedAllMnts));

    if (vehicle) {
      const vIdx = vehicles.findIndex((v) => v.id === vehicle.id);
      if (vIdx >= 0) {
        vehicles[vIdx] = vehicle;
        await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
      }
    }

    this.notifyMaintenanceChange();
    return calculatedMnt;
  },

  async updateMaintenance(maintenance: MaintenanceItem): Promise<MaintenanceItem> {
    return this.addMaintenance(maintenance);
  },

  async deleteMaintenance(id: string): Promise<void> {
    const userEmail = auth.currentUser?.email;
    const online = await checkOnlineStatus(true);
    if (!online) {
      throw new Error(
        'Não é possível excluir registros de manutenção do banco de dados enquanto estiver offline. Conecte-se à internet e tente novamente.'
      );
    }

    const all = await this.getCachedMaintenances();
    const itemToDelete = all.find((m) => m.id === id);
    const vehicleId = itemToDelete?.vehicleId;
    const cachedVehicles = await this.getCachedVehicles();
    const targetVeh = cachedVehicles.find((v) => v.id === vehicleId);
    const effectiveOwner =
      targetVeh?.isShared && targetVeh.ownerEmail
        ? targetVeh.ownerEmail.toLowerCase().trim()
        : userEmail;

    if (effectiveOwner) {
      await withFirestoreTimeout(
        () => deleteDoc(doc(db, 'users', effectiveOwner, 'manutencoes', id)),
        2000
      ).catch(() => {});
      await SyncService.removeByEntityId(id);
    } else {
      await SyncService.removeByEntityId(id);
    }

    // Recarrega do Firestore para atualizar as 5 últimas e recalcular totalizadores reais
    await this.getMaintenances(vehicleId);
    this.notifyMaintenanceChange();
  },

  // CONFIGURAÇÃO DA PERIODICIDADE DAS MANUTENÇÕES DO VEÍCULO (CADASTRO E EDIÇÃO)
  async savePeriodicMaintenanceConfig(
    vehicleId: string,
    config: {
      revisaoKm: number;
      revisaoMes: number;
      trocaOleoKm: number;
      trocaOleoMeses: number;
      ultimaRevisaoKm: number;
      ultimaTrocaOleoKm: number;
      lubrificarCorrenteKm?: number;
      ultimaLubCorrenteKm?: number;
      esticarCorrenteKm?: number;
      ultimaEsticarCorrenteKm?: number;
    }
  ): Promise<Vehicle | null> {
    const userEmail = auth.currentUser?.email;
    const vehicles = await this.getCachedVehicles();
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return null;

    let proxRev = config.ultimaRevisaoKm;
    if (config.ultimaRevisaoKm >= config.revisaoKm) {
      while (proxRev <= config.ultimaRevisaoKm) {
        proxRev += config.revisaoKm;
      }
    } else {
      proxRev = config.revisaoKm;
    }

    const proxTrocaOleo = config.ultimaTrocaOleoKm + config.trocaOleoKm;

    vehicle.cadManPeriodica = true;
    vehicle.revisaoKm = config.revisaoKm;
    vehicle.revisaoMes = config.revisaoMes;
    vehicle.trocaOleoKm = config.trocaOleoKm;
    vehicle.trocaOleoMeses = config.trocaOleoMeses;
    vehicle.ultimaRevisaoKm = config.ultimaRevisaoKm;
    vehicle.ultimaTrocaOleoKm = config.ultimaTrocaOleoKm;
    vehicle.proxRevKm = proxRev;
    vehicle.proxTrocaOleoKm = proxTrocaOleo;

    const firestoreUpdates: Record<string, unknown> = {
      cadManPeriodica: true,
      revisaoKm: config.revisaoKm,
      revisaoMes: config.revisaoMes,
      trocaOleoKm: config.trocaOleoKm,
      trocaOleoMeses: config.trocaOleoMeses,
      ultimaRevisaoKm: config.ultimaRevisaoKm,
      ultimaTrocaOleoKm: config.ultimaTrocaOleoKm,
      proxRevKm: proxRev,
      proxTrocaOleoKm: proxTrocaOleo,
    };

    if (vehicle.vehicleType === 'moto') {
      if (config.lubrificarCorrenteKm && config.lubrificarCorrenteKm > 0) {
        const uLub = config.ultimaLubCorrenteKm ?? vehicle.currentOdometer;
        const pLub = uLub + config.lubrificarCorrenteKm;
        vehicle.lubrificarCorrenteKm = config.lubrificarCorrenteKm;
        vehicle.ultimaLubCorrenteKm = uLub;
        vehicle.proxLubCorrenteKm = pLub;
        firestoreUpdates.lubrificarCorrenteKm = config.lubrificarCorrenteKm;
        firestoreUpdates.ultimaLubCorrenteKm = uLub;
        firestoreUpdates.proxLubCorrenteKm = pLub;
      }
      if (config.esticarCorrenteKm && config.esticarCorrenteKm > 0) {
        const uEst = config.ultimaEsticarCorrenteKm ?? vehicle.currentOdometer;
        const pEst = uEst + config.esticarCorrenteKm;
        vehicle.esticarCorrenteKm = config.esticarCorrenteKm;
        vehicle.ultimaEsticarCorrenteKm = uEst;
        vehicle.proxEsticarCorrenteKm = pEst;
        firestoreUpdates.esticarCorrenteKm = config.esticarCorrenteKm;
        firestoreUpdates.ultimaEsticarCorrenteKm = uEst;
        firestoreUpdates.proxEsticarCorrenteKm = pEst;
      }
    }

    let savedOnline = false;
    const isOnline = await checkOnlineStatus();
    if (isOnline && userEmail && !vehicle.id.startsWith('veh-')) {
      try {
        const currentList = await this.getCachedVehicles();
        if (!currentList.some((v) => v.id === vehicle.id)) {
          return vehicle;
        }

        await withFirestoreTimeout(
          () =>
            setDoc(doc(db, 'users', userEmail, 'veiculos', vehicle.id), firestoreUpdates, {
              merge: true,
            }),
          1500
        );
        savedOnline = true;
      } catch (err) {
        console.warn(
          'Offline: Falha ao salvar periodicidade de manutenção no Firestore, enfileirando:',
          err
        );
      }
    }

    if (userEmail && !savedOnline) {
      await SyncService.enqueue('SAVE_PERIODIC_CONFIG', vehicle.id, {
        vehicleId: vehicle.id,
        config: firestoreUpdates,
      });
    }

    const vIdx = vehicles.findIndex((v) => v.id === vehicle.id);
    if (vIdx >= 0) {
      vehicles[vIdx] = vehicle;
      await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
    }
    this.notifyMaintenanceChange();
    return vehicle;
  },

  // PREÇOS PRATICADOS DE COMBUSTÍVEIS (DOC INDEPENDENTE DO VEÍCULO)
  async getLatestFuelPrices(): Promise<FuelPrices> {
    const defaults: FuelPrices = {
      gasolina: 5.89,
      etanol: 3.89,
      diesel: 6.09,
      gnv: 4.79,
    };

    const userEmail = auth.currentUser?.email;

    // Se houver preço de combustível editado/registrado offline na fila, NUNCA deixa o Firestore sobrepor
    try {
      const queue = await SyncService.getQueue();
      const hasPendingFuelPrices = queue.some((q) => q.action === 'SAVE_FUEL_PRICES');
      if (hasPendingFuelPrices) {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.FUEL_PRICES);
        if (cached) {
          return JSON.parse(cached);
        }
      }
    } catch {}

    if (userEmail) {
      try {
        const docRef = doc(db, 'users', userEmail, 'configuracoes', 'precosCombustivel');
        const snap = await withFirestoreTimeout(() => getDoc(docRef), 1500);
        if (snap.exists()) {
          const data = snap.data();
          const prices: FuelPrices = {
            gasolina: Number(data.gasolina) || defaults.gasolina,
            etanol: Number(data.etanol) || defaults.etanol,
            diesel: Number(data.diesel) || defaults.diesel,
            gnv: Number(data.gnv) || defaults.gnv,
            updatedAt: (data.atualizadoEm as string) || (data.updatedAt as string) || undefined,
          };
          await AsyncStorage.setItem(STORAGE_KEYS.FUEL_PRICES, JSON.stringify(prices));
          return prices;
        }
      } catch (err) {
        console.warn('Offline: usando precosCombustivel do cache local:', err);
      }
    }

    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.FUEL_PRICES);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}

    try {
      const allRefs = await this.getCachedRefuelings();
      if (allRefs.length > 0) {
        const sorted = sortRefuelingsDesc(allRefs);
        const lastGas = sorted.find((r) => r.fuelType === 'gasolina' && r.pricePerLiter > 0);
        const lastEta = sorted.find((r) => r.fuelType === 'etanol' && r.pricePerLiter > 0);
        const lastDie = sorted.find((r) => r.fuelType === 'diesel' && r.pricePerLiter > 0);
        const lastGnv = sorted.find((r) => r.fuelType === 'gnv' && r.pricePerLiter > 0);

        const prices: FuelPrices = {
          gasolina: lastGas ? lastGas.pricePerLiter : defaults.gasolina,
          etanol: lastEta ? lastEta.pricePerLiter : defaults.etanol,
          diesel: lastDie ? lastDie.pricePerLiter : defaults.diesel,
          gnv: lastGnv ? lastGnv.pricePerLiter : defaults.gnv,
          updatedAt: new Date().toISOString(),
        };

        await AsyncStorage.setItem(STORAGE_KEYS.FUEL_PRICES, JSON.stringify(prices));
        return prices;
      }
    } catch (err) {
      console.warn('Erro ao derivar precosCombustivel do histórico:', err);
    }

    return defaults;
  },

  async saveFuelPrices(prices: Partial<FuelPrices>): Promise<void> {
    const defaults: FuelPrices = {
      gasolina: 5.89,
      etanol: 3.89,
      diesel: 6.09,
      gnv: 4.79,
    };
    let current: FuelPrices = defaults;
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.FUEL_PRICES);
      if (cached) current = JSON.parse(cached);
    } catch {}

    const updated: FuelPrices = {
      ...current,
      ...prices,
      updatedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(STORAGE_KEYS.FUEL_PRICES, JSON.stringify(updated));

    let savedOnline = false;
    const isOnline = await checkOnlineStatus();
    const userEmail = auth.currentUser?.email;
    if (isOnline && userEmail) {
      try {
        const docRef = doc(db, 'users', userEmail, 'configuracoes', 'precosCombustivel');
        await withFirestoreTimeout(
          () =>
            setDoc(
              docRef,
              {
                gasolina: updated.gasolina,
                etanol: updated.etanol,
                diesel: updated.diesel,
                gnv: updated.gnv,
                atualizadoEm: updated.updatedAt,
              },
              { merge: true }
            ),
          1500
        );
        savedOnline = true;
      } catch (err) {
        console.warn('Offline: Falha ao salvar precosCombustivel no Firestore, enfileirando:', err);
      }
    }

    if (userEmail && !savedOnline) {
      await SyncService.enqueue('SAVE_FUEL_PRICES', 'fuelPrices', { prices: updated });
    }
  },

  async saveLatestFuelPrice(fuelType: FuelType, price: number): Promise<void> {
    if (!price || price <= 0) return;
    const fuelFieldMap: Partial<Record<FuelType, keyof FuelPrices>> = {
      gasolina: 'gasolina',
      etanol: 'etanol',
      diesel: 'diesel',
      gnv: 'gnv',
    };
    const field = fuelFieldMap[fuelType];
    if (field) {
      await this.saveFuelPrices({ [field]: price });
    }
  },

  /**
   * Exclui definitivamente todos os dados do usuário no Firestore, Firebase Storage e armazenamento local.
   * Bloqueado caso o dispositivo esteja offline.
   */
  async deleteAllUserData(userEmail: string): Promise<void> {
    const online = await checkOnlineStatus(true);
    if (!online) {
      throw new Error(
        'Não é possível excluir os dados do banco de dados enquanto estiver offline. Conecte-se à internet e tente novamente.'
      );
    }

    const emailKey = userEmail.toLowerCase().trim();

    // 1. Exclui veículos e suas subcoleções de abastecimentos no Firestore
    try {
      const vehSnap = await withFirestoreTimeout(
        () => getDocs(collection(db, 'users', emailKey, 'veiculos')),
        3000
      );
      for (const vehDoc of vehSnap.docs) {
        try {
          const abastSnap = await withFirestoreTimeout(
            () =>
              getDocs(collection(db, 'users', emailKey, 'veiculos', vehDoc.id, 'abastecimentos')),
            3000
          );
          const deleteAbastPromises = abastSnap.docs.map((aDoc) => deleteDoc(aDoc.ref));
          await Promise.all(deleteAbastPromises);
        } catch (e) {
          console.warn('Erro ao excluir subcoleção de abastecimentos:', e);
        }
        await deleteDoc(vehDoc.ref);
      }
    } catch (e) {
      console.warn('Erro ao excluir veículos do Firestore:', e);
    }

    // 2. Exclui manutenções do Firestore
    try {
      const maintSnap = await withFirestoreTimeout(
        () => getDocs(collection(db, 'users', emailKey, 'manutencoes')),
        3000
      );
      const deleteMaintPromises = maintSnap.docs.map((mDoc) => deleteDoc(mDoc.ref));
      await Promise.all(deleteMaintPromises);
    } catch (e) {
      console.warn('Erro ao excluir manutenções do Firestore:', e);
    }

    // 3. Exclui médias legadas do Firestore (se houver)
    try {
      const mediaSnap = await withFirestoreTimeout(
        () => getDocs(collection(db, 'users', emailKey, 'medias')),
        2000
      );
      const deleteMediaPromises = mediaSnap.docs.map((mDoc) => deleteDoc(mDoc.ref));
      await Promise.all(deleteMediaPromises);
    } catch (e) {
      console.warn('Erro ao excluir médias legadas:', e);
    }

    // 4. Exclui configurações do usuário no Firestore
    try {
      const configSnap = await withFirestoreTimeout(
        () => getDocs(collection(db, 'users', emailKey, 'configuracoes')),
        2000
      );
      const deleteConfigPromises = configSnap.docs.map((cDoc) => deleteDoc(cDoc.ref));
      await Promise.all(deleteConfigPromises);
    } catch (e) {
      console.warn('Erro ao excluir configurações do Firestore:', e);
    }

    // 5. Exclui o documento raiz do usuário no Firestore
    try {
      await withFirestoreTimeout(() => deleteDoc(doc(db, 'users', emailKey)), 2000);
    } catch (e) {
      console.warn('Erro ao excluir documento raiz do usuário no Firestore:', e);
    }

    // 6. Exclui foto de perfil do Firebase Storage se existir
    try {
      const avatarStorageRef = storageRef(storage, `users/${emailKey}/avatar.jpg`);
      await deleteObject(avatarStorageRef);
    } catch {}

    // 7. Limpa a fila de sincronização offline
    try {
      await SyncService.clearQueue();
    } catch (e) {
      console.warn('Erro ao limpar fila de sincronização:', e);
    }

    // 8. Limpa todos os dados locais do AsyncStorage
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const contagiroKeys = allKeys.filter((k) => k.startsWith('@contagiro:'));
      if (contagiroKeys.length > 0) {
        await AsyncStorage.multiRemove(contagiroKeys);
      }
    } catch (e) {
      console.warn('Erro ao limpar AsyncStorage:', e);
    }

    // 9. Limpa cache de imagens em disco e memória
    try {
      await ExpoImage.clearMemoryCache();
      await ExpoImage.clearDiskCache();
    } catch (e) {
      console.warn('Erro ao limpar cache de imagens:', e);
    }
  },

  /**
   * Limpa todo o cache de sessão local (veículos, totalizadores, abastecimentos, manutenções).
   * Deve ser chamado no logout, no login de novo usuário e no cadastro para evitar
   * que um usuário visualize dados ou vestígios de contas anteriores ou mocks antigos.
   */
  async clearSessionCache(): Promise<void> {
    try {
      hasPreloadedOfflineData = false;
      isPreloading = false;
      hasCheckedLegacyMedias = false;

      const allKeys = await AsyncStorage.getAllKeys();
      const keysToRemove = allKeys.filter(
        (k) =>
          k.startsWith('@contagiro:vehicles') ||
          k.startsWith('@contagiro:vehicle_') ||
          k.startsWith('@contagiro:refuelings') ||
          k.startsWith('@contagiro:maintenances') ||
          k.startsWith('@contagiro:active_vehicle') ||
          k.startsWith('@contagiro:preferred_vehicle') ||
          k.includes('veh-1') ||
          k.includes('veh-2') ||
          k === STORAGE_KEYS.VEHICLES ||
          k === STORAGE_KEYS.ACTIVE_VEHICLE ||
          k === STORAGE_KEYS.PREFERRED_VEHICLE ||
          k === STORAGE_KEYS.REFUELINGS ||
          k === STORAGE_KEYS.MAINTENANCES ||
          k === STORAGE_KEYS.VEHICLE_TOTALIZERS ||
          k === STORAGE_KEYS.HAS_SEEDED
      );

      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
    } catch (e) {
      console.warn('Aviso: erro ao limpar cache de sessão:', e);
    }
  },

  // RESET / LIMPEZA COMPLETA DE CACHE DE SESSÃO
  async resetDemo(): Promise<void> {
    await this.clearSessionCache();
  },
};
