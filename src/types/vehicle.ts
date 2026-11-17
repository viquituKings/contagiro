export type FuelType = 'gasolina' | 'etanol' | 'diesel' | 'gnv' | 'eletrico';

export type RechargeType = 'eletroposto' | 'residencial';

export type VehicleType = 'carro' | 'moto';

export interface Vehicle {
  id: string;
  name: string; // Ex: "Gol 1.0" ou "Corolla"
  model: string; // Ex: "Volkswagen Gol 1.0"
  brand?: string; // Ex: "Chevrolet", "Volkswagen"
  plate: string; // Ex: "BRA2E19" ou "ABC-1234"
  year: number; // Ex: 2023
  tankCapacity: number; // Em litros (ex: 44)
  currentOdometer: number; // Em km (ex: 32450)
  fuelType: FuelType;
  acceptedFuelTypes?: FuelType[]; // Tipos de combustível aceitos (ex: ['gasolina', 'etanol'])
  photoUrl?: string;
  flexEfficiencyRatio?: number; // Padrão 0.70 (70%)

  // Datas de cadastro e histórico de transferência
  createdAt?: string; // Data de cadastro original (ex: '2024-05-10')
  transferredAt?: string; // Data de transferência para o usuário atual (ex: '2024-11-08')
  transferredFrom?: string; // E-mail do usuário anterior que realizou a transferência

  // Compartilhamento de veículo com múltiplos usuários
  ownerEmail?: string; // E-mail do proprietário original
  isShared?: boolean; // Se o veículo foi compartilhado com o usuário atual (apenas visualização/lançamentos)
  sharedWith?: string[]; // Lista de e-mails com quem o proprietário compartilhou o veículo
  sharedAt?: string; // Data em que o compartilhamento foi realizado

  // Campos integrados com o Firestore / app anterior
  vehicleType?: VehicleType;
  engineDisplacement?: number; // Cilindrada em cc
  batteryCapacity?: number; // Capacidade da bateria em kWh (veículos elétricos)
  declaredConsumption?: number; // Consumo médio informado de fábrica
  consumptionUnit?: 'kwh_100km' | 'km_kwh'; // Unidade do consumo informado
  isElectric?: boolean; // Veículo 100% elétrico
  isHybrid?: boolean; // Veículo híbrido (combustão + elétrico)
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

  // Manutenções periódicas personalizadas cadastradas pelo usuário (para todos os veículos)
  customPeriodicMaintenances?: CustomPeriodicMaintenance[];

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
  registeredBy?: string; // Nome/e-mail do usuário que registrou o abastecimento

  // Exclusivo de Veículos Elétricos (Recargas)
  rechargeType?: RechargeType;
  kwh?: number; // Quantidade de kWh recarregados
  pricePerKwh?: number; // R$/kWh
  batteryInitialPercent?: number; // % inicial da bateria (carregamento residencial)
  batteryFinalPercent?: number; // % final da bateria (carregamento residencial)
  netEnergy?: number; // Energia líquida adicionada à bateria (kWh)
  grossEnergy?: number; // Energia total consumida da rede com perda de 12% (kWh)
  energyTariff?: number; // Tarifa de energia (R$/kWh) utilizada no cálculo
}

export interface ElectricityTariff {
  totalAmount: number; // Valor total da última conta de energia em R$
  totalKwh: number; // Consumo total da conta em kWh
  kwhRate: number; // Tarifa calculada em R$/kWh (totalAmount / totalKwh)
  referenceMonth?: string; // Mês de referência (ex: 'Novembro/2026')
  updatedAt: string; // ISO date da última atualização
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

export interface CustomPeriodicMaintenance {
  id: string; // Identificador único da manutenção periódica customizada
  title: string; // Descrição informada pelo usuário (ex: "Troca do Fluido da Bateria", "Filtro de Ar de Cabine")
  intervalKm: number; // A cada quantos km deve ser realizada
  lastKm?: number; // Quilometragem da última execução
  nextDueKm?: number; // Próxima quilometragem prevista (lastKm + intervalKm)
  estimatedCost?: number; // Custo estimado aproximado em R$
  createdAt?: string; // Data ISO da criação
}

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
  notes?: string; // Observações adicionais sobre o serviço/peças
  receiptUrl?: string; // URL remota no Firebase Cloud Storage (ou URI local temporária para exibição offline antes do upload)
  registeredBy?: string; // Nome/e-mail do usuário que registrou a manutenção
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
  isInactive?: boolean;
  activeVehiclesCount?: number;
  inactiveVehiclesCount?: number;
  hasCalculatedConsumption?: boolean;
}

export interface FuelPrices {
  gasolina: number;
  etanol: number;
  diesel: number;
  gnv: number;
  eletrico?: number;
  updatedAt?: string;
}
