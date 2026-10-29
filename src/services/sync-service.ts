import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import { Vehicle, Refueling, MaintenanceItem } from '@/types/vehicle';

export type SyncAction =
  | 'SAVE_VEHICLE'
  | 'DELETE_VEHICLE'
  | 'ADD_REFUELING'
  | 'DELETE_REFUELING'
  | 'ADD_MAINTENANCE'
  | 'DELETE_MAINTENANCE'
  | 'SAVE_PERIODIC_CONFIG'
  | 'SAVE_FUEL_PRICES';

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

export const SyncService = {
  /**
   * Assina notificações de alteração na contagem da fila de pendências
   */
  subscribe(callback: QueueListener): () => void {
    listeners.add(callback);
    // Notifica imediatamente com a contagem atual
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
   * Adiciona ou atualiza uma operação na fila de sincronização
   */
  async enqueue(action: SyncAction, entityId: string, payload: any): Promise<void> {
    const userEmail = auth.currentUser?.email;
    if (!userEmail) return;

    const queue = await this.getQueue();

    // Se já houver uma ação idêntica pendente para a mesma entidade, substitui pelo payload mais recente
    const existingIndex = queue.findIndex(
      (item) => item.entityId === entityId && item.action === action
    );

    const newItem: SyncQueueItem = {
      id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      action,
      entityId,
      userEmail: userEmail.toLowerCase().trim(),
      payload,
      createdAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      queue[existingIndex] = newItem;
    } else {
      // Se for DELETE, remove qualquer criação/edição pendente para não tentar criar antes de deletar
      if (action.startsWith('DELETE_')) {
        const createAction = action.replace('DELETE_', 'SAVE_').replace('DELETE_', 'ADD_');
        const filtered = queue.filter(
          (item) => !(item.entityId === entityId && item.action === createAction)
        );
        filtered.push(newItem);
        await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered));
        this.notifyListeners(filtered.length);
        return;
      }
      queue.push(newItem);
    }

    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    this.notifyListeners(queue.length);
  },

  /**
   * Remove uma operação da fila após sucesso
   */
  async dequeue(itemId: string): Promise<void> {
    const queue = await this.getQueue();
    const updated = queue.filter((item) => item.id !== itemId);
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updated));
    this.notifyListeners(updated.length);
  },

  /**
   * Remove todas as operações pendentes da mesma entidade
   */
  async removeByEntityId(entityId: string): Promise<void> {
    const queue = await this.getQueue();
    const updated = queue.filter((item) => item.entityId !== entityId);
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updated));
    this.notifyListeners(updated.length);
  },

  /**
   * Executa a sincronização forçada de todas as pendências locais com o Firestore
   */
  async syncNow(): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
    const userEmail = auth.currentUser?.email;
    if (!userEmail) {
      return { success: false, syncedCount: 0, errors: ['Nenhum usuário conectado para sincronizar.'] };
    }

    const queue = await this.getQueue();
    if (queue.length === 0) {
      return { success: true, syncedCount: 0, errors: [] };
    }

    let syncedCount = 0;
    const errors: string[] = [];
    const remainingQueue: SyncQueueItem[] = [];

    // Mapeamento de IDs temporários (ex: veh-172900...) para os IDs gerados pelo Firestore
    const idMap: Record<string, string> = {};

    for (const item of queue) {
      try {
        switch (item.action) {
          case 'SAVE_VEHICLE': {
            const vehicle: Vehicle = item.payload;
            const effectiveVehId = idMap[vehicle.id] || vehicle.id;
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
              photoUrl: vehicle.photoUrl || null,
              fotoUrl: vehicle.photoUrl || null,
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

            if (vehicle.gastoManutencao != null) docData.gastoManutencao = vehicle.gastoManutencao;
            if (vehicle.totalGastoAbast != null) docData.totalGastoAbast = vehicle.totalGastoAbast;
            if (vehicle.totalLitrosAbast != null) docData.totalLitrosAbast = vehicle.totalLitrosAbast;
            if (vehicle.mediaGeralKmPorLitro != null) docData.mediaGeralKmPorLitro = vehicle.mediaGeralKmPorLitro;
            if (vehicle.custoMedioPorKm != null) docData.custoMedioPorKm = vehicle.custoMedioPorKm;
            if (vehicle.qtdAbastecimentos != null) docData.qtdAbastecimentos = vehicle.qtdAbastecimentos;
            if (vehicle.qtdManutencoes != null) docData.qtdManutencoes = vehicle.qtdManutencoes;
            if (vehicle.order != null) docData.ordem = vehicle.order;
            if (vehicle.isPreferred != null) docData.preferido = vehicle.isPreferred;

            if (effectiveVehId && !effectiveVehId.startsWith('veh-')) {
              await setDoc(doc(db, 'users', userEmail, 'veiculos', effectiveVehId), docData, { merge: true });
            } else {
              const docRef = await addDoc(collection(db, 'users', userEmail, 'veiculos'), docData);
              idMap[vehicle.id] = docRef.id;

              // Atualiza o ID do veículo salvo no AsyncStorage
              const cachedVehiclesRaw = await AsyncStorage.getItem('@contagiro:vehicles_v1');
              if (cachedVehiclesRaw) {
                const list: Vehicle[] = JSON.parse(cachedVehiclesRaw);
                const idx = list.findIndex((v) => v.id === vehicle.id);
                if (idx >= 0) {
                  list[idx].id = docRef.id;
                  await AsyncStorage.setItem('@contagiro:vehicles_v1', JSON.stringify(list));
                }
              }

              const activeId = await AsyncStorage.getItem('@contagiro:active_vehicle_id_v1');
              if (activeId === vehicle.id) {
                await AsyncStorage.setItem('@contagiro:active_vehicle_id_v1', docRef.id);
              }
            }
            syncedCount++;
            break;
          }

          case 'DELETE_VEHICLE': {
            const vehId = idMap[item.entityId] || item.entityId;
            if (!vehId.startsWith('veh-')) {
              await deleteDoc(doc(db, 'users', userEmail, 'veiculos', vehId));
            }
            syncedCount++;
            break;
          }

          case 'ADD_REFUELING': {
            const ref: Refueling = item.payload;
            const effectiveVehId = idMap[ref.vehicleId] || ref.vehicleId;

            const rawComb =
              ref.fuelType === 'etanol'
                ? 'Etanol'
                : ref.fuelType === 'diesel'
                ? 'Diesel'
                : ref.fuelType === 'gnv'
                ? 'GNV'
                : 'Gasolina';

            const firestoreData: Record<string, unknown> = {
              idVeiculo: effectiveVehId,
              placa: ref.plate || '',
              data: ref.date,
              combustivel: rawComb,
              kmAntigo: ref.previousOdometer || 0,
              kmAtual: ref.odometer,
              qdtAbastecida: ref.liters,
              valorLitro: ref.pricePerLiter,
              totalAmount: ref.totalAmount,
              media: ref.consumptionKmPerLiter || 0,
              seTanqueCheio: ref.isFullTank,
              seAditivado: Boolean(ref.isAdditivated),
              observacao: ref.notes || ref.gasStation || '',
            };

            const batch = writeBatch(db);
            const subColRef = collection(db, 'users', userEmail, 'veiculos', effectiveVehId, 'abastecimentos');
            const newRefDoc = doc(subColRef);
            batch.set(newRefDoc, firestoreData);

            const vehicleDocRef = doc(db, 'users', userEmail, 'veiculos', effectiveVehId);
            batch.set(
              vehicleDocRef,
              {
                kmAtual: ref.odometer,
                ultimoKm: ref.odometer,
                ultimoComb: rawComb,
              },
              { merge: true }
            );

            await batch.commit();
            syncedCount++;
            break;
          }

          case 'DELETE_REFUELING': {
            const { id, vehicleId } = item.payload;
            const effectiveVehId = idMap[vehicleId] || vehicleId;
            if (!id.startsWith('ref-')) {
              await deleteDoc(doc(db, 'users', userEmail, 'veiculos', effectiveVehId, 'abastecimentos', id));
              try {
                await deleteDoc(doc(db, 'users', userEmail, 'medias', id));
              } catch {}
            }
            syncedCount++;
            break;
          }

          case 'ADD_MAINTENANCE': {
            const mnt: MaintenanceItem = item.payload;
            const effectiveVehId = idMap[mnt.vehicleId] || mnt.vehicleId;

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
              veiculo: '',
              dataCadastro: mnt.date,
              kmManutencao: mnt.odometer,
              tipoManutencaoVal: catValMap[mnt.category] || mnt.category,
              tipoManutencao: mnt.title,
              ladoManutencao: mnt.side || '',
              descricaoManutencao: mnt.description || mnt.workshop || '',
              valorManutencao: mnt.cost,
            };

            await addDoc(collection(db, 'users', userEmail, 'manutencoes'), firestoreData);
            syncedCount++;
            break;
          }

          case 'DELETE_MAINTENANCE': {
            const { id } = item.payload;
            if (!id.startsWith('mnt-')) {
              await deleteDoc(doc(db, 'users', userEmail, 'manutencoes', id));
            }
            syncedCount++;
            break;
          }

          case 'SAVE_PERIODIC_CONFIG': {
            const { vehicleId, config } = item.payload;
            const effectiveVehId = idMap[vehicleId] || vehicleId;
            if (!effectiveVehId.startsWith('veh-')) {
              await setDoc(doc(db, 'users', userEmail, 'veiculos', effectiveVehId), config, { merge: true });
            }
            syncedCount++;
            break;
          }

          case 'SAVE_FUEL_PRICES': {
            const { prices } = item.payload;
            await setDoc(
              doc(db, 'users', userEmail, 'configuracoes', 'precosCombustivel'),
              prices,
              { merge: true }
            );
            syncedCount++;
            break;
          }
        }
      } catch (err: any) {
        console.error(`Erro ao sincronizar item ${item.id} (${item.action}):`, err);
        errors.push(err.message || 'Falha de comunicação');
        // Mantém na fila se falhou por rede ou erro transitório
        remainingQueue.push(item);
      }
    }

    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remainingQueue));
    this.notifyListeners(remainingQueue.length);

    return {
      success: errors.length === 0,
      syncedCount,
      errors,
    };
  },
};

