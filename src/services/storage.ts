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
import { auth, db, storage } from '@/services/firebase';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { Image as ExpoImage } from 'expo-image';
import { Vehicle, Refueling, MaintenanceItem, MaintenanceCategory, FuelType, VehicleType, FuelPrices } from '@/types/vehicle';
import { SyncService } from '@/services/sync-service';
import { compareDatesDesc } from '@/utils/date';

function withTimeout<T>(promise: Promise<T>, timeoutMs = 3500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de rede Firestore')), timeoutMs)
    ),
  ]);
}

export function mapFirestoreDocToVehicle(id: string, data: Record<string, unknown>): Vehicle {
  const brand = (data.marca as string) || '';
  const modelName = (data.modelo as string) || '';
  const fullName = brand && modelName && !modelName.toLowerCase().includes(brand.toLowerCase())
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
  const tankCapacity = Number(data.capacidadeTanque ?? data.tanque ?? data.tankCapacity) || (isMoto ? 14 : 50);

  // Mapeamento dos tipos de combustível aceitos pelo veículo
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
    // Padrão inteligente se não definido: se diesel -> diesel; senão -> flex (gasolina + etanol)
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
    engineDisplacement: data.cilindrada ? Number(data.cilindrada) : undefined,
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
    lubrificarCorrenteKm: data.lubrificarCorrenteKm != null ? Number(data.lubrificarCorrenteKm) : undefined,
    ultimaLubCorrenteKm: data.ultimaLubCorrenteKm != null ? Number(data.ultimaLubCorrenteKm) : undefined,
    proxLubCorrenteKm: data.proxLubCorrenteKm != null ? Number(data.proxLubCorrenteKm) : undefined,
    esticarCorrenteKm: data.esticarCorrenteKm != null ? Number(data.esticarCorrenteKm) : undefined,
    ultimaEsticarCorrenteKm: data.ultimaEsticarCorrenteKm != null ? Number(data.ultimaEsticarCorrenteKm) : undefined,
    proxEsticarCorrenteKm: data.proxEsticarCorrenteKm != null ? Number(data.proxEsticarCorrenteKm) : undefined,
    totalGastoAbast: data.totalGastoAbast != null ? Number(data.totalGastoAbast) : undefined,
    totalLitrosAbast: data.totalLitrosAbast != null ? Number(data.totalLitrosAbast) : undefined,
    mediaGeralKmPorLitro: data.mediaGeralKmPorLitro != null ? Number(data.mediaGeralKmPorLitro) : undefined,
    custoMedioPorKm: data.custoMedioPorKm != null ? Number(data.custoMedioPorKm) : (data.costPerKm != null ? Number(data.costPerKm) : undefined),
    qtdAbastecimentos: data.qtdAbastecimentos != null ? Number(data.qtdAbastecimentos) : undefined,
    qtdManutencoes: data.qtdManutencoes != null ? Number(data.qtdManutencoes) : undefined,
    order: data.ordem != null ? Number(data.ordem) : (data.order != null ? Number(data.order) : undefined),
    isPreferred: Boolean(data.preferido ?? data.isPreferred),
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
  const totalAmount = data.totalAmount != null ? Number(data.totalAmount) : (liters * pricePerLiter);
  const odometer = Number(data.kmAtual ?? data.odometer ?? 0);
  const kmAntigo = data.kmAntigo != null ? Number(data.kmAntigo) : undefined;

  const distanceTraveled = (kmAntigo != null && odometer >= kmAntigo)
    ? (odometer - kmAntigo)
    : (data.distanceTraveled ? Number(data.distanceTraveled) : undefined);

  const consumptionKmPerLiter = data.media != null && Number(data.media) > 0
    ? Number(Number(data.media).toFixed(2))
    : (data.consumptionKmPerLiter ? Number(data.consumptionKmPerLiter) : undefined);

  const costPerKm = (distanceTraveled && distanceTraveled > 0 && totalAmount > 0)
    ? Number((totalAmount / distanceTraveled).toFixed(2))
    : (data.costPerKm ? Number(data.costPerKm) : undefined);

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
  };
}

export function mapFirestoreDocToMaintenance(id: string, data: Record<string, unknown>): MaintenanceItem {
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
  const category: MaintenanceCategory = catMap[rawCat] || (rawCat as MaintenanceCategory) || 'outros';
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
  };
}

const STORAGE_KEYS = {
  VEHICLES: '@contagiro:vehicles_v1',
  ACTIVE_VEHICLE: '@contagiro:active_vehicle_id_v1',
  PREFERRED_VEHICLE: '@contagiro:preferred_vehicle_id_v1',
  REFUELINGS: '@contagiro:refuelings_v1',
  MAINTENANCES: '@contagiro:maintenances_v1',
  HAS_SEEDED: '@contagiro:has_seeded_v1',
  FUEL_PRICES: '@contagiro:fuel_prices_v1',
};

// Dados de demonstração realistas para inicialização
const DEMO_VEHICLES: Vehicle[] = [
  {
    id: 'veh-1',
    name: 'Onix Plus Turbo',
    model: 'Chevrolet Onix Plus Premier 1.0 Turbo',
    plate: 'BRA-2E19',
    year: 2023,
    tankCapacity: 44,
    currentOdometer: 38450,
    fuelType: 'gasolina',
    flexEfficiencyRatio: 0.70,
    order: 0,
    isPreferred: true,
  },
  {
    id: 'veh-2',
    name: 'Mobi Drive',
    model: 'Fiat Mobi 1.0 Firefly',
    plate: 'RTO-4A88',
    year: 2021,
    tankCapacity: 47,
    currentOdometer: 62100,
    fuelType: 'etanol',
    flexEfficiencyRatio: 0.72,
    order: 1,
    isPreferred: false,
  },
];

