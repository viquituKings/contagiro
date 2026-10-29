import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import { CacheService, CacheStats } from '@/services/cache-service';
import { promptImageSource, pickAndOptimizeImage } from '@/services/image-picker';
import { NotificationService } from '@/services/notifications';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, updateUserProfile, changePassword, resetPassword, logout, deleteAccount } = useAuth();
  const { themePreference, setThemePreference, isDark, theme } = useAppTheme();

  // Estados de Edição de Perfil
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [savingName, setSavingName] = useState(false);

  // Estados de Alteração de Senha
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // Estados de Cache e Armazenamento
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loadingCache, setLoadingCache] = useState(true);
  const [clearingCache, setClearingCache] = useState(false);

  // Estados de Notificações na Bandeja
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [togglingNotifications, setTogglingNotifications] = useState(false);
  const [testingNotification, setTestingNotification] = useState<'alerta' | 'atencao' | null>(null);

  // Estados de Exclusão de Conta
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Provedor de Autenticação do Usuário
  const isGoogleUser = user?.providerData.some((p) => p.providerId === 'google.com');
  const isPasswordUser = user?.providerData.some((p) => p.providerId === 'password');

  // Carrega estatísticas de armazenamento
  const loadCacheInfo = useCallback(async () => {
    try {
      const stats = await CacheService.getCacheStats();
      setCacheStats(stats);
    } catch (e) {
      console.warn('Erro ao carregar dados de cache:', e);
    } finally {
      setLoadingCache(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCacheInfo();
  }, [loadCacheInfo]);

  useEffect(() => {
    if (user?.displayName && user.displayName !== displayName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayName(user.displayName);
    }
  }, [user?.displayName, displayName]);

  // AÇÃO: Alterar Foto de Perfil
  const handlePickPhoto = async () => {
    const source = await promptImageSource();
    if (!source) return;

    setAvatarLoading(true);
    try {
      const result = await pickAndOptimizeImage(source, { targetSize: 320, compress: 0.7 });
      if (result) {
        await updateUserProfile({ photoUrl: result.base64Uri });
        await loadCacheInfo();
        Alert.alert('Sucesso', 'Sua foto de perfil foi atualizada com sucesso!');
      }
    } catch (e: any) {
      console.error('Erro ao atualizar foto de perfil:', e);
      Alert.alert('Erro', e.message || 'Não foi possível atualizar sua foto de perfil.');
    } finally {
      setAvatarLoading(false);
    }
  };

  // AÇÃO: Remover Foto de Perfil
  const handleRemovePhoto = () => {
    if (!user?.photoURL) return;

    Alert.alert('Remover Foto', 'Deseja remover sua foto de perfil atual?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setAvatarLoading(true);
          try {
            await updateUserProfile({ photoUrl: null });
            await loadCacheInfo();
            Alert.alert('Sucesso', 'Foto de perfil removida com sucesso!');
          } catch (e: any) {
            console.error('Erro ao remover foto:', e);
            Alert.alert('Erro', 'Não foi possível remover sua foto.');
          } finally {
            setAvatarLoading(false);
          }
        },
      },
    ]);
  };

  // AÇÃO: Salvar Nome de Usuário
  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      Alert.alert('Nome Obrigatório', 'Por favor, informe seu nome de usuário.');
      return;
    }
    if (trimmed === user?.displayName) {
      Alert.alert('Informação', 'O nome informado já é o seu nome atual.');
      return;
    }

    setSavingName(true);
    try {
      await updateUserProfile({ displayName: trimmed });
      Alert.alert('Sucesso', 'Seu nome foi alterado com sucesso!');
    } catch (e: any) {
      console.error('Erro ao salvar nome:', e);
      Alert.alert('Erro', e.message || 'Não foi possível alterar seu nome.');
    } finally {
      setSavingName(false);
    }
  };

  // AÇÃO: Alterar Senha
  const handleChangePassword = async () => {
    if (!newPassword) {
      Alert.alert('Atenção', 'Informe a nova senha desejada.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Senha Fraca', 'A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Atenção', 'A confirmação de senha não confere com a nova senha.');
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(newPassword, currentPassword || undefined);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Sucesso', 'Sua senha foi alterada com sucesso!');
    } catch (e: any) {
      console.error('Erro ao alterar senha:', e);
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        Alert.alert('Senha Incorreta', 'A senha atual informada está incorreta.');
      } else if (e.code === 'auth/requires-recent-login') {
        Alert.alert(
          'Reautenticação Necessária',
          'Por segurança, informe sua senha atual para confirmar a alteração, ou saia e entre novamente no aplicativo.'
        );
      } else {
        Alert.alert('Erro ao Alterar Senha', e.message || 'Não foi possível atualizar a senha.');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  // AÇÃO: Enviar e-mail de redefinição de senha
  const handleSendResetEmail = async () => {
    if (!user?.email) return;

    Alert.alert(
      'Redefinir Senha',
      `Deseja receber um link de redefinição de senha no e-mail ${user.email}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar E-mail',
          onPress: async () => {
            setSendingReset(true);
            try {
              await resetPassword(user.email!);
              Alert.alert(
                'E-mail Enviado',
                'Verifique sua caixa de entrada para instruções de redefinição de senha.'
              );
            } catch (e: any) {
              Alert.alert('Erro', e.message || 'Não foi possível enviar o e-mail de recuperação.');
            } finally {
              setSendingReset(false);
            }
          },
        },
      ]
    );
  };

  // AÇÃO: Limpar Cache do App
  const handleClearCache = () => {
    Alert.alert(
      'Limpar Cache',
      'Deseja limpar os arquivos temporários e fotos em cache? Seus veículos e dados na nuvem não serão perdidos e serão recarregados automaticamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar Agora',
          style: 'destructive',
          onPress: async () => {
            setClearingCache(true);
            try {
              const result = await CacheService.clearAppCache();
              await loadCacheInfo();
              Alert.alert(
                'Cache Limpo',
                result.freedBytes > 0
                  ? `Foram liberados ${result.formattedFreed} de espaço temporário.`
                  : 'O cache do aplicativo já estava totalmente otimizado!'
              );
            } catch {
              Alert.alert('Erro', 'Ocorreu um erro ao limpar o cache temporário.');
            } finally {
              setClearingCache(false);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    NotificationService.isNotificationsEnabled().then(setNotificationsEnabled);
  }, []);

  // AÇÃO: Alterar ativação de notificações
  const handleToggleNotifications = async (value: boolean) => {
    setTogglingNotifications(true);
    try {
      const result = await NotificationService.setNotificationsEnabled(value);
      setNotificationsEnabled(result);
      if (value && !result) {
        Alert.alert(
          'Permissão Necessária',
          'Para receber alertas de manutenção na bandeja, habilite as notificações do ContaGiro nas configurações do seu celular.'
        );
      } else if (value && result) {
        Alert.alert(
          'Notificações Ativadas',
          'Os alertas (cada 3 dias às 7h) e lembretes (cada 7 dias às 7h) foram agendados na bandeja do seu smartphone.'
        );
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar as configurações de notificação.');
    } finally {
      setTogglingNotifications(false);
    }
  };

  // AÇÃO: Disparar notificação de teste imediata
  const handleTestNotification = async (type: 'alerta' | 'atencao') => {
    setTestingNotification(type);
    try {
      await NotificationService.sendTestNotification(type);
      Alert.alert(
        'Notificação Agendada',
        'Em 2 segundos a notificação será exibida na bandeja do smartphone. Se quiser, minimize o app para ver o banner na tela!'
      );
    } catch (e: any) {
      Alert.alert('Atenção', e.message || 'Permissão de notificação não concedida nas configurações do dispositivo.');
    } finally {
      setTestingNotification(null);
    }
  };

  // AÇÃO: Sair da Conta
  const handleLogout = () => {
    Alert.alert('Sair da Conta', 'Deseja encerrar a sessão atual?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  // AÇÃO: Abrir Modal de Exclusão
  const handleOpenDeleteModal = () => {
    setDeletePassword('');
    setShowDeletePassword(false);
    setDeleteError(null);
    setDeleteModalVisible(true);
  };

  // AÇÃO: Confirmar Exclusão de Conta
  const handleConfirmDelete = async () => {
    const isGoogleOnly = isGoogleUser && !isPasswordUser;

    if (isGoogleOnly) {
      if (deletePassword.trim().toUpperCase() !== 'EXCLUIR') {
        setDeleteError('Digite EXCLUIR para confirmar a exclusão da conta.');
        return;
      }
    } else {
      if (!deletePassword.trim()) {
        setDeleteError('Por favor, informe sua senha atual para confirmar.');
        return;
      }
    }

    setDeletingAccount(true);
    setDeleteError(null);

    try {
      await deleteAccount(isGoogleOnly ? undefined : deletePassword);
      setDeleteModalVisible(false);
      Alert.alert(
        'Conta Excluída',
        'Sua conta e todos os seus dados foram permanentemente excluídos do ContaGiro.',
        [
          {
            text: 'OK',
            onPress: () => {
              router.replace('/login');
            },
          },
        ]
      );
    } catch (err: any) {
      console.error('Erro ao excluir conta:', err);
      let errorMsg = 'Não foi possível excluir sua conta. Verifique sua conexão e tente novamente.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMsg = 'Senha incorreta. Verifique a senha digitada e tente novamente.';
      } else if (err.code === 'auth/requires-recent-login') {
        errorMsg = 'Por segurança, encerre a sessão e realize login novamente antes de excluir a conta.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      setDeleteError(errorMsg);
      Alert.alert('Erro ao excluir conta', errorMsg);
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* HEADER */}
        <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Configurações</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
              Perfil, tema e armazenamento
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* SEÇÃO 1: PERFIL DO USUÁRIO */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: theme.accentLight }]}>
                <Ionicons name="person-outline" size={18} color={theme.accent} />
              </View>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Perfil do Usuário</Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                  Edite sua foto e seu nome de exibição
                </Text>
              </View>
            </View>

            {/* FOTO DE PERFIL */}
            <View style={styles.avatarRow}>
              <TouchableOpacity
                style={[
                  styles.avatarWrapper,
                  { backgroundColor: theme.accentLight, borderColor: theme.accent },
                ]}
                onPress={handlePickPhoto}
                disabled={avatarLoading}
                activeOpacity={0.8}
              >
                {avatarLoading ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : user?.photoURL ? (
                  <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={38} color={theme.accent} />
                )}
                <View style={[styles.avatarCameraBadge, { backgroundColor: theme.accent }]}>
                  <Ionicons name="camera" size={13} color="#FFFFFF" />
                </View>
              </TouchableOpacity>

              <View style={{ flex: 1, gap: 6 }}>
                <TouchableOpacity
                  style={[styles.actionOutlineBtn, { borderColor: theme.accent, backgroundColor: theme.accentLight }]}
                  onPress={handlePickPhoto}
                  disabled={avatarLoading}
                >
                  <Ionicons name="image-outline" size={16} color={theme.accent} />
                  <Text style={[styles.actionOutlineBtnText, { color: theme.accent }]}>
                    Alterar Foto de Perfil
                  </Text>
                </TouchableOpacity>

                {Boolean(user?.photoURL) && (
                  <TouchableOpacity
                    style={[styles.actionOutlineBtn, { borderColor: theme.red + '55', backgroundColor: isDark ? '#1F1419' : '#FEF2F2' }]}
                    onPress={handleRemovePhoto}
                    disabled={avatarLoading}
                  >
                    <Ionicons name="trash-outline" size={14} color={theme.red} />
                    <Text style={[styles.actionOutlineBtnText, { color: theme.red }]}>
                      Remover Foto
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* NOME DE USUÁRIO */}
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Nome de Exibição:</Text>
              <View style={styles.nameInputRow}>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      borderColor: theme.cardBorder,
                      flex: 1,
                    },
                  ]}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Seu nome completo ou apelido"
                  placeholderTextColor={theme.textMuted}
                />
                <TouchableOpacity
                  style={[
                    styles.saveNameBtn,
                    {
                      backgroundColor: theme.accent,
                      opacity: savingName || displayName.trim() === user?.displayName ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleSaveName}
                  disabled={savingName || displayName.trim() === user?.displayName}
                >
                  {savingName ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveNameBtnText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* E-MAIL (SOMENTE LEITURA) */}
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: theme.textMuted }]}>E-mail da Conta:</Text>
              <View
                style={[
                  styles.readOnlyBox,
                  { backgroundColor: theme.inputBg, borderColor: theme.cardBorder },
                ]}
              >
                <Ionicons name="mail-outline" size={16} color={theme.textMuted} />
                <Text style={[styles.readOnlyText, { color: theme.textMuted }]} numberOfLines={1}>
                  {user?.email || 'Não informado'}
                </Text>
                <View style={[styles.providerBadge, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                  <Text style={[styles.providerBadgeText, { color: theme.textMuted }]}>
                    {isGoogleUser ? 'Google' : 'E-mail'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* SEÇÃO 2: SEGURANÇA E SENHA */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                <Ionicons name="lock-closed-outline" size={18} color={theme.blue} />
              </View>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Segurança e Senha</Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                  {isGoogleUser
                    ? 'Autenticação gerenciada pelo Google'
                    : 'Atualize sua senha de acesso ao app'}
                </Text>
              </View>
            </View>

            {isGoogleUser && !isPasswordUser ? (
              <View style={[styles.googleNoticeBox, { backgroundColor: isDark ? '#111D33' : '#EFF6FF', borderColor: theme.blue + '44' }]}>
                <Ionicons name="information-circle-outline" size={20} color={theme.blue} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.googleNoticeTitle, { color: theme.text }]}>
                    Conta Vinculada ao Google
                  </Text>
                  <Text style={[styles.googleNoticeDesc, { color: theme.textMuted }]}>
                    Você acessa o ContaGiro com sua conta Google. Para alterar sua senha principal, utilize o gerenciador de contas do Google.
                  </Text>
                  <TouchableOpacity
                    style={{ marginTop: 6 }}
                    onPress={handleSendResetEmail}
                    disabled={sendingReset}
                  >
                    <Text style={[styles.resetLinkText, { color: theme.blue }]}>
                      {sendingReset ? 'Enviando e-mail...' : 'Deseja cadastrar uma senha avulsa? Clique aqui'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {/* SENHA ATUAL */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
                    Senha Atual:
                  </Text>
                  <View
                    style={[
                      styles.passwordInputWrapper,
                      { backgroundColor: theme.inputBg, borderColor: theme.cardBorder },
                    ]}
                  >
                    <TextInput
                      style={[styles.passwordInput, { color: theme.text }]}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      placeholder="Sua senha atual"
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry={!showCurrentPass}
                    />
                    <TouchableOpacity
                      onPress={() => setShowCurrentPass(!showCurrentPass)}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={showCurrentPass ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={theme.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* NOVA SENHA */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
                    Nova Senha:
                  </Text>
                  <View
                    style={[
                      styles.passwordInputWrapper,
                      { backgroundColor: theme.inputBg, borderColor: theme.cardBorder },
                    ]}
                  >
                    <TextInput
                      style={[styles.passwordInput, { color: theme.text }]}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Mínimo de 6 caracteres"
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry={!showNewPass}
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPass(!showNewPass)}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={showNewPass ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={theme.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* CONFIRMAÇÃO DA NOVA SENHA */}
                <View style={styles.inputContainer}>
                  <Text style={[styles.inputLabel, { color: theme.textMuted }]}>
                    Confirmar Nova Senha:
                  </Text>
                  <View
                    style={[
                      styles.passwordInputWrapper,
                      { backgroundColor: theme.inputBg, borderColor: theme.cardBorder },
                    ]}
                  >
                    <TextInput
                      style={[styles.passwordInput, { color: theme.text }]}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Repita a nova senha"
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry={!showConfirmPass}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPass(!showConfirmPass)}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={showConfirmPass ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={theme.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.savePasswordBtn,
                    {
                      backgroundColor: theme.blue,
                      opacity: savingPassword || !newPassword ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleChangePassword}
                  disabled={savingPassword || !newPassword}
                >
                  {savingPassword ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.savePasswordBtnText}>Alterando Senha...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="shield-checkmark-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.savePasswordBtnText}>Atualizar Senha</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ alignSelf: 'center', marginTop: 4 }}
                  onPress={handleSendResetEmail}
                  disabled={sendingReset}
                >
                  <Text style={[styles.resetLinkText, { color: theme.textMuted }]}>
                    Esqueceu a senha atual? Enviar link para o e-mail
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* SEÇÃO 3: TEMA DO APLICATIVO */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)' }]}>
                <Ionicons name="color-palette-outline" size={18} color="#F59E0B" />
              </View>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Tema do Aplicativo</Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                  Escolha como prefere visualizar as telas
                </Text>
              </View>
            </View>

            <View style={styles.themeOptionsGrid}>
              {/* OPÇÃO 1: ESCURO */}
              <TouchableOpacity
                style={[
                  styles.themeOptionCard,
                  {
                    backgroundColor: themePreference === 'dark' ? (isDark ? '#1C263B' : '#F1F5F9') : theme.inputBg,
                    borderColor: themePreference === 'dark' ? theme.accent : theme.cardBorder,
                    borderWidth: themePreference === 'dark' ? 2 : 1,
                  },
                ]}
                onPress={() => setThemePreference('dark')}
                activeOpacity={0.8}
              >
                <View style={[styles.themeOptionIconCircle, { backgroundColor: '#090D16' }]}>
                  <Ionicons name="moon" size={20} color="#F8FAFC" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.themeOptionName, { color: theme.text }]}>Escuro</Text>
                  <Text style={[styles.themeOptionDesc, { color: theme.textMuted }]}>
                    Visual noturno de alta imersão
                  </Text>
                </View>
                {themePreference === 'dark' && (
                  <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
                )}
              </TouchableOpacity>

              {/* OPÇÃO 2: CLARO */}
              <TouchableOpacity
                style={[
                  styles.themeOptionCard,
                  {
                    backgroundColor: themePreference === 'light' ? (isDark ? '#1C263B' : '#F1F5F9') : theme.inputBg,
                    borderColor: themePreference === 'light' ? theme.accent : theme.cardBorder,
                    borderWidth: themePreference === 'light' ? 2 : 1,
                  },
                ]}
                onPress={() => setThemePreference('light')}
                activeOpacity={0.8}
              >
                <View style={[styles.themeOptionIconCircle, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' }]}>
                  <Ionicons name="sunny" size={20} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.themeOptionName, { color: theme.text }]}>Claro</Text>
                  <Text style={[styles.themeOptionDesc, { color: theme.textMuted }]}>
                    Cores claras com alto contraste
                  </Text>
                </View>
                {themePreference === 'light' && (
                  <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
                )}
              </TouchableOpacity>

              {/* OPÇÃO 3: AUTOMÁTICO */}
              <TouchableOpacity
                style={[
                  styles.themeOptionCard,
                  {
                    backgroundColor: themePreference === 'auto' ? (isDark ? '#1C263B' : '#F1F5F9') : theme.inputBg,
                    borderColor: themePreference === 'auto' ? theme.accent : theme.cardBorder,
                    borderWidth: themePreference === 'auto' ? 2 : 1,
                  },
                ]}
                onPress={() => setThemePreference('auto')}
                activeOpacity={0.8}
              >
                <View style={[styles.themeOptionIconCircle, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                  <Ionicons name="phone-portrait-outline" size={20} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.themeOptionName, { color: theme.text }]}>Automático</Text>
                  <Text style={[styles.themeOptionDesc, { color: theme.textMuted }]}>
                    Segue o tema do seu celular
                  </Text>
                </View>
                {themePreference === 'auto' && (
                  <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* SEÇÃO: NOTIFICAÇÕES DE MANUTENÇÃO NA BANDEJA */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
                <Ionicons name="notifications-outline" size={18} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Notificações de Manutenção</Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                  Avisos automáticos na bandeja do seu celular
                </Text>
              </View>
              {togglingNotifications ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleToggleNotifications}
                  trackColor={{ false: isDark ? '#334155' : '#CBD5E1', true: theme.accent }}
                  thumbColor={notificationsEnabled ? '#FFFFFF' : '#F1F5F9'}
                />
              )}
            </View>

            {/* REGRAS DE NOTIFICAÇÃO CONFIGURADAS */}
            <View style={styles.notificationRulesContainer}>
              {/* REGRA 1: ALERTA DE MANUTENÇÃO */}
              <View style={[styles.notificationRuleCard, { backgroundColor: theme.inputBg, borderColor: theme.red + '40' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={[styles.ruleIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                    <Ionicons name="alert-circle" size={18} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2, flexWrap: 'wrap', gap: 4 }}>
                      <Text style={[styles.ruleHeaderTitle, { color: theme.text }]}>Alerta de manutenção</Text>
                      <View style={[styles.ruleFrequencyBadge, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                        <Text style={[styles.ruleFrequencyText, { color: '#EF4444' }]}>A cada 3 dias às 7h</Text>
                      </View>
                    </View>
                    <Text style={[styles.ruleMessageSample, { color: theme.text }]}>
                      Faltam [quantidade de km] km para [nome da manutenção]
                    </Text>
                    <Text style={[styles.ruleDetailText, { color: theme.textMuted }]}>
                      Disparado para serviços em alerta crítico (≤ 15% restante) ou vencidos.
                    </Text>
                  </View>
                </View>
              </View>

              {/* REGRA 2: LEMBRETE DE MANUTENÇÃO */}
              <View style={[styles.notificationRuleCard, { backgroundColor: theme.inputBg, borderColor: theme.warning + '40' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={[styles.ruleIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                    <Ionicons name="time" size={18} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2, flexWrap: 'wrap', gap: 4 }}>
                      <Text style={[styles.ruleHeaderTitle, { color: theme.text }]}>Lembrete de manutenção</Text>
                      <View style={[styles.ruleFrequencyBadge, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                        <Text style={[styles.ruleFrequencyText, { color: '#F59E0B' }]}>A cada 7 dias às 7h</Text>
                      </View>
                    </View>
                    <Text style={[styles.ruleMessageSample, { color: theme.text }]}>
                      Faltam [quantidade de km] km para [nome da manutenção]
                    </Text>
                    <Text style={[styles.ruleDetailText, { color: theme.textMuted }]}>
                      Disparado para serviços em estado de atenção preventiva (≤ 30% restante).
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* BOTÕES DE TESTE NA BANDEJA */}
            <View style={styles.testButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.testNotifyBtn,
                  { borderColor: theme.red + '60', backgroundColor: isDark ? '#1F1419' : '#FEF2F2' },
                ]}
                onPress={() => handleTestNotification('alerta')}
                disabled={testingNotification !== null}
                activeOpacity={0.7}
              >
                {testingNotification === 'alerta' ? (
                  <ActivityIndicator size="small" color={theme.red} />
                ) : (
                  <>
                    <Ionicons name="notifications-outline" size={15} color={theme.red} />
                    <Text style={[styles.testNotifyBtnText, { color: theme.red }]}>Testar Alerta (2s)</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.testNotifyBtn,
                  { borderColor: theme.warning + '60', backgroundColor: isDark ? '#1F1A12' : '#FFFBEB' },
                ]}
                onPress={() => handleTestNotification('atencao')}
                disabled={testingNotification !== null}
                activeOpacity={0.7}
              >
                {testingNotification === 'atencao' ? (
                  <ActivityIndicator size="small" color="#F59E0B" />
                ) : (
                  <>
                    <Ionicons name="paper-plane-outline" size={15} color="#F59E0B" />
                    <Text style={[styles.testNotifyBtnText, { color: '#F59E0B' }]}>Testar Lembrete (2s)</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* SEÇÃO 4: USO DE ARMAZENAMENTO E CACHE */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)' }]}>
                <Ionicons name="pie-chart-outline" size={18} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Armazenamento e Cache
                </Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                  Espaço em disco ocupado localmente no aparelho
                </Text>
              </View>
              {loadingCache && <ActivityIndicator size="small" color={theme.accent} />}
            </View>

            {/* BARRA DE PROGRESSO DO ARMAZENAMENTO */}
            <View style={styles.storageProgressContainer}>
              <View style={styles.storageProgressHeader}>
                <Text style={[styles.storageProgressLabel, { color: theme.text }]}>
                  Uso Total em Cache:
                </Text>
                <Text style={[styles.storageProgressValue, { color: theme.accent }]}>
                  {cacheStats?.formattedTotal || '0 KB'}
                  <Text style={[styles.storageProgressLimit, { color: theme.textMuted }]}>
                    {' '}/ {cacheStats?.formattedMax || '50 MB'} ({cacheStats?.usagePercent ?? 0}%)
                  </Text>
                </Text>
              </View>

              {/* BARRA VISUAL */}
              <View style={[styles.progressBarTrack, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.max(cacheStats?.usagePercent ?? 2, 2)}%`,
                      backgroundColor:
                        (cacheStats?.usagePercent ?? 0) > 85
                          ? theme.red
                          : (cacheStats?.usagePercent ?? 0) > 60
                          ? '#F59E0B'
                          : theme.accent,
                    },
                  ]}
                />
              </View>
            </View>

            {/* DETALHAMENTO DO CACHE POR CATEGORIA */}
            <View style={styles.breakdownList}>
              {cacheStats?.breakdown.map((item) => (
                <View key={item.id} style={[styles.breakdownItem, { borderColor: theme.cardBorder }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Ionicons name={item.icon as any} size={16} color={item.color} />
                    <Text style={[styles.breakdownLabel, { color: theme.text }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                  <Text style={[styles.breakdownSize, { color: theme.textMuted }]}>
                    {item.formatted}
                  </Text>
                </View>
              ))}
            </View>

            {/* BOTÃO LIMPAR CACHE */}
            <TouchableOpacity
              style={[
                styles.clearCacheBtn,
                {
                  borderColor: theme.cardBorder,
                  backgroundColor: isDark ? '#121826' : '#F8FAFC',
                },
              ]}
              onPress={handleClearCache}
              disabled={clearingCache}
              activeOpacity={0.7}
            >
              {clearingCache ? (
                <>
                  <ActivityIndicator size="small" color={theme.text} />
                  <Text style={[styles.clearCacheBtnText, { color: theme.text }]}>
                    Otimizando armazenamento...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="trash-bin-outline" size={17} color={theme.text} />
                  <Text style={[styles.clearCacheBtnText, { color: theme.text }]}>
                    Limpar Cache Temporário
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* SEÇÃO 5: ZONA DE PERIGO (EXCLUSÃO DE CONTA) */}
          <View
            style={[
              styles.sectionCard,
              styles.dangerSectionCard,
              {
                backgroundColor: isDark ? '#1C1215' : '#FEF2F2',
                borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FEE2E2',
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <View
                style={[
                  styles.sectionIconBadge,
                  { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
                ]}
              >
                <Ionicons name="alert-circle" size={18} color={theme.red} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: theme.red }]}>
                  Zona de Perigo
                </Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                  Exclusão definitiva de conta e dados
                </Text>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <Text style={[styles.dangerDescription, { color: isDark ? '#FCA5A5' : '#991B1B' }]}>
                A exclusão da conta é permanente e irreversível. Todos os seus veículos, históricos de abastecimento, registros de manutenção, fotos e preferências serão apagados definitivamente do aplicativo e de nossos servidores.
              </Text>

              <TouchableOpacity
                style={[styles.deleteAccountBtn, { backgroundColor: theme.red }]}
                onPress={handleOpenDeleteModal}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                <Text style={styles.deleteAccountBtnText}>Excluir Minha Conta e Dados</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* SEÇÃO 6: INFORMAÇÕES DO APP E LOGOUT */}
          <View style={styles.footerContainer}>
            <TouchableOpacity
              style={[styles.logoutBigBtn, { borderColor: theme.red + '55', backgroundColor: isDark ? '#1F1419' : '#FEF2F2' }]}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <Ionicons name="log-out-outline" size={18} color={theme.red} />
              <Text style={[styles.logoutBigBtnText, { color: theme.red }]}>
                Encerrar Sessão da Conta
              </Text>
            </TouchableOpacity>

            <Text style={[styles.appVersionText, { color: theme.textMuted }]}>
              ContaGiro • Versão 1.0.1
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingAccount) setDeleteModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.card,
                borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
              },
            ]}
          >
            {/* ÍCONE DE ALERTA */}
            <View style={[styles.modalDangerIconBadge, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <Ionicons name="warning" size={32} color={theme.red} />
            </View>

            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Excluir Conta Definitivamente?
            </Text>

            <Text style={[styles.modalWarningText, { color: theme.textMuted }]}>
              Esta ação <Text style={{ fontWeight: '800', color: theme.red }}>não poderá ser desfeita</Text>. Todos os seus veículos cadastrados, abastecimentos e manutenções serão apagados permanentemente.
            </Text>

            {isGoogleUser && !isPasswordUser ? (
              <View style={styles.modalInputSection}>
                <Text style={[styles.modalInputLabel, { color: theme.text }]}>
                  Digite <Text style={{ fontWeight: '800', color: theme.red }}>EXCLUIR</Text> para confirmar:
                </Text>
                <View
                  style={[
                    styles.modalInputWrapper,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: deleteError ? theme.red : theme.cardBorder,
                    },
                  ]}
                >
                  <Ionicons name="shield-outline" size={20} color={theme.textMuted} style={{ marginRight: 10 }} />
                  <TextInput
                    style={[styles.modalInput, { color: theme.text }]}
                    placeholder="EXCLUIR"
                    placeholderTextColor={theme.textMuted}
                    value={deletePassword}
                    onChangeText={(val) => {
                      setDeletePassword(val);
                      if (deleteError) setDeleteError(null);
                    }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!deletingAccount}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.modalInputSection}>
                <Text style={[styles.modalInputLabel, { color: theme.text }]}>
                  Digite sua senha para confirmar a exclusão:
                </Text>
                <View
                  style={[
                    styles.modalInputWrapper,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: deleteError ? theme.red : theme.cardBorder,
                    },
                  ]}
                >
                  <Ionicons name="lock-closed-outline" size={20} color={theme.textMuted} style={{ marginRight: 10 }} />
                  <TextInput
                    style={[styles.modalInput, { color: theme.text }]}
                    placeholder="Sua senha atual"
                    placeholderTextColor={theme.textMuted}
                    value={deletePassword}
                    onChangeText={(val) => {
                      setDeletePassword(val);
                      if (deleteError) setDeleteError(null);
                    }}
                    secureTextEntry={!showDeletePassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!deletingAccount}
                  />
                  <TouchableOpacity
                    onPress={() => setShowDeletePassword(!showDeletePassword)}
                    style={styles.modalEyeBtn}
                    disabled={deletingAccount}
                  >
                    <Ionicons
                      name={showDeletePassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={theme.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {deleteError && (
              <View style={styles.modalErrorRow}>
                <Ionicons name="alert-circle" size={16} color={theme.red} />
                <Text style={[styles.modalErrorText, { color: theme.red }]}>{deleteError}</Text>
              </View>
            )}

            {/* BOTÕES DE AÇÃO */}
            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: theme.cardBorder }]}
                onPress={() => setDeleteModalVisible(false)}
                disabled={deletingAccount}
              >
                <Text style={[styles.modalCancelBtnText, { color: theme.text }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirmDeleteBtn,
                  { backgroundColor: theme.red, opacity: deletingAccount ? 0.7 : 1 },
                ]}
                onPress={handleConfirmDelete}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="trash" size={16} color="#FFFFFF" />
                    <Text style={styles.modalConfirmDeleteBtnText}>Excluir Tudo</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 36,
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  sectionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 6,
  },
  avatarWrapper: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  avatarImage: {
    width: 68,
    height: 68,
    borderRadius: 22,
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  actionOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionOutlineBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  nameInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  saveNameBtn: {
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveNameBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  readOnlyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  readOnlyText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  providerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  providerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  googleNoticeBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  googleNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  googleNoticeDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  resetLinkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  eyeBtn: {
    padding: 8,
  },
  savePasswordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  savePasswordBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  themeOptionsGrid: {
    gap: 10,
  },
  themeOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
  },
  themeOptionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeOptionName: {
    fontSize: 14,
    fontWeight: '700',
  },
  themeOptionDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  // NOTIFICAÇÕES
  notificationRulesContainer: {
    gap: 10,
    marginTop: 8,
  },
  notificationRuleCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  ruleIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ruleHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  ruleFrequencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  ruleFrequencyText: {
    fontSize: 11,
    fontWeight: '800',
  },
  ruleMessageSample: {
    fontSize: 12,
    fontWeight: '700',
    marginVertical: 4,
  },
  ruleDetailText: {
    fontSize: 11,
    lineHeight: 15,
  },
  testButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  testNotifyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  testNotifyBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  storageProgressContainer: {
    gap: 8,
  },
  storageProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storageProgressLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  storageProgressValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  storageProgressLimit: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressBarTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  breakdownList: {
    gap: 6,
    marginTop: 4,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  breakdownLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  breakdownSize: {
    fontSize: 12,
    fontWeight: '700',
  },
  clearCacheBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  clearCacheBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  footerContainer: {
    gap: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutBigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  logoutBigBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  appVersionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // ZONA DE PERIGO
  dangerSectionCard: {
    borderWidth: 1.5,
  },
  dangerDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 4,
  },
  deleteAccountBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  // MODAL DE EXCLUSÃO
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  modalDangerIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalWarningText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 18,
  },
  modalInputSection: {
    width: '100%',
    marginBottom: 12,
  },
  modalInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  modalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  modalInput: {
    flex: 1,
    fontSize: 14,
  },
  modalEyeBtn: {
    padding: 4,
  },
  modalErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    marginBottom: 12,
  },
  modalErrorText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 6,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalConfirmDeleteBtn: {
    flex: 1.2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmDeleteBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
