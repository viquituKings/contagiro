import { FuelType, Vehicle } from '@/types/vehicle';

/**
 * Normaliza a placa de um veículo para comparação, busca e deduplicação unívoca.
 * Remove pontuações, espaços e caracteres especiais, mantendo apenas letras e números em maiúsculo.
 * Ex: "BRA-2E19" -> "BRA2E19", " abc 1234 " -> "ABC1234".
 */
export function normalizePlate(plate?: string | null): string {
  if (!plate) return '';
  return String(plate).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Retorna se o conjunto de combustíveis ou o veículo representa um veículo 100% elétrico (EV).
 * Um veículo é 100% elétrico se tiver apenas o combustível 'eletrico' selecionado.
 */
export function isElectricVehicle(
  vehicleOrFuels?: Vehicle | FuelType[] | null,
  fuelTypeFallback?: FuelType
): boolean {
  if (!vehicleOrFuels) return false;

  let fuels: FuelType[] = [];
  if (Array.isArray(vehicleOrFuels)) {
    fuels = vehicleOrFuels;
  } else {
    if (vehicleOrFuels.isElectric === true && !vehicleOrFuels.isHybrid) return true;
    fuels =
      vehicleOrFuels.acceptedFuelTypes && vehicleOrFuels.acceptedFuelTypes.length > 0
        ? vehicleOrFuels.acceptedFuelTypes
        : [vehicleOrFuels.fuelType || fuelTypeFallback || 'gasolina'];
  }

  const hasElectric = fuels.includes('eletrico');
  const hasCombustion = fuels.some((f) => f !== 'eletrico');

  return hasElectric && !hasCombustion;
}

/**
 * Retorna se o veículo é um híbrido (combinação de 'eletrico' com 'gasolina', 'etanol', 'diesel' ou 'gnv').
 * Veículos híbridos são tratados no app como veículos a combustão normal.
 */
export function isHybridVehicle(
  vehicleOrFuels?: Vehicle | FuelType[] | null,
  fuelTypeFallback?: FuelType
): boolean {
  if (!vehicleOrFuels) return false;

  let fuels: FuelType[] = [];
  if (Array.isArray(vehicleOrFuels)) {
    fuels = vehicleOrFuels;
  } else {
    if (vehicleOrFuels.isHybrid === true) return true;
    fuels =
      vehicleOrFuels.acceptedFuelTypes && vehicleOrFuels.acceptedFuelTypes.length > 0
        ? vehicleOrFuels.acceptedFuelTypes
        : [vehicleOrFuels.fuelType || fuelTypeFallback || 'gasolina'];
  }

  const hasElectric = fuels.includes('eletrico');
  const hasCombustion = fuels.some((f) => f !== 'eletrico');

  return hasElectric && hasCombustion;
}

/**
 * Retorna a categoria descritiva de motorização do veículo.
 */
export function getVehiclePowertrainType(
  vehicleOrFuels?: Vehicle | FuelType[] | null
): 'eletrico' | 'hibrido' | 'combustao' {
  if (isElectricVehicle(vehicleOrFuels)) return 'eletrico';
  if (isHybridVehicle(vehicleOrFuels)) return 'hibrido';
  return 'combustao';
}

/**
 * Cálculos oficiais para recargas residenciais de veículos elétricos:
 * Passo 1: Energia líquida adicionada à bateria
 *    energiaLiquida = (((percentualFinal - percentualInicial) / 100) * capacidadeBateria)
 * Passo 2: Perda de eficiência (+12%)
 *    energiaConsumida = energiaLiquida * 1.12
 * Passo 3: Custo total com a tarifa de energia
 *    custoTotal = energiaConsumida * tarifaUsuario
 */
export interface ResidentialRechargeCalculation {
  netEnergy: number; // kWh adicionados à bateria
  grossEnergy: number; // kWh totais consumidos da tomada (+12% de perdas)
  totalCost: number; // Custo total em R$
  percentDiff: number; // Variação de carga (%)
}

export function calculateResidentialRecharge(
  batteryCapacityKwh: number,
  initialPercent: number,
  finalPercent: number,
  tariffRateKwh: number
): ResidentialRechargeCalculation {
  const cap = Math.max(0, batteryCapacityKwh || 0);
  const ini = Math.max(0, Math.min(100, initialPercent || 0));
  const fim = Math.max(0, Math.min(100, finalPercent || 0));
  const rate = Math.max(0, tariffRateKwh || 0);

  const percentDiff = Math.max(0, fim - ini);
  // Passo 1: Energia líquida
  const netEnergy = Number(((percentDiff / 100) * cap).toFixed(2));
  // Passo 2: Perda de eficiência (+12%)
  const grossEnergy = Number((netEnergy * 1.12).toFixed(2));
  // Passo 3: Custo com tarifa
  const totalCost = Number((grossEnergy * rate).toFixed(2));

  return {
    netEnergy,
    grossEnergy,
    totalCost,
    percentDiff,
  };
}
