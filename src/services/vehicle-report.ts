import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Vehicle, Refueling, MaintenanceItem } from '@/types/vehicle';
import { formatEngineDisplacement } from '@/utils/engine';
import { getAvatarCacheMap } from '@/services/image-picker';
import { APP_ICON_BASE64 } from '@/constants/app-icon';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_NAMES_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export interface MonthMetric {
  key: string; // "YYYY-MM"
  shortLabel: string; // "Nov/26"
  monthName: string; // "Novembro"
  year: number;
  isCurrent: boolean;
  value: number;
  hasData: boolean;
  count: number;
  displayValue: string;
}

export interface MetricChartData {
  title: string;
  unit: string;
  color: string;
  colorLight: string;
  higherIsBetter: boolean;
  months: MonthMetric[];
  avg: number;
  total: number;
  bestMonth: MonthMetric | null;
  worstMonth: MonthMetric | null;
  activeMonthsCount: number;
}

/**
 * Calcula os dados mensais dos últimos 12 meses para um tipo de métrica
 */
export function calculate12MonthsData(
  type: 'consumo' | 'custo_km' | 'combustivel' | 'oficina',
  vehicleId: string,
  refuelings: Refueling[],
  maintenances: MaintenanceItem[]
): MetricChartData {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  const months: MonthMetric[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(curYear, curMonth - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const shortLabel = `${MONTH_NAMES[m]}/${String(y).slice(-2)}`;
    const monthName = MONTH_NAMES_FULL[m];
    const isCurrent = i === 0;

    const matchingRefs = refuelings.filter(
      (r) => r.vehicleId === vehicleId && r.date && r.date.startsWith(key)
    );
    const matchingMnts = maintenances.filter(
      (item) => item.vehicleId === vehicleId && item.date && item.date.startsWith(key)
    );

    let value = 0;
    let hasData = false;
    let count = 0;
    let displayValue = '-';

    if (type === 'consumo') {
      const measured = matchingRefs.filter(
        (r) => r.consumptionKmPerLiter != null && r.consumptionKmPerLiter > 0
      );
      if (measured.length > 0) {
        const sum = measured.reduce((acc, r) => acc + (r.consumptionKmPerLiter || 0), 0);
        value = Number((sum / measured.length).toFixed(1));
        hasData = true;
        count = measured.length;
        displayValue = `${value.toFixed(1)} km/L`;
      }
    } else if (type === 'custo_km') {
      const measured = matchingRefs.filter((r) => r.costPerKm != null && r.costPerKm > 0);
      if (measured.length > 0) {
        const sum = measured.reduce((acc, r) => acc + (r.costPerKm || 0), 0);
        value = Number((sum / measured.length).toFixed(2));
        hasData = true;
        count = measured.length;
        displayValue = `R$ ${value.toFixed(2)}`;
      }
    } else if (type === 'combustivel') {
      if (matchingRefs.length > 0) {
        value = matchingRefs.reduce((acc, r) => acc + (r.totalAmount || 0), 0);
        hasData = value > 0;
        count = matchingRefs.length;
        displayValue = `R$ ${Math.round(value).toLocaleString('pt-BR')}`;
      }
    } else if (type === 'oficina') {
      if (matchingMnts.length > 0) {
        value = matchingMnts.reduce((acc, item) => acc + (item.cost || 0), 0);
        hasData = value > 0;
        count = matchingMnts.length;
        displayValue = `R$ ${Math.round(value).toLocaleString('pt-BR')}`;
      }
    }

    months.push({
      key,
      shortLabel,
      monthName,
      year: y,
      isCurrent,
      value,
      hasData,
      count,
      displayValue,
    });
  }

  const activeMonths = months.filter((m) => m.hasData);
  const activeMonthsCount = activeMonths.length;
  const total = activeMonths.reduce((acc, m) => acc + m.value, 0);
  const avg = activeMonthsCount > 0 ? total / activeMonthsCount : 0;

  let bestMonth: MonthMetric | null = null;
  let worstMonth: MonthMetric | null = null;

  if (activeMonths.length > 0) {
    bestMonth = activeMonths[0];
    worstMonth = activeMonths[0];
    const higherIsBetter = type === 'consumo';

    for (const m of activeMonths) {
      if (higherIsBetter) {
        if (m.value > bestMonth.value) bestMonth = m;
        if (m.value < worstMonth.value) worstMonth = m;
      } else {
        if (m.value < bestMonth.value) bestMonth = m;
        if (m.value > worstMonth.value) worstMonth = m;
      }
    }
  }

  const configs = {
    consumo: {
      title: 'Consumo Médio Mensal',
      unit: 'km/L',
      color: '#10B981',
      colorLight: '#D1FAE5',
      higherIsBetter: true,
    },
    custo_km: {
      title: 'Custo Médio por km',
      unit: 'R$/km',
      color: '#3B82F6',
      colorLight: '#DBEAFE',
      higherIsBetter: false,
    },
    combustivel: {
      title: 'Gasto Mensal com Combustível',
      unit: 'R$',
      color: '#F97316',
      colorLight: '#FFEDD5',
      higherIsBetter: false,
    },
    oficina: {
      title: 'Gasto Mensal com Oficina / Manutenção',
      unit: 'R$',
      color: '#8B5CF6',
      colorLight: '#EDE9FE',
      higherIsBetter: false,
    },
  };

  const conf = configs[type];

  return {
    title: conf.title,
    unit: conf.unit,
    color: conf.color,
    colorLight: conf.colorLight,
    higherIsBetter: conf.higherIsBetter,
    months,
    avg,
    total,
    bestMonth,
    worstMonth,
    activeMonthsCount,
  };
}

/**
 * Renderiza um gráfico SVG vetorial nítido e responsivo para inserção no HTML do PDF
 */
function renderSvgBarChart(chartData: MetricChartData): string {
  const width = 680;
  const height = 180;
  const plotLeft = 40;
  const plotRight = 20;
  const plotTop = 26;
  const plotBottom = 34;
  const plotWidth = width - plotLeft - plotRight;
  const plotHeight = height - plotTop - plotBottom;
  const baselineY = plotTop + plotHeight;

  const values = chartData.months.map((m) => m.value);
  const maxVal = Math.max(...values, 0.001);
  // Arredonda teto para régua
  const ceiling = maxVal <= 1 ? 1 : Math.ceil(maxVal * 1.15);

  const slotWidth = plotWidth / 12;
  const barWidth = 24;

  // Linhas de grade horizontais (25%, 50%, 75%, 100%)
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const gridLinesHtml = gridLevels
    .map((lvl) => {
      const y = baselineY - plotHeight * lvl;
      const labelVal = (ceiling * lvl).toLocaleString('pt-BR', {
        maximumFractionDigits: ceiling < 5 ? 1 : 0,
      });
      return `
        <line x1="${plotLeft}" y1="${y}" x2="${width - plotRight}" y2="${y}" stroke="#E2E8F0" stroke-dasharray="3,3" stroke-width="1" />
        <text x="${plotLeft - 6}" y="${y + 3}" text-anchor="end" font-size="8" fill="#94A3B8" font-family="sans-serif">${labelVal}</text>
      `;
    })
    .join('');

  // Barras e rótulos
  const barsHtml = chartData.months
    .map((m, idx) => {
      const slotX = plotLeft + idx * slotWidth;
      const barX = slotX + (slotWidth - barWidth) / 2;
      const centerX = barX + barWidth / 2;

      let barSvg = '';
      let valueTextSvg = '';

      if (m.hasData && m.value > 0) {
        const barHeight = Math.max((m.value / ceiling) * plotHeight, 4);
        const barY = baselineY - barHeight;

        barSvg = `
          <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="3" ry="3" fill="${chartData.color}" opacity="${m.isCurrent ? '1.0' : '0.88'}" />
        `;

        let formattedVal = '';
        if (chartData.unit === 'km/L') {
          formattedVal = m.value.toFixed(1);
        } else if (chartData.unit === 'R$/km') {
          formattedVal = m.value.toFixed(2);
        } else {
          formattedVal = Math.round(m.value) >= 1000
            ? `${(m.value / 1000).toFixed(1)}k`
            : `${Math.round(m.value)}`;
        }

        valueTextSvg = `
          <text x="${centerX}" y="${barY - 5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#0F172A" font-family="sans-serif">${formattedVal}</text>
        `;
      } else {
        // Ponto sutil indicando mês sem dados
        barSvg = `
          <rect x="${barX}" y="${baselineY - 2}" width="${barWidth}" height="2" fill="#E2E8F0" rx="1" />
        `;
        valueTextSvg = `
          <text x="${centerX}" y="${baselineY - 6}" text-anchor="middle" font-size="8" fill="#CBD5E1" font-family="sans-serif">-</text>
        `;
      }

      // Rótulo do mês no rodapé
      const labelWeight = m.isCurrent ? '700' : '500';
      const labelColor = m.isCurrent ? chartData.color : '#64748B';
      const monthLabelSvg = `
        <text x="${centerX}" y="${baselineY + 14}" text-anchor="middle" font-size="8.5" font-weight="${labelWeight}" fill="${labelColor}" font-family="sans-serif">${m.shortLabel}</text>
      `;

      return `${barSvg}${valueTextSvg}${monthLabelSvg}`;
    })
    .join('');

  return `
    <svg width="100%" height="180" viewBox="0 0 ${width} ${height}" style="overflow: visible; display: block; margin: 0 auto;">
      <!-- Grade de fundo -->
      ${gridLinesHtml}
      <!-- Eixo base X -->
      <line x1="${plotLeft}" y1="${baselineY}" x2="${width - plotRight}" y2="${baselineY}" stroke="#CBD5E1" stroke-width="1.5" />
      <!-- Barras e textos -->
      ${barsHtml}
    </svg>
  `;
}

/**
 * Constrói o HTML completo do relatório pronto para conversão em PDF
 */
export async function generateVehicleReportHtml(params: {
  vehicle: Vehicle;
  refuelings: Refueling[];
  maintenances: MaintenanceItem[];
}): Promise<string> {
  const { vehicle, refuelings, maintenances } = params;

  // 1. Tenta recuperar imagem do veículo em Base64
  let photoDataUri = '';
  if (vehicle.photoUrl) {
    if (vehicle.photoUrl.startsWith('data:image/')) {
      photoDataUri = vehicle.photoUrl;
    } else {
      try {
        const avatarMap = await getAvatarCacheMap();
        const cached = avatarMap[`vehicle_${vehicle.id}`];
        if (cached && cached.startsWith('data:image/')) {
          photoDataUri = cached;
        } else if (vehicle.photoUrl.startsWith('http')) {
          photoDataUri = vehicle.photoUrl;
        }
      } catch {
        // Fallback para placeholder
      }
    }
  }

  // 2. Calcula métricas dos 4 gráficos dos últimos 12 meses
  const chartConsumo = calculate12MonthsData('consumo', vehicle.id, refuelings, maintenances);
  const chartCustoKm = calculate12MonthsData('custo_km', vehicle.id, refuelings, maintenances);
  const chartCombustivel = calculate12MonthsData('combustivel', vehicle.id, refuelings, maintenances);
  const chartOficina = calculate12MonthsData('oficina', vehicle.id, refuelings, maintenances);

  // 3. Totais e dados gerais
  const isMoto = vehicle.vehicleType === 'moto';
  const fuelsDisplay =
    vehicle.acceptedFuelTypes && vehicle.acceptedFuelTypes.length > 0
      ? vehicle.acceptedFuelTypes.join(' / ')
      : vehicle.fuelType || 'Gasolina';
  const displayBrandModel =
    vehicle.brand && !vehicle.model?.toLowerCase().includes(vehicle.brand.toLowerCase())
      ? `${vehicle.brand} ${vehicle.model}`
      : vehicle.model || vehicle.name;

  const totalGastoCombustivel = vehicle.totalGastoAbast || 0;
  const totalGastoOficina = vehicle.gastoManutencao || 0;
  const totalGastoConsolidado = totalGastoCombustivel + totalGastoOficina;

  const now = new Date();
  const dataEmissao = now.toLocaleDateString('pt-BR');
  const horaEmissao = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // 4. Montagem das linhas da tabela de resumo mensal (12 meses)
  const tableRowsHtml = chartConsumo.months
    .map((m, idx) => {
      const c = m.hasData ? `${m.value.toFixed(1)} km/L` : '-';
      const cKm = chartCustoKm.months[idx].hasData ? `R$ ${chartCustoKm.months[idx].value.toFixed(2)}` : '-';
      const comb = chartCombustivel.months[idx].hasData
        ? `R$ ${chartCombustivel.months[idx].value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : 'R$ 0,00';
      const ofc = chartOficina.months[idx].hasData
        ? `R$ ${chartOficina.months[idx].value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : 'R$ 0,00';
      const somaMes =
        (chartCombustivel.months[idx].value || 0) + (chartOficina.months[idx].value || 0);
      const somaMesDisplay =
        somaMes > 0
          ? `R$ ${somaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : 'R$ 0,00';

      const bgRow = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      const isCur = m.isCurrent ? 'font-weight: 700; color: #10B981;' : '';

      return `
        <tr style="background: ${bgRow};">
          <td style="padding: 7px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11px; ${isCur}">${m.shortLabel} ${m.isCurrent ? '*(atual)*' : ''}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #E2E8F0; text-align: center; font-size: 11px; color: #10B981; font-weight: 600;">${c}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #E2E8F0; text-align: center; font-size: 11px; color: #3B82F6; font-weight: 600;">${cKm}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #E2E8F0; text-align: right; font-size: 11px; color: #D97706; font-weight: 600;">${comb}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #E2E8F0; text-align: right; font-size: 11px; color: #7C3AED; font-weight: 600;">${ofc}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #E2E8F0; text-align: right; font-size: 11px; font-weight: 700; color: #0F172A;">${somaMesDisplay}</td>
        </tr>
      `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório do Veículo - ${vehicle.name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 12mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      color: #0F172A;
      line-height: 1.4;
      font-size: 12px;
    }
    .page-container {
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 2px solid #10B981;
      margin-bottom: 16px;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo-img {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      object-fit: cover;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
      border: 1px solid #E2E8F0;
      display: block;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .header-meta {
      text-align: right;
    }
    .report-badge {
      display: inline-block;
      background: #ECFDF5;
      color: #047857;
      border: 1px solid #A7F3D0;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .report-date {
      font-size: 10px;
      color: #64748B;
      margin-top: 3px;
    }

    /* SEÇÃO */
    .section-title-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 18px;
      margin-bottom: 10px;
      page-break-after: avoid;
      break-after: avoid;
    }
    .section-icon-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10B981;
    }
    .section-title {
      font-size: 14px;
      font-weight: 800;
      color: #0F172A;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0;
    }

    /* HERO CARD DE CADASTRO */
    .hero-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      gap: 16px;
      align-items: center;
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .hero-photo-img {
      width: 90px;
      height: 90px;
      border-radius: 8px;
      object-fit: cover;
      border: 2px solid #CBD5E1;
      background: #FFFFFF;
      flex-shrink: 0;
    }
    .hero-photo-placeholder {
      width: 90px;
      height: 90px;
      border-radius: 8px;
      background: #ECFDF5;
      border: 2px solid #A7F3D0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #10B981;
      font-size: 32px;
      flex-shrink: 0;
    }
    .hero-info {
      flex: 1;
    }
    .hero-veh-name {
      font-size: 19px;
      font-weight: 800;
      color: #0F172A;
      margin: 0 0 2px 0;
    }
    .hero-veh-sub {
      font-size: 13px;
      color: #64748B;
      margin: 0 0 8px 0;
    }
    .plate-badge-mercosul {
      display: inline-block;
      border: 1.5px solid #0F172A;
      border-radius: 4px;
      overflow: hidden;
      background: #FFFFFF;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
      vertical-align: middle;
    }
    .plate-header-blue {
      background: #003399;
      color: #FFFFFF;
      font-size: 6.5px;
      font-weight: 900;
      letter-spacing: 1px;
      text-align: center;
      padding: 1px 6px;
      line-height: 1.1;
    }
    .plate-chars {
      font-size: 13px;
      font-weight: 900;
      color: #0F172A;
      letter-spacing: 1.5px;
      padding: 2px 8px;
      text-align: center;
      font-family: "Courier New", Courier, monospace;
      line-height: 1.1;
    }

    /* TABELA DE DADOS CADASTRAIS */
    .cadastral-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 16px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .cadastral-item {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 8px 12px;
    }
    .cadastral-label {
      font-size: 9.5px;
      color: #64748B;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
    }
    .cadastral-value {
      font-size: 12.5px;
      font-weight: 700;
      color: #0F172A;
    }

    /* CARD DE PLANO PERIÓDICO */
    .periodic-banner {
      background: #F0FDF4;
      border: 1px solid #BBF7D0;
      border-radius: 8px;
      padding: 8px 12px;
      margin-top: -6px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #166534;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* TOTALIZADORES GRID */
    .totalizers-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .totalizer-box {
      border-radius: 8px;
      padding: 10px 12px;
      border: 1px solid #E2E8F0;
      background: #FFFFFF;
    }
    .totalizer-label {
      font-size: 9.5px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 4px;
    }
    .totalizer-val {
      font-size: 16px;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 2px;
    }
    .totalizer-sub {
      font-size: 9px;
      color: #64748B;
    }

    .consolidated-card {
      background: #F8FAFC;
      border: 1.5px solid #10B981;
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .consolidated-title {
      font-size: 13px;
      font-weight: 800;
      color: #0F172A;
      margin: 0;
    }
    .consolidated-desc {
      font-size: 10px;
      color: #64748B;
      margin: 2px 0 0 0;
    }
    .consolidated-price {
      font-size: 20px;
      font-weight: 900;
      color: #10B981;
    }

    /* GRÁFICOS CONTAINER */
    .chart-card {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 12px 14px 10px 14px;
      margin-bottom: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      border-bottom: 1px solid #F1F5F9;
      padding-bottom: 6px;
    }
    .chart-title-tag {
      font-size: 12px;
      font-weight: 800;
      color: #0F172A;
    }
    .chart-badge {
      font-size: 9.5px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 10px;
    }
    .chart-kpis {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid #F1F5F9;
      font-size: 10px;
      color: #64748B;
    }
    .chart-kpi-item strong {
      color: #0F172A;
    }

    /* TABELA DE DADOS DOS 12 MESES */
    .data-table-card {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 16px;
      margin-bottom: 20px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background: #F1F5F9;
      padding: 8px 10px;
      font-size: 10px;
      font-weight: 800;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      border-bottom: 2px solid #CBD5E1;
    }

    /* FOOTER */
    .footer-bar {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #E2E8F0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      color: #94A3B8;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .page-break {
      page-break-before: always;
      break-before: page;
    }
  </style>
</head>
<body>
  <div class="page-container">
    <!-- CABEÇALHO DO DOCUMENTO -->
    <div class="header-bar">
      <div class="brand-group">
        <img src="${APP_ICON_BASE64}" class="brand-logo-img" alt="Ícone do App Contagiro" />
        <div>
          <h1 class="brand-title">Relatório de Gestão Veicular</h1>
        </div>
      </div>
      <div class="header-meta">
        <span class="report-badge">Histórico e Desempenho</span>
        <div class="report-date">Emissão: ${dataEmissao} às ${horaEmissao}</div>
      </div>
    </div>

    <!-- SEÇÃO 1: DADOS CADASTRAIS DO VEÍCULO (PRIMEIRO) -->
    <div class="section-title-wrap">
      <span class="section-icon-dot"></span>
      <h2 class="section-title">1. Dados Cadastrais do Veículo</h2>
    </div>

    <div class="hero-card">
      ${
        photoDataUri
          ? `<img src="${photoDataUri}" class="hero-photo-img" alt="Foto do Veículo" />`
          : `<div class="hero-photo-placeholder">${isMoto ? '🏍️' : '🚗'}</div>`
      }
      <div class="hero-info">
        <h3 class="hero-veh-name">${vehicle.name}</h3>
        <p class="hero-veh-sub">${displayBrandModel} • ${isMoto ? 'Motocicleta' : 'Automóvel'}</p>
        <div>
          <div class="plate-badge-mercosul">
            <div class="plate-header-blue">BRASIL</div>
            <div class="plate-chars">${vehicle.plate.toUpperCase()}</div>
          </div>
          ${
            vehicle.isPreferred
              ? `<span style="margin-left: 8px; font-size: 10px; font-weight: 700; background: #FEF3C7; color: #B45309; padding: 3px 8px; border-radius: 12px; border: 1px solid #FDE68A;">⭐ Preferido</span>`
              : ''
          }
        </div>
      </div>
    </div>

    <!-- GRID DE ESPECIFICAÇÕES CADASTRAIS -->
    <div class="cadastral-grid">
      <div class="cadastral-item">
        <div class="cadastral-label">Tipo de Veículo</div>
        <div class="cadastral-value">${isMoto ? 'Motocicleta' : 'Carro'}</div>
      </div>

      <div class="cadastral-item">
        <div class="cadastral-label">Marca</div>
        <div class="cadastral-value">${vehicle.brand || '--'}</div>
      </div>

      <div class="cadastral-item">
        <div class="cadastral-label">Modelo / Versão</div>
        <div class="cadastral-value">${vehicle.model || vehicle.name}</div>
      </div>

      <div class="cadastral-item">
        <div class="cadastral-label">Ano de Fabricação</div>
        <div class="cadastral-value">${vehicle.year || '--'}</div>
      </div>

      <div class="cadastral-item">
        <div class="cadastral-label">Odômetro Atual</div>
        <div class="cadastral-value" style="color: #10B981;">${vehicle.currentOdometer.toLocaleString('pt-BR')} km</div>
      </div>

      <div class="cadastral-item">
        <div class="cadastral-label">Capacidade do Tanque</div>
        <div class="cadastral-value">${vehicle.tankCapacity} Litros</div>
      </div>

      <div class="cadastral-item">
        <div class="cadastral-label">Motorização / Cilindrada</div>
        <div class="cadastral-value">${vehicle.engineDisplacement ? formatEngineDisplacement(vehicle.engineDisplacement) : '--'}</div>
      </div>

      <div class="cadastral-item">
        <div class="cadastral-label">Combustíveis Aceitos</div>
        <div class="cadastral-value" style="text-transform: capitalize;">${fuelsDisplay}</div>
      </div>

      <div class="cadastral-item">
        <div class="cadastral-label">Total de Abastecimentos</div>
        <div class="cadastral-value">${vehicle.qtdAbastecimentos || refuelings.length || 0} registros</div>
      </div>
    </div>

    ${
      vehicle.cadManPeriodica
        ? `
      <div class="periodic-banner">
        <div><strong>🛡️ Plano de Manutenção Periódica:</strong> Ativo na Oficina</div>
        <div>
          ${vehicle.proxRevKm ? `<span>Próx. Revisão: <strong>${vehicle.proxRevKm.toLocaleString('pt-BR')} km</strong></span> • ` : ''}
          ${vehicle.proxTrocaOleoKm ? `<span>Próx. Óleo: <strong>${vehicle.proxTrocaOleoKm.toLocaleString('pt-BR')} km</strong></span>` : ''}
        </div>
      </div>
      `
        : ''
    }

    <!-- SEÇÃO 2: TOTALIZADORES E DESEMPENHO GERAL (DEPOIS DOS DADOS CADASTRAIS) -->
    <div class="section-title-wrap">
      <span class="section-icon-dot"></span>
      <h2 class="section-title">2. Totalizadores e Desempenho Geral</h2>
    </div>

    <div class="totalizers-grid">
      <!-- 1. CONSUMO MÉDIO -->
      <div class="totalizer-box" style="border-left: 3px solid #10B981;">
        <div class="totalizer-label">Consumo Médio</div>
        <div class="totalizer-val" style="color: #10B981;">
          ${vehicle.mediaGeralKmPorLitro && vehicle.mediaGeralKmPorLitro > 0 ? `${vehicle.mediaGeralKmPorLitro.toLocaleString('pt-BR')} km/L` : '--'}
        </div>
        <div class="totalizer-sub">Média consolidada</div>
      </div>

      <!-- 2. CUSTO POR KM -->
      <div class="totalizer-box" style="border-left: 3px solid #3B82F6;">
        <div class="totalizer-label">Custo por km</div>
        <div class="totalizer-val" style="color: #3B82F6;">
          ${vehicle.custoMedioPorKm && vehicle.custoMedioPorKm > 0 ? `R$ ${vehicle.custoMedioPorKm.toFixed(2)}` : '--'}
        </div>
        <div class="totalizer-sub">R$ por km rodado</div>
      </div>

      <!-- 3. TOTAL COMBUSTÍVEL -->
      <div class="totalizer-box" style="border-left: 3px solid #F97316;">
        <div class="totalizer-label">Total Combustível</div>
        <div class="totalizer-val" style="color: #EA580C;">
          R$ ${totalGastoCombustivel.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div class="totalizer-sub">${vehicle.totalLitrosAbast ? `${vehicle.totalLitrosAbast.toLocaleString('pt-BR')} L` : '--'}</div>
      </div>

      <!-- 4. TOTAL OFICINA -->
      <div class="totalizer-box" style="border-left: 3px solid #8B5CF6;">
        <div class="totalizer-label">Total Oficina</div>
        <div class="totalizer-val" style="color: #7C3AED;">
          R$ ${totalGastoOficina.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div class="totalizer-sub">${vehicle.qtdManutencoes || 0} manutenções</div>
      </div>
    </div>

    <!-- CUSTO TOTAL CONSOLIDADO -->
    <div class="consolidated-card">
      <div>
        <h4 class="consolidated-title">Gasto Total Geral Consolidado</h4>
        <p class="consolidated-desc">Soma acumulada de todos os gastos em combustível e manutenções/oficina</p>
      </div>
      <div class="consolidated-price">
        R$ ${totalGastoConsolidado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>

    <!-- QUEBRA DE PÁGINA PARA SEÇÃO DE GRÁFICOS -->
    <div class="page-break"></div>

    <!-- SEÇÃO 3: GRÁFICOS DOS ÚLTIMOS 12 MESES -->
    <div class="section-title-wrap" style="margin-top: 10px;">
      <span class="section-icon-dot"></span>
      <h2 class="section-title">3. Gráficos de Evolução (Últimos 12 Meses)</h2>
    </div>
    <p style="font-size: 11px; color: #64748B; margin-top: -4px; margin-bottom: 14px;">
      Acompanhamento analítico mensal do desempenho e custos do veículo ao longo do último ano.
    </p>

    <!-- GRÁFICO 1: CONSUMO MÉDIO -->
    <div class="chart-card">
      <div class="chart-header">
        <span class="chart-title-tag">📈 Consumo Médio Mensal (km/L)</span>
        <span class="chart-badge" style="background: #D1FAE5; color: #065F46;">
          ${chartConsumo.avg > 0 ? `Média: ${chartConsumo.avg.toFixed(1)} km/L` : 'Sem registros'}
        </span>
      </div>
      ${renderSvgBarChart(chartConsumo)}
      <div class="chart-kpis">
        <div class="chart-kpi-item">Meses com dados: <strong>${chartConsumo.activeMonthsCount} de 12</strong></div>
        ${chartConsumo.bestMonth ? `<div class="chart-kpi-item">Melhor mês: <strong>${chartConsumo.bestMonth.displayValue} (${chartConsumo.bestMonth.shortLabel})</strong></div>` : ''}
        ${chartConsumo.worstMonth ? `<div class="chart-kpi-item">Menor média: <strong>${chartConsumo.worstMonth.displayValue} (${chartConsumo.worstMonth.shortLabel})</strong></div>` : ''}
      </div>
    </div>

    <!-- GRÁFICO 2: CUSTO POR KM -->
    <div class="chart-card">
      <div class="chart-header">
        <span class="chart-title-tag">💵 Custo Médio por Quilômetro Rodado (R$/km)</span>
        <span class="chart-badge" style="background: #DBEAFE; color: #1E40AF;">
          ${chartCustoKm.avg > 0 ? `Média: R$ ${chartCustoKm.avg.toFixed(2)} / km` : 'Sem registros'}
        </span>
      </div>
      ${renderSvgBarChart(chartCustoKm)}
      <div class="chart-kpis">
        <div class="chart-kpi-item">Meses com dados: <strong>${chartCustoKm.activeMonthsCount} de 12</strong></div>
        ${chartCustoKm.bestMonth ? `<div class="chart-kpi-item">Menor custo: <strong>${chartCustoKm.bestMonth.displayValue} (${chartCustoKm.bestMonth.shortLabel})</strong></div>` : ''}
      </div>
    </div>

    <!-- GRÁFICO 3: GASTOS COM COMBUSTÍVEL -->
    <div class="chart-card">
      <div class="chart-header">
        <span class="chart-title-tag">⛽ Total Gasto com Combustível (R$)</span>
        <span class="chart-badge" style="background: #FFEDD5; color: #9A3412;">
          Total 12m: R$ ${chartCombustivel.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      ${renderSvgBarChart(chartCombustivel)}
      <div class="chart-kpis">
        <div class="chart-kpi-item">Total acumulado 12 meses: <strong>R$ ${chartCombustivel.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div class="chart-kpi-item">Média mensal: <strong>R$ ${chartCombustivel.avg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
      </div>
    </div>

    <!-- GRÁFICO 4: GASTOS COM OFICINA / MANUTENÇÃO -->
    <div class="chart-card">
      <div class="chart-header">
        <span class="chart-title-tag">🔧 Total Gasto com Oficina e Manutenções (R$)</span>
        <span class="chart-badge" style="background: #EDE9FE; color: #5B21B6;">
          Total 12m: R$ ${chartOficina.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      ${renderSvgBarChart(chartOficina)}
      <div class="chart-kpis">
        <div class="chart-kpi-item">Total acumulado 12 meses: <strong>R$ ${chartOficina.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div class="chart-kpi-item">Média mensal: <strong>R$ ${chartOficina.avg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
      </div>
    </div>

    <!-- TABELA RESUMO MENSAL DETALHADA -->
    <div class="data-table-card">
      <table>
        <thead>
          <tr>
            <th style="text-align: left;">Mês / Ano</th>
            <th style="text-align: center;">Consumo (km/L)</th>
            <th style="text-align: center;">Custo / km</th>
            <th style="text-align: right;">Combustível</th>
            <th style="text-align: right;">Oficina</th>
            <th style="text-align: right;">Total Mês</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>

    <!-- RODAPÉ DO RELATÓRIO -->
    <div class="footer-bar">
      <div>Contagiro App • Gestão Inteligente e Controle Financeiro Veicular</div>
      <div>Veículo ID: ${vehicle.id} • Relatório Oficial</div>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Gera o arquivo PDF e aciona o compartilhamento nativo do sistema operacional
 */
export async function exportVehicleReportPdf(params: {
  vehicle: Vehicle;
  refuelings: Refueling[];
  maintenances: MaintenanceItem[];
}): Promise<string> {
  const html = await generateVehicleReportHtml(params);

  // 1. Gera o PDF incluindo a representação Base64 em memória
  const printResult = await Print.printToFileAsync({
    html,
    base64: true,
  });

  const cleanPlate = (params.vehicle.plate || 'veiculo').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `relatorio_${cleanPlate}_${Date.now()}.pdf`;
  let shareUri = printResult.uri;

  // 2. Grava o arquivo Base64 no Paths.cache do aplicativo.
  // Isso garante que o arquivo fique sob o diretório escopado e seguro do app,
  // eliminando o erro "Not allowed to read file under given URL" no Android.
  if (printResult.base64) {
    try {
      const targetFile = new File(Paths.cache, fileName);
      if (!targetFile.exists) {
        targetFile.create();
      }
      await targetFile.write(printResult.base64, { encoding: 'base64' });
      shareUri = targetFile.uri;
    } catch (fsErr) {
      console.warn('Aviso ao gravar PDF em Paths.cache via base64:', fsErr);
    }
  }

  // 3. Tenta compartilhar via menu nativo (WhatsApp, E-mail, Salvar em Arquivos/Drive)
  try {
    const isShareAvailable = await Sharing.isAvailableAsync();
    if (isShareAvailable) {
      await Sharing.shareAsync(shareUri, {
        mimeType: 'application/pdf',
        dialogTitle: `Relatório - ${params.vehicle.name} (${params.vehicle.plate})`,
        UTI: '.pdf',
      });
      return shareUri;
    }
  } catch (shareErr) {
    console.warn('Aviso: Sharing.shareAsync falhou, acionando fallback Print.printAsync:', shareErr);
  }

  // 4. Fallback de alta confiabilidade: abre a interface de impressão / Salvar como PDF nativa do SO
  try {
    await Print.printAsync({ html });
  } catch (printErr) {
    console.warn('Aviso ao executar Print.printAsync como fallback:', printErr);
  }

  return shareUri;
}