const DEMO_REFUELINGS: Refueling[] = [
  {
    id: 'ref-1',
    vehicleId: 'veh-1',
    date: '2026-10-01',
    odometer: 37520,
    fuelType: 'gasolina',
    pricePerLiter: 5.89,
    totalAmount: 235.60,
    liters: 40.0,
    isFullTank: true,
    gasStation: 'Posto Shell Ipiranga',
    notes: 'Tanque cheio inicial',
  },
  {
    id: 'ref-2',
    vehicleId: 'veh-1',
    date: '2026-10-11',
    odometer: 38000,
    fuelType: 'gasolina',
    pricePerLiter: 5.92,
    totalAmount: 236.80,
    liters: 40.0,
    isFullTank: true,
    gasStation: 'Posto Ipiranga Centro',
    distanceTraveled: 480,
    consumptionKmPerLiter: 12.0,
    costPerKm: 0.49,
    notes: 'Uso 80% cidade / 20% estrada',
  },
  {
    id: 'ref-3',
    vehicleId: 'veh-1',
    date: '2026-10-21',
    odometer: 38450,
    fuelType: 'gasolina',
    pricePerLiter: 5.85,
    totalAmount: 204.75,
    liters: 35.0,
    isFullTank: true,
    gasStation: 'Posto Petrobras BR',
    distanceTraveled: 450,
    consumptionKmPerLiter: 12.86,
    costPerKm: 0.45,
    notes: 'Boa autonomia com ar ligado moderado',
  },
];

const DEMO_MAINTENANCES: MaintenanceItem[] = [
  {
    id: 'mnt-1',
    vehicleId: 'veh-1',
    date: '2026-05-10',
    odometer: 30000,
    category: 'oleo_filtro',
    title: 'Troca de Óleo 5W30 + Filtros (Óleo, Ar, Combustível)',
    workshop: 'Oficina Padrão Bosch',
    cost: 380.00,
    nextDueOdometer: 40000,
    nextDueDate: '2026-11-10',
    isCompleted: true,
  },
  {
    id: 'mnt-2',
    vehicleId: 'veh-1',
    date: '2026-08-15',
    odometer: 34500,
    category: 'suspensao',
    title: 'Alinhamento 3D + Balanceamento 4 Rodas',
    workshop: 'Pneus & Cia',
    cost: 140.00,
    nextDueOdometer: 44500,
    nextDueDate: '2027-02-15',
    isCompleted: true,
  },
  {
    id: 'mnt-3',
    vehicleId: 'veh-1',
    date: '2026-10-15',
    odometer: 38450,
    category: 'freios',
    title: 'Revisão das Pastilhas de Freio Dianteiras',
    workshop: 'Oficina Padrão Bosch',
    cost: 290.00,
    nextDueOdometer: 58000,
    isCompleted: true,
  },
];

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

