import * as Notifications from 'expo-notifications';
import {
  AndroidImportance,
  AndroidNotificationPriority,
  SchedulableTriggerInputTypes,
} from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calculations } from '@/services/calculations';
import { StorageService } from '@/services/storage';

// Configuração do comportamento da notificação quando o app está em primeiro plano (foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const STORAGE_KEYS = {
  NOTIFICATIONS_ENABLED: '@contagiro:notifications_enabled_v1',
};

export const NotificationService = {
  /**
   * Inicializa o canal Android, registra listeners e sincroniza os agendamentos
   */
  async init(): Promise<void> {
    try {
      await this.setupAndroidChannel();

      // Assina alterações de manutenção/veículo para atualizar lembretes automaticamente
      StorageService.onMaintenanceChange(() => {
        this.syncMaintenanceNotifications().catch(() => {});
      });

      const enabled = await this.isNotificationsEnabled();
      if (enabled) {
        await this.syncMaintenanceNotifications();
      }
    } catch (err) {
      console.warn('Erro ao inicializar NotificationService:', err);
    }
  },

  /**
   * Configura o canal de notificações específico no Android
   */
  async setupAndroidChannel(): Promise<void> {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('manutencoes', {
          name: 'Lembretes e Alertas de Manutenção',
          description: 'Notificações para prazos e lembretes de revisões e manutenções do veículo',
          importance: AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#10B981',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
      } catch (err) {
        console.warn('Erro ao criar canal Android de notificações:', err);
      }
    }
  },

  /**
   * Verifica se o usuário tem permissão concedida
   */
  async checkPermissions(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  },

  /**
   * Solicita permissão ao usuário para envio de notificações na bandeja
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        finalStatus = status;
      }
      const granted = finalStatus === 'granted';
      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, granted ? 'true' : 'false');
      return granted;
    } catch (err) {
      console.warn('Erro ao solicitar permissões de notificação:', err);
      return false;
    }
  },

  async isNotificationsEnabled(): Promise<boolean> {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED);
      if (saved === 'false') return false;
      return await this.checkPermissions();
    } catch {
      return true;
    }
  },

  async setNotificationsEnabled(enabled: boolean): Promise<boolean> {
    try {
      if (enabled) {
        const granted = await this.requestPermissions();
        if (granted) {
          await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, 'true');
          await this.syncMaintenanceNotifications();
          return true;
        }
        return false;
      } else {
        await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, 'false');
        await this.cancelAllMaintenanceNotifications();
        return false;
      }
    } catch {
      return false;
    }
  },

  /**
   * Cancela todos os agendamentos anteriores de manutenção
   */
  async cancelAllMaintenanceNotifications(): Promise<void> {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const item of scheduled) {
        if (item.identifier.startsWith('maint-') || item.content.data?.type === 'maintenance_alert') {
          await Notifications.cancelScheduledNotificationAsync(item.identifier);
        }
      }
    } catch (err) {
      console.warn('Erro ao cancelar notificações de manutenção:', err);
    }
  },

  /**
   * Gera as próximas datas no horário das 7h da manhã com o intervalo especificado em dias
   */
  getNextDatesAt7AM(intervalDays: number, count = 10): Date[] {
    const dates: Date[] = [];
    const now = new Date();

    for (let i = 0; i <= count + 1; i++) {
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (i * intervalDays), 7, 0, 0, 0);
      if (target.getTime() > now.getTime()) {
        dates.push(target);
      }
      if (dates.length >= count) {
        break;
      }
    }

    return dates;
  },

  /**
   * Varre todos os veículos e manutenções do app e agenda as notificações conforme a regra:
   * - Alerta: a cada 3 dias às 7h da manhã
   * - Atenção: a cada 7 dias às 7h da manhã
   */
  async syncMaintenanceNotifications(): Promise<number> {
    try {
      const isEnabled = await this.isNotificationsEnabled();
      if (!isEnabled) return 0;

      const hasPermission = await this.checkPermissions();
      if (!hasPermission) return 0;

      // 1. Limpa agendamentos anteriores para evitar duplicidades
      await this.cancelAllMaintenanceNotifications();

      // 2. Obtém veículos e manutenções
      const vehicles = await StorageService.getVehicles();
      if (vehicles.length === 0) return 0;

      let scheduledCount = 0;

      for (const vehicle of vehicles) {
        const maintenances = await StorageService.getMaintenances(vehicle.id);
        const alerts = Calculations.getMaintenanceAlerts(vehicle.currentOdometer, maintenances, vehicle);

        for (const alert of alerts) {
          // Manutenções em ALERTA (ou vencidas)
          if (alert.status === 'alerta' || alert.status === 'vencido') {
            const kmRestante = Math.max(0, Math.round(alert.kmRemaining ?? 0));
            const kmFormatado = kmRestante.toLocaleString('pt-BR');
            const title = 'Alerta de manutenção';
            const body = `Faltam ${kmFormatado} km para ${alert.title}`;

            // A cada 3 dias às 7h da manhã (próximos ciclos)
            const targetDates = this.getNextDatesAt7AM(3, 10);

            for (let idx = 0; idx < targetDates.length; idx++) {
              const date = targetDates[idx];
              await Notifications.scheduleNotificationAsync({
                identifier: `maint-alerta-${vehicle.id}-${alert.category}-${idx}`,
                content: {
                  title,
                  body,
                  sound: 'default',
                  priority: AndroidNotificationPriority.HIGH,
                  data: {
                    type: 'maintenance_alert',
                    alertType: 'alerta',
                    vehicleId: vehicle.id,
                    vehicleName: vehicle.name,
                    category: alert.category,
                  },
                },
                trigger: {
                  type: SchedulableTriggerInputTypes.DATE,
                  date,
                  channelId: 'manutencoes',
                },
              });
              scheduledCount++;
            }
          }
          // Manutenções em ATENÇÃO
          else if (alert.status === 'atencao' || alert.status === 'proximo') {
            const kmRestante = Math.max(0, Math.round(alert.kmRemaining ?? 0));
            const kmFormatado = kmRestante.toLocaleString('pt-BR');
            const title = 'Lembrete de manutenção';
            const body = `Faltam ${kmFormatado} km para ${alert.title}`;

            // A cada 7 dias às 7h da manhã (próximos ciclos)
            const targetDates = this.getNextDatesAt7AM(7, 6);

            for (let idx = 0; idx < targetDates.length; idx++) {
              const date = targetDates[idx];
              await Notifications.scheduleNotificationAsync({
                identifier: `maint-atencao-${vehicle.id}-${alert.category}-${idx}`,
                content: {
                  title,
                  body,
                  sound: 'default',
                  priority: AndroidNotificationPriority.DEFAULT,
                  data: {
                    type: 'maintenance_alert',
                    alertType: 'atencao',
                    vehicleId: vehicle.id,
                    vehicleName: vehicle.name,
                    category: alert.category,
                  },
                },
                trigger: {
                  type: SchedulableTriggerInputTypes.DATE,
                  date,
                  channelId: 'manutencoes',
                },
              });
              scheduledCount++;
            }
          }
        }
      }

      return scheduledCount;
    } catch (err) {
      console.warn('Erro ao sincronizar notificações de manutenção:', err);
      return 0;
    }
  },

  /**
   * Envia uma notificação imediata de teste na bandeja para validação
   */
  async sendTestNotification(type: 'alerta' | 'atencao' = 'alerta'): Promise<void> {
    const hasPerm = await this.requestPermissions();
    if (!hasPerm) {
      throw new Error('Permissão de notificação não concedida.');
    }

    await this.setupAndroidChannel();

    const title = type === 'alerta' ? 'Alerta de manutenção' : 'Lembrete de manutenção';
    const body = type === 'alerta'
      ? 'Faltam 150 km para Troca de Óleo + Filtros'
      : 'Faltam 800 km para Revisão Periódica';

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: type === 'alerta'
          ? AndroidNotificationPriority.HIGH
          : AndroidNotificationPriority.DEFAULT,
        data: { test: true },
      },
      trigger: {
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        channelId: 'manutencoes',
      },
    });
  },
};
