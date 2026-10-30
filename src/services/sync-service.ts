import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { auth, db, checkOnlineStatus, withFirestoreTimeout } from '@/services/firebase';
import { Vehicle, Refueling, MaintenanceItem } from '@/types/vehicle';
import { saveAvatarToLocalCache } from '@/services/image-picker';

export type SyncAction =
  | 'SAVE_VEHICLE'
  | 'DELETE_VEHICLE'
  | 'ADD_REFUELING'
  | 'DELETE_REFUELING'
  | 'ADD_MAINTENANCE'
  | 'DELETE_MAINTENANCE'
  | 'SAVE_PERIODIC_CONFIG'
  | 'SAVE_FUEL_PRICES'
  | 'SAVE_USER_PROFILE';

export interface SyncQueueItem {
  id: string;
  action: SyncAction;
  entityId: string;
  userEmail: string;
  payload: any;
  createdAt: string;
}

const SYNC_QUEUE_KEY = '@contagiro:sync_queue_v1';

type QueueListener = (pendingCount: number) => void;
const listeners: Set<QueueListener> = new Set();
let isCurrentlySyncing = false;

export const SyncService = {
  /**
   * Assina notificações de alteração na contagem da fila de pendências
   */
  subscribe(callback: QueueListener): () => void {
    listeners.add(callback);
    this.getPendingCount().then((count) => callback(count)).catch(() => {});
    return () => {
      listeners.delete(callback);
    };
  },

  notifyListeners(count: number) {
    listeners.forEach((fn) => {
      try {
        fn(count);
      } catch (e) {
        console.warn('Erro no listener de sincronização:', e);
      }
    });
  },

  /**
   * Retorna todos os itens pendentes na fila
   */
  async getQueue(): Promise<SyncQueueItem[]> {
    try {
      const json = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      const all: SyncQueueItem[] = json ? JSON.parse(json) : [];
      const currentEmail = auth.currentUser?.email?.toLowerCase().trim();
      if (!currentEmail) return all;
      return all.filter((item) => !item.userEmail || item.userEmail === currentEmail);
    } catch {
      return [];
    }
  },

  /**
   * Retorna a fila bruta completa de todos os usuários (uso interno para persistência)
   */
  async getRawQueue(): Promise<SyncQueueItem[]> {
    try {
      const json = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  },

  /**
   * Retorna a quantidade de operações aguardando envio para a nuvem
   */
  async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  },

  /**
   * Limpa completamente a fila de sincronização (ex: exclusão de conta)
   */
  async clearQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SYNC_QUEUE_KEY);
      this.notifyListeners(0);
    } catch (e) {
      console.warn('Erro ao limpar fila de sincronização:', e);
    }
  },

  /**
   * Adiciona ou atualiza uma operação na fila de sincronização com deduplicação inteligente
   */
  async enqueue(action: SyncAction, entityId: string, payload: any): Promise<void> {
    const userEmail = auth.currentUser?.email;
    if (!userEmail) return;

    // Exclusões no banco de dados não são permitidas quando offline
    if (action.startsWith('DELETE_')) {
      return;
    }

    const userKey = userEmail.toLowerCase().trim();
    const rawQueue = await this.getRawQueue();

    // DEDUPLICAÇÃO DE ENFILEIRAMENTO:
    // Evita duplicar se já houver item com a mesma entidade ou mesmos dados de abastecimento/manutenção
    const existingIndex = rawQueue.findIndex((item) => {
      if (item.userEmail !== userKey || item.action !== action) return false;
      if (item.entityId === entityId) return true;

      if (action === 'ADD_REFUELING' && item.payload && payload) {
        const p1 = item.payload as Refueling;
        const p2 = payload as Refueling;
        const isSameVehicle = p1.vehicleId === p2.vehicleId;
        const isSameDate = p1.date === p2.date;
        const isSameKm = Number(p1.odometer) === Number(p2.odometer);
        const isSameLiters = Math.abs(Number(p1.liters) - Number(p2.liters)) < 0.05;
        const isSameAmount = Math.abs(Number(p1.totalAmount) - Number(p2.totalAmount)) < 0.1;
        if (isSameVehicle && isSameDate && isSameKm && (isSameLiters || isSameAmount)) {
          return true;
        }
      }

      if (action === 'ADD_MAINTENANCE' && item.payload && payload) {
        const m1 = item.payload as MaintenanceItem;
        const m2 = payload as MaintenanceItem;
        const isSameVehicle = m1.vehicleId === m2.vehicleId;
        const isSameDate = m1.date === m2.date;
        const isSameKm = Number(m1.odometer) === Number(m2.odometer);
        const isSameCat = m1.category === m2.category;
        const isSameCost = Math.abs(Number(m1.cost) - Number(m2.cost)) < 0.1;
        if (isSameVehicle && isSameDate && isSameKm && isSameCat && isSameCost) {
          return true;
        }
      }

      return false;
    });

    const newItem: SyncQueueItem = {
      id:
        existingIndex >= 0
          ? rawQueue[existingIndex].id
          : `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      entityId,
      userEmail: userKey,
      payload,
      createdAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      rawQueue[existingIndex] = newItem;
    } else {
      rawQueue.push(newItem);
    }

    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(rawQueue));
    const userPendingCount = rawQueue.filter((i) => !i.userEmail || i.userEmail === userKey).length;
    this.notifyListeners(userPendingCount);
  },

  /**
   * Remove uma operação da fila após sucesso
   */
  async dequeue(itemId: string): Promise<void> {
    const rawQueue = await this.getRawQueue();
    const updated = rawQueue.filter((item) => item.id !== itemId);
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updated));
    const count = await this.getPendingCount();
    this.notifyListeners(count);
  },

  /**
   * Remove todas as operações pendentes da mesma entidade (ou de uma ação específica)
   */
  async removeByEntityId(entityId: string, action?: SyncAction): Promise<void> {
    const rawQueue = await this.getRawQueue();
    const updated = rawQueue.filter((item) => {
      if (item.entityId !== entityId) return true;
      if (action && item.action !== action) return true;
      return false;
    });
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updated));
    const count = await this.getPendingCount();
    this.notifyListeners(count);
  },

  /**
   * Executa a sincronização de todas as pendências locais com o Firestore
   * Protegido contra execuções concorrentes (mutex) e com criação idempotente de documentos
   */
  async syncNow(): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
    if (isCurrentlySyncing) {
      return { success: true, syncedCount: 0, errors: [] };
    }

    const userEmail = auth.currentUser?.email;
    if (!userEmail) {
      return { success: false, syncedCount: 0, errors: ['Nenhum usuário conectado para sincronizar.'] };
    }

    const online = await checkOnlineStatus(true);
    if (!online) {
      return {
        success: false,
        syncedCount: 0,
        errors: ['Sem conexão com a internet. Conecte-se a uma rede para sincronizar seus dados.'],
      };
    }

    isCurrentlySyncing = true;
    try {
      const userKey = userEmail.toLowerCase().trim();
      const rawQueue = await this.getRawQueue();
      const queue = rawQueue.filter((item) => !item.userEmail || item.userEmail === userKey);

      if (queue.length === 0) {
        return { success: true, syncedCount: 0, errors: [] };
      }

      let syncedCount = 0;
      const errors: string[] = [];

      // Mapeamento de IDs temporários para os IDs gerados pelo Firestore
      const idMap: Record<string, string> = {};

      // Carrega veículos em cache local para ter sempre os totalizadores mais recentes
      let cachedVehicles: Vehicle[] = [];
      try {
        const cachedRaw = await AsyncStorage.getItem('@contagiro:vehicles_v1');
        if (cachedRaw) cachedVehicles = JSON.parse(cachedRaw);
      } catch {}

      for (const item of queue) {
        try {
          switch (item.action) {
            case 'SAVE_VEHICLE': {
              const vehiclePayload: Vehicle = item.payload;
              const oldId = vehiclePayload.id;
              const effectiveVehId = idMap[oldId] || oldId;
              const localVeh =
                cachedVehicles.find((v) => v.id === effectiveVehId || v.id === oldId) || vehiclePayload;
              const isCar = localVeh.vehicleType !== 'moto';

              const docData: Record<string, unknown> = {
                tipoVeiculo: localVeh.vehicleType || (isCar ? 'carro' : 'moto'),
                placa: localVeh.plate.toUpperCase(),
                ano: localVeh.year,
                marca: localVeh.brand || '',
                nome: localVeh.name,
                modelo: localVeh.model || localVeh.name,
                capacidadeTanque: localVeh.tankCapacity,
                tanque: localVeh.tankCapacity,
                tankCapacity: localVeh.tankCapacity,
                cilindrada: localVeh.engineDisplacement || (isCar ? 1000 : 150),
                kmAtual: localVeh.currentOdometer,
                ultimoKm: localVeh.currentOdometer,
                ultimoComb:
                  localVeh.fuelType === 'etanol'
                    ? 'Etanol'
                    : localVeh.fuelType === 'diesel'
                    ? 'Diesel'
                    : localVeh.fuelType === 'gnv'
                    ? 'GNV'
                    : 'Gasolina',
                combustiveisAceitos: localVeh.acceptedFuelTypes || [localVeh.fuelType],
                acceptedFuelTypes: localVeh.acceptedFuelTypes || [localVeh.fuelType],
                photoUrl: localVeh.photoUrl || null,
                fotoUrl: localVeh.photoUrl || null,
                flexEfficiencyRatio: localVeh.flexEfficiencyRatio ?? 0.7,
                cadManPeriodica: localVeh.cadManPeriodica ?? false,
              };

              if (localVeh.cadManPeriodica) {
                docData.revisaoKm = localVeh.revisaoKm ?? 10000;
                docData.revisaoMes = localVeh.revisaoMes ?? 12;
                docData.trocaOleoKm = localVeh.trocaOleoKm ?? 10000;
                docData.trocaOleoMeses = localVeh.trocaOleoMeses ?? 6;
                if (localVeh.ultimaRevisaoKm != null) docData.ultimaRevisaoKm = localVeh.ultimaRevisaoKm;
                if (localVeh.ultimaTrocaOleoKm != null) docData.ultimaTrocaOleoKm = localVeh.ultimaTrocaOleoKm;
                docData.proxRevKm = localVeh.proxRevKm ?? localVeh.currentOdometer + (localVeh.revisaoKm || 10000);
                docData.proxTrocaOleoKm =
                  localVeh.proxTrocaOleoKm ?? localVeh.currentOdometer + (localVeh.trocaOleoKm || 10000);

                if (localVeh.vehicleType === 'moto') {
                  if (localVeh.lubrificarCorrenteKm != null) docData.lubrificarCorrenteKm = localVeh.lubrificarCorrenteKm;
                  if (localVeh.ultimaLubCorrenteKm != null) docData.ultimaLubCorrenteKm = localVeh.ultimaLubCorrenteKm;
                  if (localVeh.proxLubCorrenteKm != null) docData.proxLubCorrenteKm = localVeh.proxLubCorrenteKm;
                  if (localVeh.esticarCorrenteKm != null) docData.esticarCorrenteKm = localVeh.esticarCorrenteKm;
                  if (localVeh.ultimaEsticarCorrenteKm != null)
                    docData.ultimaEsticarCorrenteKm = localVeh.ultimaEsticarCorrenteKm;
                  if (localVeh.proxEsticarCorrenteKm != null)
                    docData.proxEsticarCorrenteKm = localVeh.proxEsticarCorrenteKm;
                }
              }

              if (localVeh.manFreioDiant != null) docData.manFreioDiant = localVeh.manFreioDiant;
              if (localVeh.manFreioTras != null) docData.manFreioTras = localVeh.manFreioTras;
              if (localVeh.gastoManutencao != null) docData.gastoManutencao = localVeh.gastoManutencao;
              if (localVeh.totalGastoAbast != null) docData.totalGastoAbast = localVeh.totalGastoAbast;
              if (localVeh.totalLitrosAbast != null) docData.totalLitrosAbast = localVeh.totalLitrosAbast;
              if (localVeh.mediaGeralKmPorLitro != null) docData.mediaGeralKmPorLitro = localVeh.mediaGeralKmPorLitro;
              if (localVeh.custoMedioPorKm != null) docData.custoMedioPorKm = localVeh.custoMedioPorKm;
              if (localVeh.qtdAbastecimentos != null) docData.qtdAbastecimentos = localVeh.qtdAbastecimentos;
              if (localVeh.qtdManutencoes != null) docData.qtdManutencoes = localVeh.qtdManutencoes;
              if (localVeh.order != null) docData.ordem = localVeh.order;
              if (localVeh.isPreferred != null) docData.preferido = localVeh.isPreferred;

              if (effectiveVehId && !effectiveVehId.startsWith('veh-')) {
                await withFirestoreTimeout(
                  () => setDoc(doc(db, 'users', userEmail, 'veiculos', effectiveVehId), docData, { merge: true }),
                  3000
                );
              } else {
                // Se já existir no Firestore com a mesma placa, atualiza o existente para não duplicar veículo
                const vehColRef = collection(db, 'users', userEmail, 'veiculos');
                const vehSnap = await withFirestoreTimeout(() => getDocs(vehColRef), 2000).catch(() => null);
                const existingVeh = vehSnap?.docs.find(
                  (d) => String(d.data().placa || '').toUpperCase() === localVeh.plate.toUpperCase()
                );

                let targetVehId = existingVeh ? existingVeh.id : null;
                if (targetVehId) {
                  await withFirestoreTimeout(
                    () => setDoc(doc(db, 'users', userEmail, 'veiculos', targetVehId!), docData, { merge: true }),
                    3000
                  );
                } else {
                  const docRef = await withFirestoreTimeout(() => addDoc(vehColRef, docData), 3000);
                  targetVehId = docRef.id;
                }

                idMap[oldId] = targetVehId;

                if (localVeh.photoUrl) {
                  await saveAvatarToLocalCache(`vehicle_${targetVehId}`, localVeh.photoUrl);
                }

                const idx = cachedVehicles.findIndex((v) => v.id === oldId);
                if (idx >= 0) {
                  cachedVehicles[idx].id = targetVehId;
                  await AsyncStorage.setItem('@contagiro:vehicles_v1', JSON.stringify(cachedVehicles));
                }

                const activeId = await AsyncStorage.getItem('@contagiro:active_vehicle_id_v1');
                if (activeId === oldId) {
                  await AsyncStorage.setItem('@contagiro:active_vehicle_id_v1', targetVehId);
                }

                const prefId = await AsyncStorage.getItem('@contagiro:preferred_vehicle_id_v1');
                if (prefId === oldId) {
                  await AsyncStorage.setItem('@contagiro:preferred_vehicle_id_v1', targetVehId);
                }
              }

              await this.dequeue(item.id);
              syncedCount++;
              break;
            }

            case 'DELETE_VEHICLE': {
              const vehId = idMap[item.entityId] || item.entityId;
              await withFirestoreTimeout(
                () => deleteDoc(doc(db, 'users', userEmail, 'veiculos', vehId)),
                3000
              );
              await this.dequeue(item.id);
              syncedCount++;
              break;
            }

            case 'ADD_REFUELING': {
              const refItem: Refueling = item.payload;
              const effectiveVehId = idMap[refItem.vehicleId] || refItem.vehicleId;
              const localVeh =
                cachedVehicles.find((v) => v.id === effectiveVehId || v.id === refItem.vehicleId);

              const rawComb =
                refItem.fuelType === 'etanol'
                  ? 'Etanol'
                  : refItem.fuelType === 'diesel'
                  ? 'Diesel'
                  : refItem.fuelType === 'gnv'
                  ? 'GNV'
                  : 'Gasolina';

              const firestoreData: Record<string, unknown> = {
                idVeiculo: effectiveVehId,
                placa: refItem.plate || localVeh?.plate || '',
                data: refItem.date,
                combustivel: rawComb,
                kmAntigo: refItem.previousOdometer || 0,
                kmAtual: refItem.odometer,
                qdtAbastecida: refItem.liters,
                valorLitro: refItem.pricePerLiter,
                totalAmount: refItem.totalAmount,
                media: refItem.consumptionKmPerLiter || 0,
                seTanqueCheio: refItem.isFullTank,
                seAditivado: Boolean(refItem.isAdditivated),
                observacao: refItem.notes || refItem.gasStation || '',
              };

              // DEDUPLICAÇÃO NO FIRESTORE:
              // Verifica se já existe um documento com o mesmo ID ou mesmos valores para este veículo
              const subColRef = collection(
                db,
                'users',
                userEmail,
                'veiculos',
                effectiveVehId,
                'abastecimentos'
              );
              let targetDocId = refItem.id;

              try {
                const existingSnap = await withFirestoreTimeout(
                  () => getDocs(subColRef),
                  2000
                );
                if (existingSnap && !existingSnap.empty) {
                  const matchingDocs = existingSnap.docs.filter((d) => {
                    if (d.id === refItem.id) return true;
                    const data = d.data();
                    const isSameDate = String(data.data ?? data.date) === refItem.date;
                    const isSameKm = Number(data.kmAtual ?? data.odometer) === refItem.odometer;
                    const dLiters = Number(data.qdtAbastecida ?? data.liters ?? 0);
                    const isSameLiters = Math.abs(dLiters - refItem.liters) < 0.05;
                    return isSameDate && isSameKm && isSameLiters;
                  });

                  if (matchingDocs.length > 0) {
                    targetDocId = matchingDocs[0].id;
                    // Se houver réplicas excedentes criadas anteriormente no Firestore, remove
                    for (let i = 1; i < matchingDocs.length; i++) {
                      deleteDoc(matchingDocs[i].ref).catch(() => {});
                    }
                  }
                }
              } catch (e) {
                console.warn('Aviso: busca por duplicatas no Firestore falhou, usando targetDocId:', e);
              }

              const batch = writeBatch(db);
              const refDocRef = doc(subColRef, targetDocId);
              batch.set(refDocRef, firestoreData, { merge: true });

              const vehicleUpdates: Record<string, unknown> = {
                kmAtual: localVeh ? Math.max(localVeh.currentOdometer, refItem.odometer) : refItem.odometer,
                ultimoKm: localVeh ? Math.max(localVeh.currentOdometer, refItem.odometer) : refItem.odometer,
                ultimoComb: rawComb,
              };

              if (localVeh) {
                if (localVeh.totalGastoAbast != null) vehicleUpdates.totalGastoAbast = localVeh.totalGastoAbast;
                if (localVeh.totalLitrosAbast != null) vehicleUpdates.totalLitrosAbast = localVeh.totalLitrosAbast;
                if (localVeh.mediaGeralKmPorLitro != null)
                  vehicleUpdates.mediaGeralKmPorLitro = localVeh.mediaGeralKmPorLitro;
                if (localVeh.custoMedioPorKm != null) vehicleUpdates.custoMedioPorKm = localVeh.custoMedioPorKm;
                if (localVeh.qtdAbastecimentos != null) vehicleUpdates.qtdAbastecimentos = localVeh.qtdAbastecimentos;
              }

              const vehicleDocRef = doc(db, 'users', userEmail, 'veiculos', effectiveVehId);
              batch.set(vehicleDocRef, vehicleUpdates, { merge: true });

              if (refItem.pricePerLiter > 0) {
                const priceDocRef = doc(db, 'users', userEmail, 'configuracoes', 'precosCombustivel');
                batch.set(
                  priceDocRef,
                  {
                    [refItem.fuelType]: refItem.pricePerLiter,
                    atualizadoEm: new Date().toISOString(),
                  },
                  { merge: true }
                );
              }

              await withFirestoreTimeout(() => batch.commit(), 3000);

              // Atualiza o ID no cache local caso o ID definitivo tenha sido unificado
              if (targetDocId !== refItem.id) {
                try {
                  const vehCacheKey = `@contagiro:refuelings_v1_${effectiveVehId}`;
                  const vRaw = await AsyncStorage.getItem(vehCacheKey);
                  if (vRaw) {
                    const vList: Refueling[] = JSON.parse(vRaw).map((r: Refueling) =>
                      r.id === refItem.id ? { ...r, id: targetDocId, vehicleId: effectiveVehId } : r
                    );
                    await AsyncStorage.setItem(vehCacheKey, JSON.stringify(vList));
                  }

                  const allRaw = await AsyncStorage.getItem('@contagiro:refuelings_v1');
                  if (allRaw) {
                    const aList: Refueling[] = JSON.parse(allRaw).map((r: Refueling) =>
                      r.id === refItem.id ? { ...r, id: targetDocId, vehicleId: effectiveVehId } : r
                    );
                    await AsyncStorage.setItem('@contagiro:refuelings_v1', JSON.stringify(aList));
                  }
                } catch {}
              }

              await this.dequeue(item.id);
              syncedCount++;
              break;
            }

            case 'DELETE_REFUELING': {
              const { id, vehicleId } = item.payload;
              const effectiveVehId = idMap[vehicleId] || vehicleId;
              await withFirestoreTimeout(
                () => deleteDoc(doc(db, 'users', userEmail, 'veiculos', effectiveVehId, 'abastecimentos', id)),
                3000
              );
              await this.dequeue(item.id);
              syncedCount++;
              break;
            }

            case 'ADD_MAINTENANCE': {
              const mnt: MaintenanceItem = item.payload;
              const effectiveVehId = idMap[mnt.vehicleId] || mnt.vehicleId;
              const localVeh =
                cachedVehicles.find((v) => v.id === effectiveVehId || v.id === mnt.vehicleId);

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
                veiculoId: effectiveVehId,
                veiculo: localVeh?.plate || '',
                dataCadastro: mnt.date,
                kmManutencao: mnt.odometer,
                tipoManutencaoVal: catValMap[mnt.category] || mnt.category,
                tipoManutencao: mnt.title,
                ladoManutencao: mnt.side || '',
                descricaoManutencao: mnt.description || mnt.workshop || '',
                valorManutencao: mnt.cost,
              };

              const mntColRef = collection(db, 'users', userEmail, 'manutencoes');
              let targetDocId = mnt.id;

              try {
                const existingSnap = await withFirestoreTimeout(() => getDocs(mntColRef), 2000);
                if (existingSnap && !existingSnap.empty) {
                  const matchingDocs = existingSnap.docs.filter((d) => {
                    if (d.id === mnt.id) return true;
                    const data = d.data();
                    const isSameVeh = String(data.veiculoId) === effectiveVehId;
                    const isSameDate = String(data.dataCadastro ?? data.date) === mnt.date;
                    const isSameKm = Number(data.kmManutencao ?? data.odometer) === mnt.odometer;
                    const isSameCat =
                      String(data.tipoManutencaoVal) === (catValMap[mnt.category] || mnt.category);
                    const isSameCost = Math.abs(Number(data.valorManutencao ?? data.cost ?? 0) - mnt.cost) < 0.05;
                    return isSameVeh && isSameDate && isSameKm && isSameCat && isSameCost;
                  });

                  if (matchingDocs.length > 0) {
                    targetDocId = matchingDocs[0].id;
                    for (let i = 1; i < matchingDocs.length; i++) {
                      deleteDoc(matchingDocs[i].ref).catch(() => {});
                    }
                  }
                }
              } catch (e) {
                console.warn('Aviso: busca por duplicatas de manutenção no Firestore falhou:', e);
              }

              const batch = writeBatch(db);
              const mntDocRef = doc(mntColRef, targetDocId);
              batch.set(mntDocRef, firestoreData, { merge: true });

              if (localVeh && !effectiveVehId.startsWith('veh-')) {
                const vehUpdates: Record<string, unknown> = {
                  kmAtual: Math.max(localVeh.currentOdometer, mnt.odometer),
                  ultimoKm: Math.max(localVeh.currentOdometer, mnt.odometer),
                };
                if (localVeh.gastoManutencao != null) vehUpdates.gastoManutencao = localVeh.gastoManutencao;
                if (localVeh.qtdManutencoes != null) vehUpdates.qtdManutencoes = localVeh.qtdManutencoes;
                if (localVeh.ultimaTrocaOleoKm != null) vehUpdates.ultimaTrocaOleoKm = localVeh.ultimaTrocaOleoKm;
                if (localVeh.proxTrocaOleoKm != null) vehUpdates.proxTrocaOleoKm = localVeh.proxTrocaOleoKm;
                if (localVeh.ultimaRevisaoKm != null) vehUpdates.ultimaRevisaoKm = localVeh.ultimaRevisaoKm;
                if (localVeh.proxRevKm != null) vehUpdates.proxRevKm = localVeh.proxRevKm;
                if (localVeh.manFreioDiant != null) vehUpdates.manFreioDiant = localVeh.manFreioDiant;
                if (localVeh.manFreioTras != null) vehUpdates.manFreioTras = localVeh.manFreioTras;
                if (localVeh.ultimaLubCorrenteKm != null) vehUpdates.ultimaLubCorrenteKm = localVeh.ultimaLubCorrenteKm;
                if (localVeh.proxLubCorrenteKm != null) vehUpdates.proxLubCorrenteKm = localVeh.proxLubCorrenteKm;
                if (localVeh.ultimaEsticarCorrenteKm != null)
                  vehUpdates.ultimaEsticarCorrenteKm = localVeh.ultimaEsticarCorrenteKm;
                if (localVeh.proxEsticarCorrenteKm != null)
                  vehUpdates.proxEsticarCorrenteKm = localVeh.proxEsticarCorrenteKm;

                batch.set(doc(db, 'users', userEmail, 'veiculos', effectiveVehId), vehUpdates, { merge: true });
              }

              await withFirestoreTimeout(() => batch.commit(), 3000);

              if (targetDocId !== mnt.id) {
                try {
                  const vehCacheKey = `@contagiro:maintenances_v1_${effectiveVehId}`;
                  const vRaw = await AsyncStorage.getItem(vehCacheKey);
                  if (vRaw) {
                    const vList: MaintenanceItem[] = JSON.parse(vRaw).map((m: MaintenanceItem) =>
                      m.id === mnt.id ? { ...m, id: targetDocId, vehicleId: effectiveVehId } : m
                    );
                    await AsyncStorage.setItem(vehCacheKey, JSON.stringify(vList));
                  }

                  const allRaw = await AsyncStorage.getItem('@contagiro:maintenances_v1');
                  if (allRaw) {
                    const aList: MaintenanceItem[] = JSON.parse(allRaw).map((m: MaintenanceItem) =>
                      m.id === mnt.id ? { ...m, id: targetDocId, vehicleId: effectiveVehId } : m
                    );
                    await AsyncStorage.setItem('@contagiro:maintenances_v1', JSON.stringify(aList));
                  }
                } catch {}
              }

              await this.dequeue(item.id);
              syncedCount++;
              break;
            }

            case 'DELETE_MAINTENANCE': {
              const { id } = item.payload;
              await withFirestoreTimeout(
                () => deleteDoc(doc(db, 'users', userEmail, 'manutencoes', id)),
                3000
              );
              await this.dequeue(item.id);
              syncedCount++;
              break;
            }

            case 'SAVE_PERIODIC_CONFIG': {
              const { vehicleId, config } = item.payload;
              const effectiveVehId = idMap[vehicleId] || vehicleId;
              if (!effectiveVehId.startsWith('veh-')) {
                await withFirestoreTimeout(
                  () => setDoc(doc(db, 'users', userEmail, 'veiculos', effectiveVehId), config, { merge: true }),
                  3000
                );
              }
              await this.dequeue(item.id);
              syncedCount++;
              break;
            }

            case 'SAVE_FUEL_PRICES': {
              const { prices } = item.payload;
              await withFirestoreTimeout(
                () =>
                  setDoc(doc(db, 'users', userEmail, 'configuracoes', 'precosCombustivel'), prices, {
                    merge: true,
                  }),
                3000
              );
              await this.dequeue(item.id);
              syncedCount++;
              break;
            }

            case 'SAVE_USER_PROFILE': {
              const profile = item.payload;
              await withFirestoreTimeout(
                () =>
                  setDoc(
                    doc(db, 'users', userKey),
                    {
                      ...profile,
                      updatedAt: new Date().toISOString(),
                    },
                    { merge: true }
                  ),
                3000
              );
              await this.dequeue(item.id);
              syncedCount++;
              break;
            }
          }
        } catch (err: any) {
          console.error(`Erro ao sincronizar item ${item.id} (${item.action}):`, err);
          errors.push(err.message || 'Falha de comunicação');
        }
      }

      return {
        success: errors.length === 0,
        syncedCount,
        errors,
      };
    } finally {
      isCurrentlySyncing = false;
    }
  },
};
