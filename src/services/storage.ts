import AsyncStorage from '@react-native-async-storage/async-storage';
import { Vehicle, Refueling, MaintenanceItem } from '@/types/vehicle';

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
  // Inicialização de semente (apenas na 1ª vez)
  async init(): Promise<void> {
    try {
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
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEYS.VEHICLES);
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  },

  async saveVehicle(vehicle: Vehicle): Promise<void> {
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
    const vehicles = (await this.getVehicles()).filter((v) => v.id !== vehicleId);
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
    const active = await this.getActiveVehicleId();
    if (active === vehicleId && vehicles.length > 0) {
      await this.setActiveVehicleId(vehicles[0].id);
    }
  },

  async getActiveVehicleId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_VEHICLE);
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

  // ABASTECIMENTOS
  async getRefuelings(vehicleId?: string): Promise<Refueling[]> {
    try {
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
    const all = await this.getRefuelings();
    
    // Obter o abastecimento anterior para calcular consumo
    const previousRefuelings = all
      .filter((r) => r.vehicleId === refueling.vehicleId && r.odometer < refueling.odometer)
      .sort((a, b) => b.odometer - a.odometer);

    const prev = previousRefuelings[0];
    let distanceTraveled: number | undefined;
    let consumptionKmPerLiter: number | undefined;
    let costPerKm: number | undefined;

    if (prev && refueling.isFullTank && prev.isFullTank) {
      distanceTraveled = refueling.odometer - prev.odometer;
      if (distanceTraveled > 0 && refueling.liters > 0) {
        consumptionKmPerLiter = Number((distanceTraveled / refueling.liters).toFixed(2));
        costPerKm = Number((refueling.totalAmount / distanceTraveled).toFixed(2));
      }
    }

    const calculatedRefueling: Refueling = {
      ...refueling,
      distanceTraveled,
      consumptionKmPerLiter,
      costPerKm,
    };

    all.push(calculatedRefueling);
    await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(all));

    // Atualizar odômetro do veículo se for maior
    const vehicle = (await this.getVehicles()).find((v) => v.id === refueling.vehicleId);
    if (vehicle && refueling.odometer > vehicle.currentOdometer) {
      vehicle.currentOdometer = refueling.odometer;
      await this.saveVehicle(vehicle);
    }

    return calculatedRefueling;
  },

  async deleteRefueling(id: string): Promise<void> {
    const all = (await this.getRefuelings()).filter((r) => r.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(all));
  },

  // MANUTENÇÕES
  async getMaintenances(vehicleId?: string): Promise<MaintenanceItem[]> {
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

  async addMaintenance(maintenance: MaintenanceItem): Promise<void> {
    const all = await this.getMaintenances();
    all.push(maintenance);
    await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(all));

    // Atualizar odômetro do veículo se for maior
    const vehicle = (await this.getVehicles()).find((v) => v.id === maintenance.vehicleId);
    if (vehicle && maintenance.odometer > vehicle.currentOdometer) {
      vehicle.currentOdometer = maintenance.odometer;
      await this.saveVehicle(vehicle);
    }
  },

  async deleteMaintenance(id: string): Promise<void> {
    const all = (await this.getMaintenances()).filter((m) => m.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(all));
  },

  // RESET
  async resetDemo(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(DEMO_VEHICLES));
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_VEHICLE, DEMO_VEHICLES[0].id);
    await AsyncStorage.setItem(STORAGE_KEYS.REFUELINGS, JSON.stringify(DEMO_REFUELINGS));
    await AsyncStorage.setItem(STORAGE_KEYS.MAINTENANCES, JSON.stringify(DEMO_MAINTENANCES));
  },
};