export const StorageService = {
  // Inicialização de semente e pré-carregamento offline
  async init(): Promise<void> {
    try {
      if (auth.currentUser?.email) {
        if (!hasPreloadedOfflineData && !isPreloading) {
          this.preloadOfflineData().catch((err) => {
            console.warn('Aviso: Erro em preloadOfflineData durante init:', err);
          });
        }
        return;
      }
      const seeded = await AsyncStorage.getItem(STORAGE_KEYS.HAS_SEEDED);
      if (!seeded) {
        await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(DEMO_VEHICLES));
        await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_VEHICLE, DEMO_VEHICLES[0].id);
        await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(DEMO_REFUELINGS));
        await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(DEMO_MAINTENANCES));
        await AsyncStorage.setItem(STORAGE_KEYS.HAS_SEEDED, 'true');
      }
    } catch (e) {
      console.error('Erro ao inicializar StorageService:', e);
    }
  },

  // VEÍCULOS
  async getVehicles(): Promise<Vehicle[]> {
    const userEmail = auth.currentUser?.email;
    if (userEmail) {
      try {
        const querySnapshot = await withTimeout(
          getDocs(collection(db, 'users', userEmail, 'veiculos')),
          3500
        );
        let list: Vehicle[] = [];
        if (!querySnapshot.empty) {
          list = querySnapshot.docs.map((d) =>
            mapFirestoreDocToVehicle(d.id, d.data() as Record<string, unknown>)
          );
        }

        // PRESERVAÇÃO DE DADOS OFFLINE:
        // Mescla veículos criados/editados offline e remove os pendentes de exclusão
        try {
          const queue = await SyncService.getQueue();
          const userKey = userEmail.toLowerCase().trim();
          const pendingSaves = queue
            .filter((q) => q.action === 'SAVE_VEHICLE' && q.userEmail === userKey)
            .map((q) => q.payload as Vehicle);
          const pendingDeletes = new Set(
            queue
              .filter((q) => q.action === 'DELETE_VEHICLE' && q.userEmail === userKey)
              .map((q) => q.entityId)
          );

          list = list.filter((v) => !pendingDeletes.has(v.id));

          for (const pv of pendingSaves) {
            const idx = list.findIndex((v) => v.id === pv.id);
            if (idx >= 0) {
              list[idx] = pv;
            } else {
              list.push(pv);
            }
          }
        } catch (errQueue) {
          console.warn('Aviso: Falha ao mesclar fila de pendências em getVehicles:', errQueue);
        }

        // Preserva ordem, preferência e totalizadores já calculados e em cache local
        try {
          const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
          if (cachedRaw) {
            const cachedList: Vehicle[] = JSON.parse(cachedRaw);
            list = list.map((v) => {
              const prev = cachedList.find((c) => c.id === v.id);
              if (!prev) return v;
              return {
                ...v,
                order: v.order ?? prev.order,
                isPreferred: v.isPreferred ?? prev.isPreferred,
                totalGastoAbast: v.totalGastoAbast ?? prev.totalGastoAbast,
                totalLitrosAbast: v.totalLitrosAbast ?? prev.totalLitrosAbast,
                mediaGeralKmPorLitro: v.mediaGeralKmPorLitro ?? prev.mediaGeralKmPorLitro,
                custoMedioPorKm: v.custoMedioPorKm ?? prev.custoMedioPorKm,
                qtdAbastecimentos: v.qtdAbastecimentos ?? prev.qtdAbastecimentos,
                gastoManutencao: v.gastoManutencao ?? prev.gastoManutencao,
                qtdManutencoes: v.qtdManutencoes ?? prev.qtdManutencoes,
              };
            });
          }
        } catch {}

        const preferredId = await AsyncStorage.getItem(STORAGE_KEYS.PREFERRED_VEHICLE);
        list = sortVehiclesByOrder(list, preferredId);

        // Atualiza a flag isPreferred e order em conformidade com o topo
        if (list.length > 0) {
          list.forEach((v, idx) => {
            v.order = idx;
            v.isPreferred = idx === 0;
          });
          await AsyncStorage.setItem(STORAGE_KEYS.PREFERRED_VEHICLE, list[0].id);
        }

        await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(list));

        // Garante que o veículo ativo seja válido para a conta
        const currentActive = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_VEHICLE);
        if (!currentActive || !list.some((v) => v.id === currentActive)) {
          if (list.length > 0) {
            await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_VEHICLE, list[0].id);
          }
        }
        return list;
      } catch (error) {
        console.warn('Erro ao buscar veículos do Firestore, usando cache local:', error);
      }
    }

    try {
      const json = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
      const preferredId = await AsyncStorage.getItem(STORAGE_KEYS.PREFERRED_VEHICLE);
      const list: Vehicle[] = json ? JSON.parse(json) : [];
      return sortVehiclesByOrder(list, preferredId);
    } catch {
      return [];
    }
  },

  async saveVehicle(vehicle: Vehicle): Promise<void> {
    const userEmail = auth.currentUser?.email;
    let savedOnline = false;

    if (userEmail) {
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
          cilindrada: vehicle.engineDisplacement || (isCar ? 1000 : 150),
          kmAtual: vehicle.currentOdometer,
          ultimoKm: vehicle.currentOdometer,
          ultimoComb: vehicle.fuelType === 'etanol' ? 'Etanol' : vehicle.fuelType === 'diesel' ? 'Diesel' : 'Gasolina',
          combustiveisAceitos: vehicle.acceptedFuelTypes || [vehicle.fuelType],
          acceptedFuelTypes: vehicle.acceptedFuelTypes || [vehicle.fuelType],
          photoUrl: vehicle.photoUrl || null,
          fotoUrl: vehicle.photoUrl || null,
          cadManPeriodica: vehicle.cadManPeriodica ?? false,
        };

        if (vehicle.cadManPeriodica) {
          docData.revisaoKm = vehicle.revisaoKm ?? 10000;
          docData.revisaoMes = vehicle.revisaoMes ?? 12;
          docData.trocaOleoKm = vehicle.trocaOleoKm ?? 10000;
          docData.trocaOleoMeses = vehicle.trocaOleoMeses ?? 6;
          if (vehicle.ultimaRevisaoKm != null) docData.ultimaRevisaoKm = vehicle.ultimaRevisaoKm;
          if (vehicle.ultimaTrocaOleoKm != null) docData.ultimaTrocaOleoKm = vehicle.ultimaTrocaOleoKm;
          docData.proxRevKm = vehicle.proxRevKm ?? (vehicle.currentOdometer + (vehicle.revisaoKm || 10000));
          docData.proxTrocaOleoKm = vehicle.proxTrocaOleoKm ?? (vehicle.currentOdometer + (vehicle.trocaOleoKm || 10000));

          if (vehicle.vehicleType === 'moto') {
            if (vehicle.lubrificarCorrenteKm != null) docData.lubrificarCorrenteKm = vehicle.lubrificarCorrenteKm;
            if (vehicle.ultimaLubCorrenteKm != null) docData.ultimaLubCorrenteKm = vehicle.ultimaLubCorrenteKm;
            if (vehicle.proxLubCorrenteKm != null) docData.proxLubCorrenteKm = vehicle.proxLubCorrenteKm;
            if (vehicle.esticarCorrenteKm != null) docData.esticarCorrenteKm = vehicle.esticarCorrenteKm;
            if (vehicle.ultimaEsticarCorrenteKm != null) docData.ultimaEsticarCorrenteKm = vehicle.ultimaEsticarCorrenteKm;
            if (vehicle.proxEsticarCorrenteKm != null) docData.proxEsticarCorrenteKm = vehicle.proxEsticarCorrenteKm;
          }
        }

        if (vehicle.gastoManutencao != null) {
          docData.gastoManutencao = vehicle.gastoManutencao;
        }

        if (vehicle.totalGastoAbast != null) docData.totalGastoAbast = vehicle.totalGastoAbast;
        if (vehicle.totalLitrosAbast != null) docData.totalLitrosAbast = vehicle.totalLitrosAbast;
        if (vehicle.mediaGeralKmPorLitro != null) docData.mediaGeralKmPorLitro = vehicle.mediaGeralKmPorLitro;
        if (vehicle.custoMedioPorKm != null) docData.custoMedioPorKm = vehicle.custoMedioPorKm;
        if (vehicle.qtdAbastecimentos != null) docData.qtdAbastecimentos = vehicle.qtdAbastecimentos;
        if (vehicle.qtdManutencoes != null) docData.qtdManutencoes = vehicle.qtdManutencoes;
        if (vehicle.order != null) docData.ordem = vehicle.order;
        if (vehicle.isPreferred != null) docData.preferido = vehicle.isPreferred;

        if (vehicle.id && !vehicle.id.startsWith('veh-')) {
          await setDoc(doc(db, 'users', userEmail, 'veiculos', vehicle.id), docData, { merge: true });
        } else {
          const docRef = await addDoc(collection(db, 'users', userEmail, 'veiculos'), docData);
          vehicle.id = docRef.id;
        }
        savedOnline = true;
        await SyncService.removeByEntityId(vehicle.id);
      } catch (err) {
        console.warn('Offline: Falha ao salvar veículo no Firestore, salvando local e enfileirando:', err);
      }
    }

    // Se estiver conectado mas falhou por rede, enfileira para sincronização
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
  },

  async deleteVehicle(vehicleId: string): Promise<void> {
    const userEmail = auth.currentUser?.email;
    let deletedOnline = false;

    if (userEmail && !vehicleId.startsWith('veh-')) {
      try {
        await deleteDoc(doc(db, 'users', userEmail, 'veiculos', vehicleId));
        deletedOnline = true;
        await SyncService.removeByEntityId(vehicleId);
      } catch (err) {
        console.warn('Offline: Falha ao excluir veículo do Firestore, enfileirando:', err);
      }
    }

    if (userEmail && !deletedOnline) {
      await SyncService.enqueue('DELETE_VEHICLE', vehicleId, { id: vehicleId });
    }

    const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
    const vehicles: Vehicle[] = cachedRaw ? JSON.parse(cachedRaw) : [];
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
  },

  async getActiveVehicleId(): Promise<string | null> {
    try {
      const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_VEHICLE);
      if (activeId) return activeId;
      const list = await this.getVehicles();
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
      if (prefId) return prefId;
      const list = await this.getVehicles();
      const preferred = list.find((v) => v.isPreferred) || list[0];
      return preferred?.id || null;
    } catch {
      return null;
    }
  },

  async setPreferredVehicle(vehicleId: string): Promise<Vehicle[]> {
    const list = await this.getVehicles();
    const targetIdx = list.findIndex((v) => v.id === vehicleId);
    if (targetIdx < 0) return list;

    // Move o veículo escolhido para a primeira posição (topo)
    const [selected] = list.splice(targetIdx, 1);
    list.unshift(selected);

    // Atualiza os índices de ordem e o status de preferido
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
        await batch.commit();
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
    const list = await this.getVehicles();
    const idx = list.findIndex((v) => v.id === vehicleId);
    if (idx < 0) return list;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return list;

    // Inverte as posições
    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;

    // Atualiza order e isPreferred (o primeiro é sempre o preferido no topo)
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
        await batch.commit();
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
    const list = await this.getVehicles();
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
        await batch.commit();
      } catch (err) {
        console.warn('Offline: Falha ao salvar reordenação no Firestore:', err);
        for (const v of reordered) {
          await SyncService.enqueue('SAVE_VEHICLE', v.id, v);
        }
      }
    }

    return reordered;
  },


  // TOTALIZADORES E RECALCULO DE METRICAS (DISPONÍVEIS ONLINE E OFFLINE)
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

      // 1. Obtém abastecimentos do veículo sem recursão (lê do cache local)
      let refuelings = refuelingsParam;
      if (!refuelings) {
        try {
          const cachedRefs = await AsyncStorage.getItem(STORAGE_KEYS.REFUELINGS + '_' + vehicleId);
          if (cachedRefs) {
            refuelings = JSON.parse(cachedRefs);
          } else {
            const allRefsRaw = await AsyncStorage.getItem(STORAGE_KEYS.REFUELINGS);
            const allRefs: Refueling[] = allRefsRaw ? JSON.parse(allRefsRaw) : [];
            refuelings = allRefs.filter((r) => r.vehicleId === vehicleId);
          }
        } catch {
          refuelings = [];
        }
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

      const mediaGeralKmPorLitro = validConsumptions.length > 0
        ? Number((validConsumptions.reduce((a, b) => a + b, 0) / validConsumptions.length).toFixed(2))
        : 0;

      const custoMedioPorKm = validCostsPerKm.length > 0
        ? Number((validCostsPerKm.reduce((a, b) => a + b, 0) / validCostsPerKm.length).toFixed(2))
        : 0;

      // 2. Obtém manutenções do veículo sem recursão (lê do cache local)
      let maintenances = maintenancesParam;
      if (!maintenances) {
        try {
          const cachedMnts = await AsyncStorage.getItem(STORAGE_KEYS.MAINTENANCES + '_' + vehicleId);
          if (cachedMnts) {
            maintenances = JSON.parse(cachedMnts);
          } else {
            const allMntsRaw = await AsyncStorage.getItem(STORAGE_KEYS.MAINTENANCES);
            const allMnts: MaintenanceItem[] = allMntsRaw ? JSON.parse(allMntsRaw) : [];
            maintenances = allMnts.filter((m) => m.vehicleId === vehicleId);
          }
        } catch {
          maintenances = [];
        }
      }

      const gastoManutencao = (maintenances || []).reduce((acc, m) => acc + Number(m.cost || 0), 0);

      // 3. Atualiza os totalizadores no objeto Vehicle
      vehicle.totalGastoAbast = Number(totalGastoAbast.toFixed(2));
      vehicle.totalLitrosAbast = Number(totalLitrosAbast.toFixed(2));
      vehicle.mediaGeralKmPorLitro = mediaGeralKmPorLitro;
      vehicle.custoMedioPorKm = custoMedioPorKm;
      vehicle.qtdAbastecimentos = (refuelings || []).length;
      vehicle.gastoManutencao = Number(gastoManutencao.toFixed(2));
      vehicle.qtdManutencoes = (maintenances || []).length;

      // 4. Salva imediatamente no cache local AsyncStorage
      const idx = vehicles.findIndex((v) => v.id === vehicleId);
      if (idx >= 0) {
        vehicles[idx] = vehicle;
        await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
      }

      // 5. Se estiver online e for ID válido, sincroniza no Firestore
      const userEmail = userEmailParam || auth.currentUser?.email;
      if (userEmail && !vehicleId.startsWith('veh-')) {
        try {
          await setDoc(
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
          );
        } catch (e) {
          console.warn('Offline: Falha ao enviar totalizadores para Firestore:', e);
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
   * 1. Todas as informações de cadastro dos veículos (foto, marca, modelo, placa, ano, quilometragem, tanque, combustíveis aceitos, cilindrada, tipo de veículo)
   * 2. Os 5 últimos abastecimentos (ou histórico completo) de TODOS os veículos
   * 3. Os 5 últimos registros de manutenção (ou histórico completo) de TODOS os veículos
   * 4. Todos os totalizadores calculados e persistidos localmente em cada veículo (médias de consumo, custos por km, total gasto em abastecimentos, total gasto em oficina)
   */
  async preloadOfflineData(force = false): Promise<void> {
    const userEmail = auth.currentUser?.email;
    if (!userEmail) return;
    if (isPreloading) return;
    if (hasPreloadedOfflineData && !force) return;

    isPreloading = true;
    try {
      // 1. Busca todos os veículos do Firestore com timeout
      const vehSnap = await withTimeout(
        getDocs(collection(db, 'users', userEmail, 'veiculos')),
        4000
      );
      if (vehSnap.empty) return;

      const vehicles: Vehicle[] = vehSnap.docs.map((d) =>
        mapFirestoreDocToVehicle(d.id, d.data() as Record<string, unknown>)
      );

      // 2. Busca todas as manutenções do Firestore com timeout
      let allMaintenances: MaintenanceItem[] = [];
      try {
        const maintSnap = await withTimeout(
          getDocs(collection(db, 'users', userEmail, 'manutencoes')),
          4000
        );
        allMaintenances = maintSnap.docs.map((d) =>
          mapFirestoreDocToMaintenance(d.id, d.data())
        );
      } catch (e) {
        console.warn('Aviso: Falha ao carregar manutenções em preloadOfflineData:', e);
      }

      // Salva no cache geral de manutenções
      await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(allMaintenances));

      // 3. Para cada veículo, carrega abastecimentos da subcoleção e manutenções dedicadas em paralelo
      let allRefuelings: Refueling[] = [];

      await Promise.all(
        vehicles.map(async (vehicle) => {
          try {
            const abastSnap = await withTimeout(
              getDocs(collection(db, 'users', userEmail, 'veiculos', vehicle.id, 'abastecimentos')),
              4000
            );
            const vRefuelings: Refueling[] = abastSnap.docs.map((d) =>
              mapFirestoreDocToRefueling(d.id, { ...d.data(), idVeiculo: vehicle.id })
            );
            const sortedVRefuelings = vRefuelings.sort(compareDatesDesc);

            // Salva no cache individual do veículo
            await AsyncStorage.setItem(
              STORAGE_KEYS.REFUELINGS + '_' + vehicle.id,
              JSON.stringify(sortedVRefuelings)
            );

            allRefuelings = allRefuelings.concat(sortedVRefuelings);

            // Salva as manutenções dedicadas do veículo
            const vMaintenances = allMaintenances
              .filter((m) => m.vehicleId === vehicle.id)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            await AsyncStorage.setItem(
              STORAGE_KEYS.MAINTENANCES + '_' + vehicle.id,
              JSON.stringify(vMaintenances)
            );

            // Calcula todos os totalizadores do veículo
            let totalGastoAbast = 0;
            let totalLitrosAbast = 0;
            const validConsumptions: number[] = [];
            const validCostsPerKm: number[] = [];

            sortedVRefuelings.forEach((r) => {
              totalGastoAbast += Number(r.totalAmount || 0);
              totalLitrosAbast += Number(r.liters || 0);
              if (typeof r.consumptionKmPerLiter === 'number' && r.consumptionKmPerLiter > 0 && r.consumptionKmPerLiter < 50) {
                validConsumptions.push(r.consumptionKmPerLiter);
              }
              if (typeof r.costPerKm === 'number' && r.costPerKm > 0) {
                validCostsPerKm.push(r.costPerKm);
              }
            });

            const mediaGeralKmPorLitro = validConsumptions.length > 0
              ? Number((validConsumptions.reduce((a, b) => a + b, 0) / validConsumptions.length).toFixed(2))
              : 0;

            const custoMedioPorKm = validCostsPerKm.length > 0
              ? Number((validCostsPerKm.reduce((a, b) => a + b, 0) / validCostsPerKm.length).toFixed(2))
              : 0;

            const gastoManutencao = vMaintenances.reduce((acc, m) => acc + Number(m.cost || 0), 0);

            vehicle.totalGastoAbast = Number(totalGastoAbast.toFixed(2));
            vehicle.totalLitrosAbast = Number(totalLitrosAbast.toFixed(2));
            vehicle.mediaGeralKmPorLitro = mediaGeralKmPorLitro;
            vehicle.custoMedioPorKm = custoMedioPorKm;
            vehicle.qtdAbastecimentos = sortedVRefuelings.length;
            vehicle.gastoManutencao = Number(gastoManutencao.toFixed(2));
            vehicle.qtdManutencoes = vMaintenances.length;
          } catch (e) {
            console.warn(`Aviso: Erro ao carregar dados do veículo ${vehicle.id}:`, e);
          }
        })
      );

      // 4. Salva a lista completa com todos os cadastros, totalizadores e ordenação em cache local
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

      // 5. Salva a lista agregada de abastecimentos em cache local
      await AsyncStorage.setItem(
        STORAGE_KEYS.REFUELINGS,
        JSON.stringify(allRefuelings.sort(compareDatesDesc))
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
      hasCheckedLegacyMedias = true;
      const legacySnap = await getDocs(collection(db, 'users', userEmail, 'medias'));
      if (legacySnap.empty) return 0;

      const vehicles = await this.getVehicles();
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
          await batch.commit();

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
        // Executa migração transparente de documentos legados caso ainda existam
        await this.migrateLegacyMedias(userEmail);

        if (vehicleId) {
          const subSnap = await withTimeout(
            getDocs(collection(db, 'users', userEmail, 'veiculos', vehicleId, 'abastecimentos')),
            3500
          );
          let list: Refueling[] = subSnap.docs.map((d) =>
            mapFirestoreDocToRefueling(d.id, { ...d.data(), idVeiculo: vehicleId })
          );

          // PRESERVAÇÃO DE DADOS OFFLINE:
          try {
            const queue = await SyncService.getQueue();
            const userKey = userEmail.toLowerCase().trim();
            const pendingAdds = queue
              .filter(
                (q) =>
                  q.action === 'ADD_REFUELING' &&
                  q.userEmail === userKey &&
                  (q.payload.vehicleId === vehicleId || q.entityId === vehicleId)
              )
              .map((q) => q.payload as Refueling);
            const pendingDeletes = new Set(
              queue
                .filter((q) => q.action === 'DELETE_REFUELING' && q.userEmail === userKey)
                .map((q) => q.entityId)
            );

            list = list.filter((r) => !pendingDeletes.has(r.id));
            for (const pa of pendingAdds) {
              if (!list.some((r) => r.id === pa.id)) {
                list.unshift(pa);
              }
            }
          } catch (errQ) {
            console.warn('Erro ao mesclar abastecimentos da fila de pendências:', errQ);
          }

          await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS + '_' + vehicleId, JSON.stringify(list));
          return list.sort(compareDatesDesc);
        } else {
          // Busca agregada paralela de todos os veículos
          const vehicles = await this.getVehicles();
          const results = await Promise.all(
            vehicles.map(async (v) => {
              try {
                const subSnap = await withTimeout(
                  getDocs(collection(db, 'users', userEmail, 'veiculos', v.id, 'abastecimentos')),
                  3500
                );
                const vList = subSnap.docs.map((d) =>
                  mapFirestoreDocToRefueling(d.id, { ...d.data(), idVeiculo: v.id })
                );
                await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS + '_' + v.id, JSON.stringify(vList));
                return vList;
              } catch {
                const cached = await AsyncStorage.getItem(STORAGE_KEYS.REFUELINGS + '_' + v.id);
                return cached ? (JSON.parse(cached) as Refueling[]) : [];
              }
            })
          );
          let allList: Refueling[] = results.flat();

          // PRESERVAÇÃO DE DADOS OFFLINE:
          try {
            const queue = await SyncService.getQueue();
            const userKey = userEmail.toLowerCase().trim();
            const pendingAdds = queue
              .filter((q) => q.action === 'ADD_REFUELING' && q.userEmail === userKey)
              .map((q) => q.payload as Refueling);
            const pendingDeletes = new Set(
              queue
                .filter((q) => q.action === 'DELETE_REFUELING' && q.userEmail === userKey)
                .map((q) => q.entityId)
            );

            allList = allList.filter((r) => !pendingDeletes.has(r.id));
            for (const pa of pendingAdds) {
              if (!allList.some((r) => r.id === pa.id)) {
                allList.unshift(pa);
              }
            }
          } catch (errQ) {
            console.warn('Erro ao mesclar abastecimentos agregados da fila:', errQ);
          }

          await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(allList));
          return allList.sort(compareDatesDesc);
        }
      } catch (error) {
        console.warn('Erro ao buscar abastecimentos do Firestore, usando cache local:', error);
      }
    }

    try {
      if (vehicleId) {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.REFUELINGS + '_' + vehicleId);
        if (cached) {
          const parsed: Refueling[] = JSON.parse(cached);
          return parsed.sort(compareDatesDesc);
        }
      }
      const json = await AsyncStorage.getItem(STORAGE_KEYS.REFUELINGS);
      const all: Refueling[] = json ? JSON.parse(json) : [];
      if (vehicleId) {
        return all
          .filter((r) => r.vehicleId === vehicleId)
          .sort(compareDatesDesc);
      }
      return all.sort(compareDatesDesc);
    } catch {
      return [];
    }
  },

  async addRefueling(refueling: Refueling): Promise<Refueling> {
    const userEmail = auth.currentUser?.email;
    const vehicles = await this.getVehicles();
    const vehicle = vehicles.find((v) => v.id === refueling.vehicleId);

    // Obter o abastecimento anterior para calcular odômetro antigo e consumo
    const existingRefuelings = await this.getRefuelings(refueling.vehicleId);
    const prev = existingRefuelings
      .filter((r) => r.odometer < refueling.odometer)
      .sort((a, b) => b.odometer - a.odometer)[0];
    const kmAntigo = prev ? prev.odometer : (vehicle ? vehicle.currentOdometer : refueling.odometer);

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

    const calculatedRefueling: Refueling = {
      ...refueling,
      id: refueling.id || `ref-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      plate: vehicle?.plate,
      previousOdometer: kmAntigo,
      distanceTraveled,
      consumptionKmPerLiter,
      costPerKm,
    };

    let savedOnline = false;

    if (userEmail && refueling.vehicleId) {
      try {
        const rawComb =
          refueling.fuelType === 'etanol'
            ? 'Etanol'
            : refueling.fuelType === 'diesel'
            ? 'Diesel'
            : refueling.fuelType === 'gnv'
            ? 'GNV'
            : 'Gasolina';

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
        };

        // Gravação Atômica usando writeBatch: salva o abastecimento na subcoleção e atualiza o veículo
        const batch = writeBatch(db);
        const subColRef = collection(
          db,
          'users',
          userEmail,
          'veiculos',
          refueling.vehicleId,
          'abastecimentos'
        );
        const newRefDoc = doc(subColRef);
        calculatedRefueling.id = newRefDoc.id;
        batch.set(newRefDoc, firestoreData);

        const vehicleDocRef = doc(db, 'users', userEmail, 'veiculos', refueling.vehicleId);
        const updatedVehicleFields: Record<string, unknown> = {};

        if (vehicle && refueling.odometer >= vehicle.currentOdometer) {
          vehicle.currentOdometer = refueling.odometer;
          updatedVehicleFields.kmAtual = refueling.odometer;
          updatedVehicleFields.ultimoKm = refueling.odometer;
          updatedVehicleFields.ultimoComb = rawComb;
          batch.set(vehicleDocRef, updatedVehicleFields, { merge: true });
        }

        await batch.commit();
        savedOnline = true;
        await SyncService.removeByEntityId(calculatedRefueling.id);

        // Atualiza os totalizadores agregados do veículo
        await this.recalculateVehicleStats(userEmail, refueling.vehicleId);

        // Atualiza o documento de preços de combustível mais recentes praticados
        await this.saveLatestFuelPrice(refueling.fuelType, refueling.pricePerLiter);
      } catch (err) {
        console.warn('Offline: Falha ao salvar abastecimento no Firestore, enfileirando:', err);
      }
    }

    if (userEmail && !savedOnline) {
      await SyncService.enqueue('ADD_REFUELING', calculatedRefueling.id, calculatedRefueling);
    }

    // Atualizar cache local
    const vehicleKey = STORAGE_KEYS.REFUELINGS + '_' + refueling.vehicleId;
    const cachedForVeh = await this.getRefuelings(refueling.vehicleId);
    const vIndex = cachedForVeh.findIndex((r) => r.id === calculatedRefueling.id);
    if (vIndex >= 0) cachedForVeh[vIndex] = calculatedRefueling;
    else cachedForVeh.unshift(calculatedRefueling);
    await AsyncStorage.setItem(vehicleKey, JSON.stringify(cachedForVeh));

    const all = await this.getRefuelings();
    const index = all.findIndex((r) => r.id === calculatedRefueling.id);
    if (index >= 0) {
      all[index] = calculatedRefueling;
    } else {
      all.unshift(calculatedRefueling);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(all));

    if (vehicle && refueling.odometer >= vehicle.currentOdometer) {
      await this.saveVehicle(vehicle);
    }

    // Garante recálculo dos totalizadores tanto online quanto offline
    await this.updateVehicleTotalizers(refueling.vehicleId);

    return calculatedRefueling;
  },

  async deleteRefueling(id: string, vehicleId?: string): Promise<void> {
    const userEmail = auth.currentUser?.email;
    const all = await this.getRefuelings();
    const itemToDelete = all.find((r) => r.id === id);
    const effectiveVehId = vehicleId || itemToDelete?.vehicleId;
    let deletedOnline = false;

    if (userEmail && effectiveVehId && !id.startsWith('ref-')) {
      try {
        await deleteDoc(
          doc(db, 'users', userEmail, 'veiculos', effectiveVehId, 'abastecimentos', id)
        );
        deletedOnline = true;
        await SyncService.removeByEntityId(id);

        // Deleta também do legado se ainda existia
        try {
          await deleteDoc(doc(db, 'users', userEmail, 'medias', id));
        } catch {}

        await this.recalculateVehicleStats(userEmail, effectiveVehId);
      } catch (err) {
        console.warn('Offline: Falha ao excluir abastecimento do Firestore, enfileirando:', err);
      }
    }

    if (userEmail && !deletedOnline && effectiveVehId) {
      await SyncService.enqueue('DELETE_REFUELING', id, { id, vehicleId: effectiveVehId });
    }

    if (effectiveVehId) {
      const cached = (await this.getRefuelings(effectiveVehId)).filter((r) => r.id !== id);
      await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS + '_' + effectiveVehId, JSON.stringify(cached));
      await this.updateVehicleTotalizers(effectiveVehId);
    }
    const remaining = all.filter((r) => r.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(remaining));
  },

  // MANUTENÇÕES
  async getMaintenances(vehicleId?: string): Promise<MaintenanceItem[]> {
    const userEmail = auth.currentUser?.email;
    if (userEmail) {
      try {
        const snap = await withTimeout(
          getDocs(collection(db, 'users', userEmail, 'manutencoes')),
          3500
        );
        let list: MaintenanceItem[] = snap.docs.map((d) =>
          mapFirestoreDocToMaintenance(d.id, d.data())
        );

        // PRESERVAÇÃO DE DADOS OFFLINE:
        try {
          const queue = await SyncService.getQueue();
          const userKey = userEmail.toLowerCase().trim();
          const pendingAdds = queue
            .filter((q) => q.action === 'ADD_MAINTENANCE' && q.userEmail === userKey)
            .map((q) => q.payload as MaintenanceItem);
          const pendingDeletes = new Set(
            queue
              .filter((q) => q.action === 'DELETE_MAINTENANCE' && q.userEmail === userKey)
              .map((q) => q.entityId)
          );

          list = list.filter((m) => !pendingDeletes.has(m.id));
          for (const pa of pendingAdds) {
            if (!list.some((m) => m.id === pa.id)) {
              list.unshift(pa);
            }
          }
        } catch (errQ) {
          console.warn('Erro ao mesclar manutenções da fila de pendências:', errQ);
        }

        await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(list));

        // Atualiza cache individual por veículo para acesso offline ágil
        try {
          const vehiclesRaw = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
          const vList: Vehicle[] = vehiclesRaw ? JSON.parse(vehiclesRaw) : [];
          for (const v of vList) {
            const forV = list.filter((m) => m.vehicleId === v.id);
            await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES + '_' + v.id, JSON.stringify(forV));
          }
        } catch {}

        if (vehicleId) {
          return list
            .filter((m) => m.vehicleId === vehicleId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
        return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      } catch (err) {
        console.warn('Erro ao carregar manutenções do Firestore, usando cache:', err);
      }
    }

    try {
      if (vehicleId) {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.MAINTENANCES + '_' + vehicleId);
        if (cached) {
          const parsed: MaintenanceItem[] = JSON.parse(cached);
          return parsed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
      }
      const json = await AsyncStorage.getItem(STORAGE_KEYS.MAINTENANCES);
      const all: MaintenanceItem[] = json ? JSON.parse(json) : [];
      if (vehicleId) {
        return all
          .filter((m) => m.vehicleId === vehicleId)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }
      return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch {
      return [];
    }
  },

  async addMaintenance(maintenance: MaintenanceItem): Promise<MaintenanceItem> {
    const userEmail = auth.currentUser?.email;
    const vehicles = await this.getVehicles();
    const vehicle = vehicles.find((v) => v.id === maintenance.vehicleId);

    const calculatedMnt: MaintenanceItem = {
      ...maintenance,
      id: maintenance.id || `mnt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };

    let savedOnline = false;

    if (userEmail) {
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
        };

        const docRef = await addDoc(collection(db, 'users', userEmail, 'manutencoes'), firestoreData);
        calculatedMnt.id = docRef.id;
        savedOnline = true;
        await SyncService.removeByEntityId(calculatedMnt.id);

        // Atualizações automáticas no documento do veículo
        if (vehicle) {
          const vehUpdates: Record<string, unknown> = {
            gastoManutencao: Number(((vehicle.gastoManutencao || 0) + maintenance.cost).toFixed(2)),
          };

          if (maintenance.odometer > vehicle.currentOdometer) {
            vehicle.currentOdometer = maintenance.odometer;
            vehUpdates.kmAtual = maintenance.odometer;
            vehUpdates.ultimoKm = maintenance.odometer;
          }

          if (maintenance.category === 'oleo_filtro') {
            vehicle.ultimaTrocaOleoKm = maintenance.odometer;
            vehicle.proxTrocaOleoKm = maintenance.odometer + (vehicle.trocaOleoKm || 10000);
            vehUpdates.ultimaTrocaOleoKm = vehicle.ultimaTrocaOleoKm;
            vehUpdates.proxTrocaOleoKm = vehicle.proxTrocaOleoKm;
          } else if (maintenance.category === 'revisao_geral') {
            vehicle.ultimaRevisaoKm = maintenance.odometer;
            vehicle.proxRevKm = maintenance.odometer + (vehicle.revisaoKm || 10000);
            vehicle.ultimaTrocaOleoKm = maintenance.odometer;
            vehicle.proxTrocaOleoKm = maintenance.odometer + (vehicle.trocaOleoKm || 10000);
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
            vehicle.proxLubCorrenteKm = maintenance.odometer + (vehicle.lubrificarCorrenteKm || 500);
            vehUpdates.ultimaLubCorrenteKm = vehicle.ultimaLubCorrenteKm;
            vehUpdates.proxLubCorrenteKm = vehicle.proxLubCorrenteKm;
          } else if (maintenance.category === 'esticar_corrente') {
            vehicle.ultimaEsticarCorrenteKm = maintenance.odometer;
            vehicle.proxEsticarCorrenteKm = maintenance.odometer + (vehicle.esticarCorrenteKm || 1500);
            vehUpdates.ultimaEsticarCorrenteKm = vehicle.ultimaEsticarCorrenteKm;
            vehUpdates.proxEsticarCorrenteKm = vehicle.proxEsticarCorrenteKm;
          }

          await setDoc(doc(db, 'users', userEmail, 'veiculos', vehicle.id), vehUpdates, { merge: true });
          await this.saveVehicle(vehicle);
        }
      } catch (err) {
        console.warn('Offline: Falha ao salvar manutenção no Firestore, enfileirando:', err);
      }
    }

    if (userEmail && !savedOnline) {
      await SyncService.enqueue('ADD_MAINTENANCE', calculatedMnt.id, calculatedMnt);
    }

    const all = await this.getMaintenances();
    const index = all.findIndex((m) => m.id === calculatedMnt.id);
    if (index >= 0) all[index] = calculatedMnt;
    else all.unshift(calculatedMnt);
    await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(all));

    // Atualiza cache específico do veículo
    if (calculatedMnt.vehicleId) {
      const vehicleKey = STORAGE_KEYS.MAINTENANCES + '_' + calculatedMnt.vehicleId;
      const cachedVeh = await this.getMaintenances(calculatedMnt.vehicleId);
      const vIdx = cachedVeh.findIndex((m) => m.id === calculatedMnt.id);
      if (vIdx >= 0) cachedVeh[vIdx] = calculatedMnt;
      else cachedVeh.unshift(calculatedMnt);
      await AsyncStorage.setItem(vehicleKey, JSON.stringify(cachedVeh));

      // Atualiza totalizadores do veículo tanto online quanto offline
      await this.updateVehicleTotalizers(calculatedMnt.vehicleId);
    }

    return calculatedMnt;
  },

  async deleteMaintenance(id: string): Promise<void> {
    const userEmail = auth.currentUser?.email;
    const all = await this.getMaintenances();
    const itemToDelete = all.find((m) => m.id === id);
    const vehicleId = itemToDelete?.vehicleId;
    let deletedOnline = false;

    if (userEmail && !id.startsWith('mnt-')) {
      try {
        await deleteDoc(doc(db, 'users', userEmail, 'manutencoes', id));
        deletedOnline = true;
        await SyncService.removeByEntityId(id);
      } catch (err) {
        console.warn('Offline: Falha ao excluir manutenção do Firestore, enfileirando:', err);
      }
    }

    if (userEmail && !deletedOnline) {
      await SyncService.enqueue('DELETE_MAINTENANCE', id, { id });
    }

    if (vehicleId) {
      const cached = (await this.getMaintenances(vehicleId)).filter((m) => m.id !== id);
      await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES + '_' + vehicleId, JSON.stringify(cached));
    }

    const remaining = all.filter((m) => m.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(remaining));

    if (vehicleId) {
      await this.updateVehicleTotalizers(vehicleId);
    }
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
    const vehicles = await this.getVehicles();
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
    if (userEmail && !vehicle.id.startsWith('veh-')) {
      try {
        await setDoc(
          doc(db, 'users', userEmail, 'veiculos', vehicle.id),
          firestoreUpdates,
          { merge: true }
        );
        savedOnline = true;
      } catch (err) {
        console.warn('Offline: Falha ao salvar periodicidade de manutenção no Firestore, enfileirando:', err);
      }
    }

    if (userEmail && !savedOnline) {
      await SyncService.enqueue('SAVE_PERIODIC_CONFIG', vehicle.id, {
        vehicleId: vehicle.id,
        config: firestoreUpdates,
      });
    }

    await this.saveVehicle(vehicle);
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
    if (userEmail) {
      try {
        const docRef = doc(db, 'users', userEmail, 'configuracoes', 'precosCombustivel');
        const snap = await withTimeout(getDoc(docRef), 3500);
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
        console.warn('Erro ao carregar precosCombustivel do Firestore:', err);
      }
    }

    // Tentar cache local
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.FUEL_PRICES);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Ignora erro de cache
    }

    // Se ainda não existir documento de configuração, derivar do último abastecimento registrado no sistema
    try {
      const allRefs = await this.getRefuelings();
      if (allRefs.length > 0) {
        const sorted = [...allRefs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

        await this.saveFuelPrices(prices);
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
    } catch {
      // Ignora erro de cache
    }

    const updated: FuelPrices = {
      ...current,
      ...prices,
      updatedAt: new Date().toISOString(),
    };

    let savedOnline = false;
    const userEmail = auth.currentUser?.email;
    if (userEmail) {
      try {
        const docRef = doc(db, 'users', userEmail, 'configuracoes', 'precosCombustivel');
        await setDoc(
          docRef,
          {
            gasolina: updated.gasolina,
            etanol: updated.etanol,
            diesel: updated.diesel,
            gnv: updated.gnv,
            atualizadoEm: updated.updatedAt,
          },
          { merge: true }
        );
        savedOnline = true;
      } catch (err) {
        console.warn('Offline: Falha ao salvar precosCombustivel no Firestore, enfileirando:', err);
      }
    }

    if (userEmail && !savedOnline) {
      await SyncService.enqueue('SAVE_FUEL_PRICES', 'fuelPrices', { prices: updated });
    }

    await AsyncStorage.setItem(STORAGE_KEYS.FUEL_PRICES, JSON.stringify(updated));
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
   */
  async deleteAllUserData(userEmail: string): Promise<void> {
    const emailKey = userEmail.toLowerCase().trim();

    // 1. Exclui veículos e suas subcoleções de abastecimentos no Firestore
    try {
      const vehSnap = await getDocs(collection(db, 'users', emailKey, 'veiculos'));
      for (const vehDoc of vehSnap.docs) {
        try {
          const abastSnap = await getDocs(
            collection(db, 'users', emailKey, 'veiculos', vehDoc.id, 'abastecimentos')
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
      const maintSnap = await getDocs(collection(db, 'users', emailKey, 'manutencoes'));
      const deleteMaintPromises = maintSnap.docs.map((mDoc) => deleteDoc(mDoc.ref));
      await Promise.all(deleteMaintPromises);
    } catch (e) {
      console.warn('Erro ao excluir manutenções do Firestore:', e);
    }

    // 3. Exclui médias legadas do Firestore (se houver)
    try {
      const mediaSnap = await getDocs(collection(db, 'users', emailKey, 'medias'));
      const deleteMediaPromises = mediaSnap.docs.map((mDoc) => deleteDoc(mDoc.ref));
      await Promise.all(deleteMediaPromises);
    } catch (e) {
      console.warn('Erro ao excluir médias legadas:', e);
    }

    // 4. Exclui configurações do usuário no Firestore
    try {
      const configSnap = await getDocs(collection(db, 'users', emailKey, 'configuracoes'));
      const deleteConfigPromises = configSnap.docs.map((cDoc) => deleteDoc(cDoc.ref));
      await Promise.all(deleteConfigPromises);
    } catch (e) {
      console.warn('Erro ao excluir configurações do Firestore:', e);
    }

    // 5. Exclui o documento raiz do usuário no Firestore
    try {
      await deleteDoc(doc(db, 'users', emailKey));
    } catch (e) {
      console.warn('Erro ao excluir documento raiz do usuário no Firestore:', e);
    }

    // 6. Exclui foto de perfil do Firebase Storage se existir
    try {
      const avatarStorageRef = storageRef(storage, `users/${emailKey}/avatar.jpg`);
      await deleteObject(avatarStorageRef);
    } catch {
      // Ignora se não existir arquivo no Storage
    }

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

  // RESET
  async resetDemo(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(DEMO_VEHICLES));
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_VEHICLE, DEMO_VEHICLES[0].id);
    await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(DEMO_REFUELINGS));
    await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(DEMO_MAINTENANCES));
  },
};
