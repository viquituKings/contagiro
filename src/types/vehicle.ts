export type FuelType = 'gasolina' | 'etanol' | 'diesel' | 'gnv';

export interface Vehicle {
  id: string;
  name: string; // Ex: "Onix Turbo"
  model: string; // Ex: "Chevrolet Onix 1.0 Turbo"
  plate: string; // Ex: "BRA2E19"
  year: number; // Ex: 2023
  tankCapacity: number; // Em litros (ex: 44)
  currentOdometer: number; // Em km (ex: 32450)
  fuelType: FuelType;
  photoUrl?: string;
  flexEfficiencyRatio?: number; // Padrão 0.70 (70%)
}

export interface Refueling {
  id: string;
  vehicleId: string;
  date: string; // ISO date string (YYYY-MM-DD)
  odometer: number; // km atual
  fuelType: FuelType;
  pricePerLiter: number; // R$/L
  totalAmount: number; // R$ total
  liters: number; // Litros
  isFullTank: boolean; // Se completou o tanque
  gasStation?: string; // Nome do posto
  notes?: string;
  // Campos calculados em relação ao abastecimento anterior
  distanceTraveled?: number; // km rodados desde o último tanque cheio
  consumptionKmPerLiter?: number; // km/L
  costPerKm?: number; // R$/km
}

export type MaintenanceCategory =
  | 'oleo_filtro'
  | 'pneus'
  | 'freios'
  | 'suspensao'
  | 'ar_condicionado'
  | 'bateria'
  | 'revisao_geral'
  | 'documentacao' // IPVA, Seguro, Licenciamento
  | 'outros';

export interface MaintenanceItem {
  id: string;
  vehicleId: string;
  date: string; // ISO date string
  odometer: number; // km quando foi feita
  category: MaintenanceCategory;
  title: string; // Ex: "Troca de Óleo 5W30 + Filtros"
  description?: string;
  workshop?: string; // Oficina
  cost: number; // R$
  nextDueOdometer?: number; // Próximo km previsto (ex: +10.000km)
  nextDueDate?: string; // Próxima data prevista
  isCompleted: boolean;
}

export interface MaintenanceAlert {
  category: MaintenanceCategory;
  title: string;
  status: 'ok' | 'proximo' | 'vencido';
  currentKm: number;
  dueKm?: number;
  kmRemaining?: number;
  dueDate?: string;
  daysRemaining?: number;
  estimatedCost: number;
}

export interface FuelForecast {
  averageDailyKm: number;
  averageConsumptionKmPerLiter: number;
  averagePricePerLiter: number;
  averageCostPerKm: number;
  projected30DaysKm: number;
  projected30DaysCost: number;
  projected60DaysCost: number;
  projected90DaysCost: number;
  upcomingMaintenancesCost30Days: number;
  totalProjectedCost30Days: number;
}
