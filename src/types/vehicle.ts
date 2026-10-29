export type FuelType = 'gasolina' | 'etanol' | 'diesel' | 'gnv';

export type VehicleType = 'carro' | 'moto';

export interface Vehicle {
  id: string;
  name: string; // Ex: "Onix Turbo" ou "Gol"
  model: string; // Ex: "Chevrolet Onix 1.0 Turbo"
  brand?: string; // Ex: "Chevrolet", "Volkswagen"
  plate: string; // Ex: "BRA2E19" ou "JFJ-1254"
  year: number; // Ex: 2023
  tankCapacity: number; // Em litros (ex: 44)
  currentOdometer: number; // Em km (ex: 32450)
  fuelType: FuelType;
  acceptedFuelTypes?: FuelType[]; // Tipos de combustível aceitos (ex: ['gasolina', 'etanol'])
  photoUrl?: string;
  flexEfficiencyRatio?: number; // Padrão 0.70 (70%)
  
  // Campos integrados com o Firestore / app anterior
  vehicleType?: VehicleType;
  engineDisplacement?: number; // Cilindrada em cc
  cadManPeriodica?: boolean;
  revisaoKm?: number;
  revisaoMes?: number;
  trocaOleoKm?: number;
  trocaOleoMeses?: number;
  ultimaRevisaoKm?: number;
  ultimaTrocaOleoKm?: number;
  proxRevKm?: number;
  proxTrocaOleoKm?: number;
  gastoManutencao?: number;
  manFreioDiant?: number;
  manFreioTras?: number;

  // Periodicidade exclusiva de motocicletas (corrente / relação)
  lubrificarCorrenteKm?: number;
  ultimaLubCorrenteKm?: number;
  proxLubCorrenteKm?: number;
  esticarCorrenteKm?: number;
  ultimaEsticarCorrenteKm?: number;
  proxEsticarCorrenteKm?: number;

  // Totalizadores agregados de abastecimento (otimização de banco)
  totalGastoAbast?: number;
  totalLitrosAbast?: number;
  mediaGeralKmPorLitro?: number;
  qtdAbastecimentos?: number;
  custoMedioPorKm?: number;
  qtdManutencoes?: number;
  order?: number;
  isPreferred?: boolean;
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
  plate?: string; // Placa do veículo associado
  isAdditivated?: boolean; // Se combustível aditivado
  previousOdometer?: number; // km anterior
  // Campos calculados em relação ao abastecimento anterior
  distanceTraveled?: number; // km rodados desde o último tanque cheio
  consumptionKmPerLiter?: number; // km/L
  costPerKm?: number; // R$/km
}

export type MaintenanceCategory =
  | 'oleo_filtro'
  | 'revisao_geral'
  | 'freios' // Pastilhas/Lonas de Freio
  | 'pneus' // Troca de Pneus
  | 'troca_pneus'
  | 'alinhamento_balanceamento' // Apenas Carro
  | 'rodizio_pneus' // Apenas Carro
  | 'esticar_corrente' // Apenas Moto
  | 'lubrificar_corrente' // Apenas Moto
  | 'suspensao'
  | 'ar_condicionado'
  | 'bateria'
  | 'documentacao' // IPVA, Seguro, Licenciamento
  | 'outros'; // Sem periodicidade

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
  side?: string; // Código do lado (ex: 'DIANTEIRO_ESQUERDO', 'DIANTEIRO', etc.)
  sideLabel?: string; // Descrição amigável do lado (ex: "Dianteiro Esquerdo")
}

export interface MaintenanceAlert {
  category: MaintenanceCategory;
  title: string;
  status: 'ok' | 'atencao' | 'alerta' | 'vencido' | 'proximo';
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
  vehicleBreakdowns?: { vehicle: Vehicle; forecast: FuelForecast }[];
}

export interface FuelPrices {
  gasolina: number;
  etanol: number;
  diesel: number;
  gnv: number;
  updatedAt?: string;
}
