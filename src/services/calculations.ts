import { Vehicle, Refueling, MaintenanceItem, MaintenanceAlert, FuelForecast, FuelPrices } from '@/types/vehicle';

export const Calculations = {
  // Estatísticas Gerais do Veículo
  getVehicleStats(vehicle: Vehicle, refuelings: Refueling[], maintenances: MaintenanceItem[]) {
    const totalFuelSpent = refuelings.reduce((acc, r) => acc + r.totalAmount, 0);
    const totalMaintenanceSpent = maintenances.reduce((acc, m) => acc + m.cost, 0);
    const totalSpent = totalFuelSpent + totalMaintenanceSpent;

    const validConsumptions = refuelings
      .map((r) => r.consumptionKmPerLiter)
      .filter((c): c is number => typeof c === 'number' && c > 0 && c < 50);

    const averageConsumption =
      validConsumptions.length > 0
        ? Number((validConsumptions.reduce((a, b) => a + b, 0) / validConsumptions.length).toFixed(2))
        : 12.0;

    const bestConsumption = validConsumptions.length > 0 ? Math.max(...validConsumptions) : null;
    const worstConsumption = validConsumptions.length > 0 ? Math.min(...validConsumptions) : null;

    const validCostsPerKm = refuelings
      .map((r) => r.costPerKm)
      .filter((c): c is number => typeof c === 'number' && c > 0);

    const averageCostPerKm =
      validCostsPerKm.length > 0
        ? Number((validCostsPerKm.reduce((a, b) => a + b, 0) / validCostsPerKm.length).toFixed(2))
        : 0.48;

    return {
      totalSpent,
      totalFuelSpent,
      totalMaintenanceSpent,
      averageConsumption,
      bestConsumption,
      worstConsumption,
      averageCostPerKm,
      refuelingsCount: refuelings.length,
      maintenancesCount: maintenances.length,
    };
  },

  // Alertas de Manutenções Preventivas
  getMaintenanceAlerts(
    currentKm: number,
    maintenances: MaintenanceItem[],
    vehicle?: Vehicle | null
  ): MaintenanceAlert[] {
    const isMoto = vehicle?.vehicleType === 'moto';

    // Regras de recomendação automotiva com periodicidade configurada
    const standardCategories: {
      category: MaintenanceItem['category'];
      title: string;
      intervalKm: number;
      estimatedCost: number;
      overrideDueKm?: number;
    }[] = [];

    // 1. Óleo e Filtro (respeita configuração periódica do veículo se houver)
    const oilInterval = vehicle?.trocaOleoKm || (isMoto ? 3000 : 10000);
    standardCategories.push({
      category: 'oleo_filtro',
      title: 'Troca de Óleo e Filtro',
      intervalKm: oilInterval,
      estimatedCost: isMoto ? 80 : 350,
      overrideDueKm: vehicle?.proxTrocaOleoKm,
    });

    // 2. Revisão Geral (respeita configuração periódica do veículo se houver)
    const revInterval = vehicle?.revisaoKm || (isMoto ? 6000 : 10000);
    standardCategories.push({
      category: 'revisao_geral',
      title: 'Revisão Periódica Completa',
      intervalKm: revInterval,
      estimatedCost: isMoto ? 250 : 650,
      overrideDueKm: vehicle?.proxRevKm,
    });

    if (isMoto) {
      // Categorias periódicas exclusivas de Motocicletas (com base na configuração do veículo)
      const lubInterval = vehicle?.lubrificarCorrenteKm || 500;
      standardCategories.push({
        category: 'lubrificar_corrente',
        title: 'Lubrificar Corrente',
        intervalKm: lubInterval,
        estimatedCost: 20,
        overrideDueKm: vehicle?.proxLubCorrenteKm,
      });

      const esticarInterval = vehicle?.esticarCorrenteKm || 1500;
      standardCategories.push({
        category: 'esticar_corrente',
        title: 'Tensionar Corrente',
        intervalKm: esticarInterval,
        estimatedCost: 30,
        overrideDueKm: vehicle?.proxEsticarCorrenteKm,
      });
    } else {
      // Categorias periódicas de Automóveis
      standardCategories.push(
        { category: 'alinhamento_balanceamento', title: 'Alinhamento & Balanceamento', intervalKm: 10000, estimatedCost: 150 },
        { category: 'rodizio_pneus', title: 'Rodízio de Pneus', intervalKm: 10000, estimatedCost: 80 },
        { category: 'ar_condicionado', title: 'Higienização e Filtro de Ar', intervalKm: 15000, estimatedCost: 120 }
      );
    }

    const alerts: MaintenanceAlert[] = [];

    standardCategories.forEach((std) => {
      let dueKm = 0;

      if (std.overrideDueKm && std.overrideDueKm > 0) {
        dueKm = std.overrideDueKm;
      } else {
        // Procurar a última manutenção concluída desta categoria
        const last = maintenances
          .filter((m) => (m.category === std.category || (std.category === 'troca_pneus' && m.category === 'pneus')) && m.isCompleted)
          .sort((a, b) => b.odometer - a.odometer)[0];

        if (last?.nextDueOdometer) {
          dueKm = last.nextDueOdometer;
        } else if (last) {
          dueKm = last.odometer + std.intervalKm;
        } else {
          dueKm = Math.ceil(currentKm / std.intervalKm) * std.intervalKm;
        }
      }

      const kmRemaining = dueKm - currentKm;
      let status: MaintenanceAlert['status'] = 'ok';

      // Limiares baseados na quilometragem periódica cadastrada (std.intervalKm):
      // - Vencido / Atrasado: kmRemaining <= 0 (vermelho)
      // - Alerta: faltam 15% ou menos da quilometragem periódica cadastrada (ex: <= 150 km em ciclo de 1000 km) -> vermelho
      // - Atenção: faltam 30% ou menos da quilometragem periódica cadastrada (ex: <= 300 km em ciclo de 1000 km) -> amarelo
      // - Em dia: faltam mais de 30% da quilometragem periódica cadastrada -> verde
      const alertThreshold = std.intervalKm * 0.15;
      const warningThreshold = std.intervalKm * 0.30;

      if (kmRemaining <= 0) {
        status = 'vencido';
      } else if (kmRemaining <= alertThreshold) {
        status = 'alerta';
      } else if (kmRemaining <= warningThreshold) {
        status = 'atencao';
      } else {
        status = 'ok';
      }

      alerts.push({
        category: std.category,
        title: std.title,
        status,
        currentKm,
        dueKm,
        kmRemaining,
        estimatedCost: std.estimatedCost,
      });
    });

    // Ordenar: primeiro vencidos (0), depois alerta 15% (1), atenção 30% (2), depois em dia (3)
    const order: Record<string, number> = { vencido: 0, alerta: 1, atencao: 2, proximo: 2, ok: 3 };
    return alerts.sort(
      (a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || (a.kmRemaining ?? 0) - (b.kmRemaining ?? 0)
    );
  },

  // Monitoramento de Itens por Desgaste (sem período rígido, exibindo última substituição)
  getWearItemsStatus(currentKm: number, maintenances: MaintenanceItem[]) {
    // 1. Pastilhas / Lonas de freio
    const lastBrake = maintenances
      .filter((m) => m.category === 'freios' && m.isCompleted)
      .sort((a, b) => b.odometer - a.odometer)[0];

    // 2. Troca de Pneus
    const lastTire = maintenances
      .filter((m) => (m.category === 'troca_pneus' || m.category === 'pneus') && m.isCompleted)
      .sort((a, b) => b.odometer - a.odometer)[0];

    return {
      brake: lastBrake
        ? {
            odometer: lastBrake.odometer,
            date: lastBrake.date,
            side: lastBrake.sideLabel || lastBrake.side || 'Geral',
            kmAgo: Math.max(0, currentKm - lastBrake.odometer),
          }
        : null,
      tire: lastTire
        ? {
            odometer: lastTire.odometer,
            date: lastTire.date,
            side: lastTire.sideLabel || lastTire.side || 'Geral',
            kmAgo: Math.max(0, currentKm - lastTire.odometer),
          }
        : null,
    };
  },

  // Motor de Previsão de Gastos Inteligente
  calculateFuelForecast(
    vehicle: Vehicle,
    refuelings: Refueling[],
    maintenances: MaintenanceItem[],
    latestFuelPrices?: FuelPrices
  ): FuelForecast {
    const isMoto = vehicle?.vehicleType === 'moto';
    let averageDailyKm = isMoto ? 25 : 30; // fallback padrão inicial caso não haja histórico suficiente

    // Timeline cronológica com todos os registros de odômetro disponíveis
    const timeline: { date: Date; odometer: number }[] = [];

    refuelings.forEach((r) => {
      const d = new Date(r.date);
      if (!isNaN(d.getTime()) && r.odometer > 0) {
        timeline.push({ date: d, odometer: r.odometer });
      }
    });

    maintenances.forEach((m) => {
      const d = new Date(m.date);
      if (!isNaN(d.getTime()) && m.odometer > 0) {
        timeline.push({ date: d, odometer: m.odometer });
      }
    });

    // Ordenar timeline por data
    timeline.sort((a, b) => a.date.getTime() - b.date.getTime());

    if (timeline.length >= 2) {
      const first = timeline[0];
      const last = timeline[timeline.length - 1];
      const diffMs = last.date.getTime() - first.date.getTime();
      const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      const diffKm = Math.max(0, last.odometer - first.odometer);

      if (diffDays > 0 && diffKm > 0) {
        // Cálculo dinâmico: km rodados divididos pelos dias corridos entre os registros
        averageDailyKm = Math.min(1000, Math.max(1, Math.round(diffKm / diffDays)));
      }
    } else if (timeline.length === 1 && vehicle.currentOdometer > timeline[0].odometer) {
      // Caso haja 1 registro no passado e o odômetro atual do veículo tenha avançado
      const first = timeline[0];
      const diffMs = Date.now() - first.date.getTime();
      const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      const diffKm = vehicle.currentOdometer - first.odometer;
      if (diffDays > 0 && diffKm > 0) {
        averageDailyKm = Math.min(1000, Math.max(1, Math.round(diffKm / diffDays)));
      }
    }

    const defaultConsumption = isMoto ? 35.0 : 12.0;
    const stats = this.getVehicleStats(vehicle, refuelings, maintenances);
    const avgConsumption =
      stats.averageConsumption > 0
        ? stats.averageConsumption
        : vehicle?.mediaGeralKmPorLitro && vehicle.mediaGeralKmPorLitro > 0
        ? vehicle.mediaGeralKmPorLitro
        : defaultConsumption;
    
    // Preço do combustível: prioriza o preço mais recente praticado no sistema para o combustível do veículo
    const prices = refuelings.map((r) => r.pricePerLiter).filter((p) => p > 0);
    const vehicleFuel = vehicle?.fuelType || 'gasolina';
    const latestPriceForFuel = latestFuelPrices ? latestFuelPrices[vehicleFuel] || latestFuelPrices.gasolina : undefined;

    const averagePricePerLiter =
      latestPriceForFuel && latestPriceForFuel > 0
        ? latestPriceForFuel
        : prices.length > 0
        ? Number((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2))
        : 5.89;

    const averageCostPerKm = Number((averagePricePerLiter / avgConsumption).toFixed(2));

    const projected30DaysKm = averageDailyKm * 30;
    const projected30DaysCost = Number((projected30DaysKm * averageCostPerKm).toFixed(2));
    const projected60DaysCost = Number((projected30DaysCost * 2).toFixed(2));
    const projected90DaysCost = Number((projected30DaysCost * 3).toFixed(2));

    // Manutenções com previsão de vencer nos próximos 30 dias (ou seja, dentro dos próximos km)
    const alerts = this.getMaintenanceAlerts(vehicle.currentOdometer, maintenances, vehicle);
    const upcomingMaintenancesCost30Days = alerts
      .filter((a) => (a.status === 'vencido' || a.status === 'alerta' || (a.kmRemaining !== undefined && a.kmRemaining <= projected30DaysKm)))
      .reduce((sum, a) => sum + a.estimatedCost, 0);

    const totalProjectedCost30Days = Number((projected30DaysCost + upcomingMaintenancesCost30Days).toFixed(2));

    return {
      averageDailyKm,
      averageConsumptionKmPerLiter: avgConsumption,
      averagePricePerLiter,
      averageCostPerKm,
      projected30DaysKm,
      projected30DaysCost,
      projected60DaysCost,
      projected90DaysCost,
      upcomingMaintenancesCost30Days,
      totalProjectedCost30Days,
    };
  },

  // Projeção Consolidada para Todos os Veículos (Frota Completa)
  calculateFleetForecast(
    vehicles: Vehicle[],
    allRefuelings: Refueling[],
    allMaintenances: MaintenanceItem[],
    latestFuelPrices?: FuelPrices
  ): FuelForecast & { vehicleBreakdowns: { vehicle: Vehicle; forecast: FuelForecast }[] } {
    const breakdowns: { vehicle: Vehicle; forecast: FuelForecast }[] = [];

    let totalProjected30DaysKm = 0;
    let totalProjected30DaysCost = 0;
    let totalProjected60DaysCost = 0;
    let totalProjected90DaysCost = 0;
    let totalUpcomingMntCost = 0;
    let totalDailyKm = 0;
    let weightedConsumptionSum = 0;

    vehicles.forEach((v) => {
      const vRefs = allRefuelings.filter((r) => r.vehicleId === v.id);
      const vMnts = allMaintenances.filter((m) => m.vehicleId === v.id);
      const vForecast = this.calculateFuelForecast(v, vRefs, vMnts, latestFuelPrices);

      breakdowns.push({ vehicle: v, forecast: vForecast });

      totalProjected30DaysKm += vForecast.projected30DaysKm;
      totalProjected30DaysCost += vForecast.projected30DaysCost;
      totalProjected60DaysCost += vForecast.projected60DaysCost;
      totalProjected90DaysCost += vForecast.projected90DaysCost;
      totalUpcomingMntCost += vForecast.upcomingMaintenancesCost30Days;
      totalDailyKm += vForecast.averageDailyKm;
      weightedConsumptionSum += vForecast.averageConsumptionKmPerLiter;
    });

    const allPrices = allRefuelings.map((r) => r.pricePerLiter).filter((p) => p > 0);
    const avgPrice =
      latestFuelPrices && latestFuelPrices.gasolina > 0
        ? latestFuelPrices.gasolina
        : allPrices.length > 0
        ? Number((allPrices.reduce((a, b) => a + b, 0) / allPrices.length).toFixed(2))
        : 5.89;

    const avgConsumption =
      vehicles.length > 0
        ? Number((weightedConsumptionSum / vehicles.length).toFixed(2))
        : 12.0;

    const avgCostPerKm =
      totalProjected30DaysKm > 0
        ? Number((totalProjected30DaysCost / totalProjected30DaysKm).toFixed(2))
        : 0.48;

    return {
      averageDailyKm: totalDailyKm,
      averageConsumptionKmPerLiter: avgConsumption,
      averagePricePerLiter: avgPrice,
      averageCostPerKm: avgCostPerKm,
      projected30DaysKm: totalProjected30DaysKm,
      projected30DaysCost: Number(totalProjected30DaysCost.toFixed(2)),
      projected60DaysCost: Number(totalProjected60DaysCost.toFixed(2)),
      projected90DaysCost: Number(totalProjected90DaysCost.toFixed(2)),
      upcomingMaintenancesCost30Days: Number(totalUpcomingMntCost.toFixed(2)),
      totalProjectedCost30Days: Number((totalProjected30DaysCost + totalUpcomingMntCost).toFixed(2)),
      vehicleBreakdowns: breakdowns,
    };
  },

  // Calculadora Flex (Etanol vs Gasolina)
  calculateFlex(gasolinePrice: number, ethanolPrice: number, vehicleRatio = 0.70, tankCapacity = 45) {
    if (gasolinePrice <= 0 || ethanolPrice <= 0) {
      return {
        ratio: 0,
        recommendation: 'gasolina' as const,
        savingsPerLiter: 0,
        savingsFullTank: 0,
        percentageDiff: 0,
      };
    }

    const currentRatio = ethanolPrice / gasolinePrice;
    const recommendation = currentRatio <= vehicleRatio ? ('etanol' as const) : ('gasolina' as const);

    // Economia estimada no tanque completo
    let savingsFullTank = 0;
    if (recommendation === 'etanol') {
      const equivGasolineCost = tankCapacity * gasolinePrice;
      const actualEthanolCost = (tankCapacity / vehicleRatio) * ethanolPrice;
      savingsFullTank = Math.max(0, Number((equivGasolineCost - actualEthanolCost).toFixed(2)));
    } else {
      const equivEthanolCost = (tankCapacity / vehicleRatio) * ethanolPrice;
      const actualGasolineCost = tankCapacity * gasolinePrice;
      savingsFullTank = Math.max(0, Number((equivEthanolCost - actualGasolineCost).toFixed(2)));
    }

    return {
      ratio: Number((currentRatio * 100).toFixed(1)),
      benchmarkRatio: Number((vehicleRatio * 100).toFixed(1)),
      recommendation,
      savingsFullTank,
    };
  },
};
