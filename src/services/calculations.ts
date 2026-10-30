import {
  Vehicle,
  Refueling,
  MaintenanceItem,
  MaintenanceAlert,
  FuelForecast,
  FuelPrices,
} from '@/types/vehicle';

export const Calculations = {
  // Estatísticas Gerais do Veículo (compatível com cache offline dos 5 últimos registros + totalizadores persistidos)
  getVehicleStats(vehicle: Vehicle, refuelings: Refueling[], maintenances: MaintenanceItem[]) {
    const listFuelSpent = refuelings.reduce((acc, r) => acc + Number(r.totalAmount || 0), 0);
    const listMaintenanceSpent = maintenances.reduce((acc, m) => acc + Number(m.cost || 0), 0);
    const listLiters = refuelings.reduce((acc, r) => acc + Number(r.liters || 0), 0);

    const hasPersistedFuelTotals =
      vehicle?.totalGastoAbast != null &&
      (vehicle.qtdAbastecimentos ?? 0) >= refuelings.length &&
      vehicle.totalGastoAbast >= listFuelSpent;

    const hasPersistedMntTotals =
      vehicle?.gastoManutencao != null &&
      (vehicle.qtdManutencoes ?? 0) >= maintenances.length &&
      vehicle.gastoManutencao >= listMaintenanceSpent;

    const totalFuelSpent = hasPersistedFuelTotals
      ? Number(vehicle.totalGastoAbast)
      : Number(listFuelSpent.toFixed(2));

    const totalLiters =
      vehicle?.totalLitrosAbast != null && (vehicle.qtdAbastecimentos ?? 0) >= refuelings.length
        ? Number(vehicle.totalLitrosAbast)
        : Number(listLiters.toFixed(2));

    const totalMaintenanceSpent = hasPersistedMntTotals
      ? Number(vehicle.gastoManutencao)
      : Number(listMaintenanceSpent.toFixed(2));

    const totalSpent = Number((totalFuelSpent + totalMaintenanceSpent).toFixed(2));

    const validConsumptions = refuelings
      .map((r) => r.consumptionKmPerLiter)
      .filter((c): c is number => typeof c === 'number' && c > 0 && c < 50);

    const listAvgConsumption =
      validConsumptions.length > 0
        ? Number(
            (validConsumptions.reduce((a, b) => a + b, 0) / validConsumptions.length).toFixed(2)
          )
        : 0;

    const refuelingsCount = Math.max(vehicle?.qtdAbastecimentos ?? 0, refuelings.length);

    // Se o veículo possui apenas o tanque base (1º abastecimento) ou não possui registros com km/L válido,
    // o veículo NÃO possui média calculada (retorna 0 e hasCalculatedConsumption = false).
    const hasCalculatedConsumption =
      listAvgConsumption > 0 ||
      (Boolean(vehicle?.mediaGeralKmPorLitro && vehicle.mediaGeralKmPorLitro > 0) && refuelingsCount > 1);

    const averageConsumption = hasCalculatedConsumption
      ? vehicle?.mediaGeralKmPorLitro &&
        vehicle.mediaGeralKmPorLitro > 0 &&
        (vehicle.qtdAbastecimentos ?? 0) >= refuelings.length
        ? Number(vehicle.mediaGeralKmPorLitro)
        : listAvgConsumption
      : 0;

    const bestConsumption = validConsumptions.length > 0 ? Math.max(...validConsumptions) : null;
    const worstConsumption = validConsumptions.length > 0 ? Math.min(...validConsumptions) : null;

    const validCostsPerKm = refuelings
      .map((r) => r.costPerKm)
      .filter((c): c is number => typeof c === 'number' && c > 0);

    const listAvgCostPerKm =
      validCostsPerKm.length > 0
        ? Number((validCostsPerKm.reduce((a, b) => a + b, 0) / validCostsPerKm.length).toFixed(2))
        : 0;

    const hasCalculatedCostPerKm =
      listAvgCostPerKm > 0 ||
      (Boolean(vehicle?.custoMedioPorKm && vehicle.custoMedioPorKm > 0) && refuelingsCount > 1);

    const averageCostPerKm = hasCalculatedCostPerKm
      ? vehicle?.custoMedioPorKm &&
        vehicle.custoMedioPorKm > 0 &&
        (vehicle.qtdAbastecimentos ?? 0) >= refuelings.length
        ? Number(vehicle.custoMedioPorKm)
        : listAvgCostPerKm
      : 0;

    return {
      totalSpent,
      totalFuelSpent,
      totalLiters,
      totalMaintenanceSpent,
      averageConsumption,
      bestConsumption,
      worstConsumption,
      averageCostPerKm,
      refuelingsCount,
      maintenancesCount: Math.max(vehicle?.qtdManutencoes ?? 0, maintenances.length),
      hasCalculatedConsumption,
      hasCalculatedCostPerKm,
    };
  },

  // Alertas de Manutenções Preventivas
  getMaintenanceAlerts(
    currentKm: number,
    maintenances: MaintenanceItem[],
    vehicle?: Vehicle | null
  ): MaintenanceAlert[] {
    const isMoto = vehicle?.vehicleType === 'moto';

    const standardCategories: {
      category: MaintenanceItem['category'];
      title: string;
      intervalKm: number;
      estimatedCost: number;
      overrideDueKm?: number;
    }[] = [];

    const oilInterval = vehicle?.trocaOleoKm || (isMoto ? 3000 : 10000);
    standardCategories.push({
      category: 'oleo_filtro',
      title: 'Troca de Óleo e Filtro',
      intervalKm: oilInterval,
      estimatedCost: isMoto ? 80 : 350,
      overrideDueKm: vehicle?.proxTrocaOleoKm,
    });

    const revInterval = vehicle?.revisaoKm || (isMoto ? 6000 : 10000);
    standardCategories.push({
      category: 'revisao_geral',
      title: 'Revisão Periódica Completa',
      intervalKm: revInterval,
      estimatedCost: isMoto ? 250 : 650,
      overrideDueKm: vehicle?.proxRevKm,
    });

    if (isMoto) {
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
      standardCategories.push(
        {
          category: 'alinhamento_balanceamento',
          title: 'Alinhamento & Balanceamento',
          intervalKm: 10000,
          estimatedCost: 150,
        },
        {
          category: 'rodizio_pneus',
          title: 'Rodízio de Pneus',
          intervalKm: 10000,
          estimatedCost: 80,
        },
        {
          category: 'ar_condicionado',
          title: 'Higienização e Filtro de Ar',
          intervalKm: 15000,
          estimatedCost: 120,
        }
      );
    }

    const alerts: MaintenanceAlert[] = [];

    standardCategories.forEach((std) => {
      let dueKm = 0;

      if (std.overrideDueKm && std.overrideDueKm > 0) {
        dueKm = std.overrideDueKm;
      } else {
        const last = maintenances
          .filter(
            (m) =>
              (m.category === std.category ||
                (std.category === 'troca_pneus' && m.category === 'pneus')) &&
              m.isCompleted
          )
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

    const order: Record<string, number> = {
      vencido: 0,
      alerta: 1,
      atencao: 2,
      proximo: 2,
      ok: 3,
    };
    return alerts.sort(
      (a, b) =>
        (order[a.status] ?? 3) - (order[b.status] ?? 3) ||
        (a.kmRemaining ?? 0) - (b.kmRemaining ?? 0)
    );
  },

  // Monitoramento de Itens por Desgaste (sem período rígido, exibindo última substituição)
  getWearItemsStatus(
    currentKm: number,
    maintenances: MaintenanceItem[],
    vehicle?: Vehicle | null
  ) {
    const lastBrake = maintenances
      .filter((m) => m.category === 'freios' && m.isCompleted)
      .sort((a, b) => b.odometer - a.odometer)[0];

    const lastTire = maintenances
      .filter((m) => (m.category === 'troca_pneus' || m.category === 'pneus') && m.isCompleted)
      .sort((a, b) => b.odometer - a.odometer)[0];

    let brakeFallback: {
      odometer: number;
      date: string;
      side: string;
      kmAgo: number;
    } | null = null;

    if (!lastBrake && vehicle) {
      const diantKm = vehicle.manFreioDiant || 0;
      const trasKm = vehicle.manFreioTras || 0;
      const maxBrakeKm = Math.max(diantKm, trasKm);
      if (maxBrakeKm > 0) {
        brakeFallback = {
          odometer: maxBrakeKm,
          date: '',
          side:
            diantKm > 0 && trasKm > 0 && diantKm === trasKm
              ? 'Dianteiro e Traseiro'
              : diantKm >= trasKm
              ? 'Dianteiro'
              : 'Traseiro',
          kmAgo: Math.max(0, currentKm - maxBrakeKm),
        };
      }
    }

    return {
      brake: lastBrake
        ? {
            odometer: lastBrake.odometer,
            date: lastBrake.date,
            side: lastBrake.sideLabel || lastBrake.side || 'Geral',
            kmAgo: Math.max(0, currentKm - lastBrake.odometer),
          }
        : brakeFallback,
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

  // Motor de Previsão de Gastos Inteligente (baseado estritamente no mês anterior / últimos 30 dias)
  calculateFuelForecast(
    vehicle: Vehicle,
    refuelings: Refueling[],
    maintenances: MaintenanceItem[],
    latestFuelPrices?: FuelPrices
  ): FuelForecast {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // 1. Filtra registros estritamente dentro do mês anterior (últimos 30 dias)
    const recentRefuelings = refuelings.filter((r) => {
      const t = new Date(r.date).getTime();
      return !isNaN(t) && now - t <= THIRTY_DAYS_MS;
    });

    const recentMaintenances = maintenances.filter((m) => {
      const t = new Date(m.date).getTime();
      return !isNaN(t) && now - t <= THIRTY_DAYS_MS;
    });

    // 2. Se não houve nenhuma atividade no mês anterior, o veículo é considerado inativo
    const isInactive = recentRefuelings.length === 0 && recentMaintenances.length === 0;

    // Estatísticas históricas gerais
    const stats = this.getVehicleStats(vehicle, refuelings, maintenances);
    const fallbackConsumption = stats.averageConsumption > 0 ? stats.averageConsumption : 0;

    const prices = refuelings.map((r) => r.pricePerLiter).filter((p) => p > 0);
    const vehicleFuel = vehicle?.fuelType || 'gasolina';
    const latestPriceForFuel = latestFuelPrices
      ? latestFuelPrices[vehicleFuel] || latestFuelPrices.gasolina
      : undefined;

    const fallbackPricePerLiter =
      latestPriceForFuel && latestPriceForFuel > 0
        ? latestPriceForFuel
        : prices.length > 0
        ? Number((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2))
        : 5.89;

    const fallbackCostPerKm = fallbackConsumption > 0 ? Number((fallbackPricePerLiter / fallbackConsumption).toFixed(2)) : 0;

    // Se o veículo estiver inativo no mês anterior, não projeta gastos futuros
    if (isInactive) {
      return {
        averageDailyKm: 0,
        averageConsumptionKmPerLiter: fallbackConsumption,
        averagePricePerLiter: fallbackPricePerLiter,
        averageCostPerKm: fallbackCostPerKm,
        projected30DaysKm: 0,
        projected30DaysCost: 0,
        projected60DaysCost: 0,
        projected90DaysCost: 0,
        upcomingMaintenancesCost30Days: 0,
        totalProjectedCost30Days: 0,
        isInactive: true,
      };
    }

    // 3. VEÍCULO ATIVO: Cálculos baseados APENAS nos gastos e uso do mês anterior
    const fuelSpentLastMonth = recentRefuelings.reduce(
      (sum, r) => sum + Number(r.totalAmount || 0),
      0
    );

    // Média de consumo apurada no mês anterior (se houver abastecimentos com km/L válido)
    const recentConsumptions = recentRefuelings
      .map((r) => r.consumptionKmPerLiter)
      .filter((c): c is number => typeof c === 'number' && c > 0 && c < 50);

    const monthAvgConsumption =
      recentConsumptions.length > 0
        ? Number(
            (recentConsumptions.reduce((a, b) => a + b, 0) / recentConsumptions.length).toFixed(2)
          )
        : fallbackConsumption;

    // Preço do combustível apurado no mês anterior
    const recentPrices = recentRefuelings.map((r) => r.pricePerLiter).filter((p) => p > 0);
    const monthPricePerLiter =
      latestPriceForFuel && latestPriceForFuel > 0
        ? latestPriceForFuel
        : recentPrices.length > 0
        ? Number((recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length).toFixed(2))
        : fallbackPricePerLiter;

    const monthCostPerKm = monthAvgConsumption > 0 ? Number((monthPricePerLiter / monthAvgConsumption).toFixed(2)) : 0;

    // Quilometragem percorrida no mês anterior (linha do tempo recente, odômetro e distâncias)
    const recentTimeline: { date: Date; odometer: number }[] = [];
    recentRefuelings.forEach((r) => {
      const d = new Date(r.date);
      if (!isNaN(d.getTime()) && r.odometer > 0) {
        recentTimeline.push({ date: d, odometer: r.odometer });
      }
    });
    recentMaintenances.forEach((m) => {
      const d = new Date(m.date);
      if (!isNaN(d.getTime()) && m.odometer > 0) {
        recentTimeline.push({ date: d, odometer: m.odometer });
      }
    });
    recentTimeline.sort((a, b) => a.date.getTime() - b.date.getTime());

    let timelineDiffKm = 0;
    if (recentTimeline.length >= 2) {
      const first = recentTimeline[0];
      const last = recentTimeline[recentTimeline.length - 1];
      timelineDiffKm = Math.max(0, last.odometer - first.odometer);
      if (vehicle.currentOdometer > last.odometer) {
        timelineDiffKm = Math.max(timelineDiffKm, vehicle.currentOdometer - first.odometer);
      }
    } else if (recentTimeline.length === 1 && vehicle.currentOdometer > recentTimeline[0].odometer) {
      timelineDiffKm = vehicle.currentOdometer - recentTimeline[0].odometer;
    }

    const recentSumDistance = recentRefuelings.reduce(
      (sum, r) => sum + Number(r.distanceTraveled || 0),
      0
    );

    const recentLiters = recentRefuelings.reduce((sum, r) => sum + Number(r.liters || 0), 0);
    const estimatedKmFromLiters = Math.round(recentLiters * monthAvgConsumption);

    const monthKm = Math.max(timelineDiffKm, recentSumDistance, estimatedKmFromLiters);

    // Previsão para os próximos 30 dias baseada estritamente nos gastos do mês anterior:
    // Se houve abastecimento, usa o valor gasto com combustível no mês anterior.
    // Caso tenha rodado sem registro de abastecimento no mês, calcula a partir do km rodado no mês.
    const projected30DaysCost =
      fuelSpentLastMonth > 0
        ? Number(fuelSpentLastMonth.toFixed(2))
        : monthKm > 0 && monthCostPerKm > 0
        ? Number((monthKm * monthCostPerKm).toFixed(2))
        : 0;

    const projected30DaysKm =
      monthKm > 0
        ? monthKm
        : monthCostPerKm > 0 && projected30DaysCost > 0
        ? Math.round(projected30DaysCost / monthCostPerKm)
        : 0;

    const averageDailyKm = projected30DaysKm > 0 ? Math.max(1, Math.round(projected30DaysKm / 30)) : 0;

    const projected60DaysCost = Number((projected30DaysCost * 2).toFixed(2));
    const projected90DaysCost = Number((projected30DaysCost * 3).toFixed(2));

    // Manutenções preventivas programadas para o próximo período com base no km projetado
    const alerts = this.getMaintenanceAlerts(vehicle.currentOdometer, maintenances, vehicle);
    const upcomingMaintenancesCost30Days = alerts
      .filter(
        (a) =>
          a.status === 'vencido' ||
          a.status === 'alerta' ||
          (a.kmRemaining !== undefined && a.kmRemaining <= projected30DaysKm)
      )
      .reduce((sum, a) => sum + a.estimatedCost, 0);

    const totalProjectedCost30Days = Number(
      (projected30DaysCost + upcomingMaintenancesCost30Days).toFixed(2)
    );

    return {
      averageDailyKm,
      averageConsumptionKmPerLiter: monthAvgConsumption,
      averagePricePerLiter: monthPricePerLiter,
      averageCostPerKm: monthCostPerKm,
      projected30DaysKm,
      projected30DaysCost,
      projected60DaysCost,
      projected90DaysCost,
      upcomingMaintenancesCost30Days,
      totalProjectedCost30Days,
      isInactive: false,
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
    let vehiclesWithConsumptionCount = 0;
    let activeVehiclesCount = 0;
    let inactiveVehiclesCount = 0;

    vehicles.forEach((v) => {
      const vRefs = allRefuelings.filter((r) => r.vehicleId === v.id);
      const vMnts = allMaintenances.filter((m) => m.vehicleId === v.id);
      const vForecast = this.calculateFuelForecast(v, vRefs, vMnts, latestFuelPrices);

      breakdowns.push({ vehicle: v, forecast: vForecast });

      // Se o veículo estiver inativo nos últimos 30 dias, NÃO soma nos gastos futuros da frota!
      if (vForecast.isInactive) {
        inactiveVehiclesCount++;
      } else {
        activeVehiclesCount++;
        totalProjected30DaysKm += vForecast.projected30DaysKm;
        totalProjected30DaysCost += vForecast.projected30DaysCost;
        totalProjected60DaysCost += vForecast.projected60DaysCost;
        totalProjected90DaysCost += vForecast.projected90DaysCost;
        totalUpcomingMntCost += vForecast.upcomingMaintenancesCost30Days;
        totalDailyKm += vForecast.averageDailyKm;
        if (vForecast.averageConsumptionKmPerLiter > 0) {
          weightedConsumptionSum += vForecast.averageConsumptionKmPerLiter;
          vehiclesWithConsumptionCount++;
        }
      }
    });

    const allPrices = allRefuelings.map((r) => r.pricePerLiter).filter((p) => p > 0);
    const avgPrice =
      latestFuelPrices && latestFuelPrices.gasolina > 0
        ? latestFuelPrices.gasolina
        : allPrices.length > 0
        ? Number((allPrices.reduce((a, b) => a + b, 0) / allPrices.length).toFixed(2))
        : 5.89;

    const avgConsumption =
      vehiclesWithConsumptionCount > 0
        ? Number((weightedConsumptionSum / vehiclesWithConsumptionCount).toFixed(2))
        : 0;

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
      totalProjectedCost30Days: Number(
        (totalProjected30DaysCost + totalUpcomingMntCost).toFixed(2)
      ),
      vehicleBreakdowns: breakdowns,
      isInactive: activeVehiclesCount === 0 && vehicles.length > 0,
      activeVehiclesCount,
      inactiveVehiclesCount,
    };
  },

  // Calculadora Flex (Etanol vs Gasolina)
  calculateFlex(
    gasolinePrice: number,
    ethanolPrice: number,
    vehicleRatio = 0.70,
    tankCapacity = 45
  ) {
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
    const recommendation =
      currentRatio <= vehicleRatio ? ('etanol' as const) : ('gasolina' as const);

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
