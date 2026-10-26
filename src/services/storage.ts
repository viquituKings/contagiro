import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import { Vehicle, Refueling, MaintenanceItem, MaintenanceCategory, FuelType, VehicleType } from '@/types/vehicle';

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
    qtdAbastecimentos: data.qtdAbastecimentos != null ? Number(data.qtdAbastecimentos) : undefined,
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
  REFUELINGS: '@contagiro:refuelings_v1',
  MAINTENANCES: '@contagiro:maintenances_v1',
  HAS_SEEDED: '@contagiro:has_seeded_v1',
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

export const StorageService = {
  // Inicialização de semente (apenas na 1ª vez e se não logado)
  async init(): Promise<void> {
    try {
      if (auth.currentUser?.email) {
        await this.getVehicles();
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
        const querySnapshot = await getDocs(collection(db, 'users', userEmail, 'veiculos'));
        if (!querySnapshot.empty) {
          const list: Vehicle[] = querySnapshot.docs.map((d) =>
            mapFirestoreDocToVehicle(d.id, d.data() as Record<string, unknown>)
          );
          await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(list));

          // Garante que o veículo ativo seja válido para a conta
          const currentActive = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_VEHICLE);
          if (!currentActive || !list.some((v) => v.id === currentActive)) {
            await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_VEHICLE, list[0].id);
          }
          return list;
        } else {
          // Usuário logado mas sem veículos no banco
          await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify([]));
          return [];
        }
      } catch (error) {
        console.warn('Erro ao buscar veículos do Firestore, usando cache local:', error);
      }
    }

    try {
      const json = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  },

  async saveVehicle(vehicle: Vehicle): Promise<void> {
    const userEmail = auth.currentUser?.email;
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
        if (vehicle.qtdAbastecimentos != null) docData.qtdAbastecimentos = vehicle.qtdAbastecimentos;

        if (vehicle.id && !vehicle.id.startsWith('veh-')) {
          await setDoc(doc(db, 'users', userEmail, 'veiculos', vehicle.id), docData, { merge: true });
        } else {
          const docRef = await addDoc(collection(db, 'users', userEmail, 'veiculos'), docData);
          vehicle.id = docRef.id;
        }
      } catch (err) {
        console.error('Erro ao salvar veículo no Firestore:', err);
      }
    }

    const vehicles = await this.getVehicles();
    const index = vehicles.findIndex((v) => v.id === vehicle.id);
    if (index >= 0) {
      vehicles[index] = vehicle;
    } else {
      vehicles.push(vehicle);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
  },

  async deleteVehicle(vehicleId: string): Promise<void> {
    const userEmail = auth.currentUser?.email;
    if (userEmail && !vehicleId.startsWith('veh-')) {
      try {
        await deleteDoc(doc(db, 'users', userEmail, 'veiculos', vehicleId));
      } catch (err) {
        console.error('Erro ao excluir veículo do Firestore:', err);
      }
    }

    const vehicles = (await this.getVehicles()).filter((v) => v.id !== vehicleId);
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
    const active = await this.getActiveVehicleId();
    if (active === vehicleId && vehicles.length > 0) {
      await this.setActiveVehicleId(vehicles[0].id);
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


  // TOTALIZADORES E RECALCULO DE METRICAS
  async recalculateVehicleStats(userEmail: string, vehicleId: string): Promise<void> {
    try {
      const subSnap = await getDocs(
        collection(db, 'users', userEmail, 'veiculos', vehicleId, 'abastecimentos')
      );
      if (subSnap.empty) {
        await setDoc(
          doc(db, 'users', userEmail, 'veiculos', vehicleId),
          {
            totalGastoAbast: 0,
            totalLitrosAbast: 0,
            mediaGeralKmPorLitro: 0,
            qtdAbastecimentos: 0,
          },
          { merge: true }
        );
        return;
      }

      let totalGasto = 0;
      let totalLitros = 0;
      const validConsumptions: number[] = [];

      subSnap.docs.forEach((d) => {
        const data = d.data();
        const l = Number(data.qdtAbastecida ?? data.liters ?? 0);
        const p = Number(data.valorLitro ?? data.pricePerLiter ?? 0);
        const t = data.totalAmount != null ? Number(data.totalAmount) : l * p;
        totalGasto += t;
        totalLitros += l;
        const m = Number(data.media ?? data.consumptionKmPerLiter);
        if (!isNaN(m) && m > 0 && m < 50) {
          validConsumptions.push(m);
        }
      });

      const avgConsumption =
        validConsumptions.length > 0
          ? Number((validConsumptions.reduce((a, b) => a + b, 0) / validConsumptions.length).toFixed(2))
          : 0;

      await setDoc(
        doc(db, 'users', userEmail, 'veiculos', vehicleId),
        {
          totalGastoAbast: Number(totalGasto.toFixed(2)),
          totalLitrosAbast: Number(totalLitros.toFixed(2)),
          mediaGeralKmPorLitro: avgConsumption,
          qtdAbastecimentos: subSnap.docs.length,
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Erro ao recalcular estatísticas do veículo:', e);
    }
  },

  // MIGRAÇÃO INTELIGENTE DE ESTRUTURA (medias -> veiculos/{id}/abastecimentos)
  async migrateLegacyMedias(userEmail: string): Promise<number> {
    try {
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
          const subSnap = await getDocs(
            collection(db, 'users', userEmail, 'veiculos', vehicleId, 'abastecimentos')
          );
          const list: Refueling[] = subSnap.docs.map((d) =>
            mapFirestoreDocToRefueling(d.id, { ...d.data(), idVeiculo: vehicleId })
          );
          await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS + '_' + vehicleId, JSON.stringify(list));
          return list.sort((a, b) => b.odometer - a.odometer);
        } else {
          // Busca agregada de todos os veículos
          const vehicles = await this.getVehicles();
          let allList: Refueling[] = [];
          for (const v of vehicles) {
            const subSnap = await getDocs(
              collection(db, 'users', userEmail, 'veiculos', v.id, 'abastecimentos')
            );
            const vList = subSnap.docs.map((d) =>
              mapFirestoreDocToRefueling(d.id, { ...d.data(), idVeiculo: v.id })
            );
            allList = allList.concat(vList);
          }
          await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(allList));
          return allList.sort((a, b) => b.odometer - a.odometer);
        }
      } catch (error) {
        console.warn('Erro ao buscar abastecimentos do Firestore, usando cache local:', error);
      }
    }

    try {
      if (vehicleId) {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.REFUELINGS + '_' + vehicleId);
        if (cached) return JSON.parse(cached);
      }
      const json = await AsyncStorage.getItem(STORAGE_KEYS.REFUELINGS);
      const all: Refueling[] = json ? JSON.parse(json) : [];
      if (vehicleId) {
        return all
          .filter((r) => r.vehicleId === vehicleId)
          .sort((a, b) => b.odometer - a.odometer);
      }
      return all.sort((a, b) => b.odometer - a.odometer);
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
    const prev = existingRefuelings.find((r) => r.odometer < refueling.odometer);
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
      plate: vehicle?.plate,
      previousOdometer: kmAntigo,
      distanceTraveled,
      consumptionKmPerLiter,
      costPerKm,
    };

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

        // Atualiza os totalizadores agregados do veículo
        await this.recalculateVehicleStats(userEmail, refueling.vehicleId);
      } catch (err) {
        console.error('Erro ao salvar abastecimento hierárquico no Firestore:', err);
      }
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

    return calculatedRefueling;
  },

  async deleteRefueling(id: string, vehicleId?: string): Promise<void> {
    const userEmail = auth.currentUser?.email;
    const all = await this.getRefuelings();
    const itemToDelete = all.find((r) => r.id === id);
    const effectiveVehId = vehicleId || itemToDelete?.vehicleId;

    if (userEmail && effectiveVehId && !id.startsWith('ref-')) {
      try {
        await deleteDoc(
          doc(db, 'users', userEmail, 'veiculos', effectiveVehId, 'abastecimentos', id)
        );
        // Deleta também do legado se ainda existia
        try {
          await deleteDoc(doc(db, 'users', userEmail, 'medias', id));
        } catch {}

        await this.recalculateVehicleStats(userEmail, effectiveVehId);
      } catch (err) {
        console.error('Erro ao excluir abastecimento hierárquico do Firestore:', err);
      }
    }

    if (effectiveVehId) {
      const cached = (await this.getRefuelings(effectiveVehId)).filter((r) => r.id !== id);
      await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS + '_' + effectiveVehId, JSON.stringify(cached));
    }
    const remaining = all.filter((r) => r.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(remaining));
  },

  // MANUTENÇÕES
  async getMaintenances(vehicleId?: string): Promise<MaintenanceItem[]> {
    const userEmail = auth.currentUser?.email;
    if (userEmail) {
      try {
        const snap = await getDocs(collection(db, 'users', userEmail, 'manutencoes'));
        const list: MaintenanceItem[] = snap.docs.map((d) =>
          mapFirestoreDocToMaintenance(d.id, d.data())
        );
        await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(list));
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

    const calculatedMnt: MaintenanceItem = { ...maintenance };

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
        console.error('Erro ao salvar manutenção no Firestore:', err);
      }
    }

    const all = await this.getMaintenances();
    const index = all.findIndex((m) => m.id === calculatedMnt.id);
    if (index >= 0) all[index] = calculatedMnt;
    else all.unshift(calculatedMnt);
    await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(all));

    return calculatedMnt;
  },

  async deleteMaintenance(id: string): Promise<void> {
    const userEmail = auth.currentUser?.email;
    if (userEmail && !id.startsWith('mnt-')) {
      try {
        await deleteDoc(doc(db, 'users', userEmail, 'manutencoes', id));
      } catch (err) {
        console.error('Erro ao excluir manutenção do Firestore:', err);
      }
    }
    const all = (await this.getMaintenances()).filter((m) => m.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(all));
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

    if (userEmail && !vehicle.id.startsWith('veh-')) {
      try {
        await setDoc(
          doc(db, 'users', userEmail, 'veiculos', vehicle.id),
          firestoreUpdates,
          { merge: true }
        );
      } catch (err) {
        console.error('Erro ao salvar periodicidade de manutenção no Firestore:', err);
      }
    }

    await this.saveVehicle(vehicle);
    return vehicle;
  },

  // RESET
  async resetDemo(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(DEMO_VEHICLES));
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_VEHICLE, DEMO_VEHICLES[0].id);
    await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(DEMO_REFUELINGS));
    await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(DEMO_MAINTENANCES));
  },
};
