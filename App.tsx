import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import AndroidScanner, {
  DirectoryEntry,
  JunkFile,
  ScannedApp,
  StorageInfo,
} from './modules/android-scanner';

type ScreenTab = 'HOME' | 'REPORT' | 'CLEANER' | 'FILES';
type AppFilter = 'ALL' | 'RISK' | 'SIDELOAD';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleDateString('pt-BR');
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<ScreenTab>('HOME');
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [apps, setApps] = useState<ScannedApp[]>([]);
  const [junkFiles, setJunkFiles] = useState<JunkFile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [scanCompleted, setScanCompleted] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [appFilter, setAppFilter] = useState<AppFilter>('ALL');

  // Estado do Explorador de Arquivos
  const [currentPath, setCurrentPath] = useState<string>('');
  const [dirEntries, setDirEntries] = useState<DirectoryEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const loadSystemInfo = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const info = await AndroidScanner.getStorageInfo();
      setStorage(info);
      if (!currentPath && info.rootStoragePath) {
        setCurrentPath(info.rootStoragePath);
      }
    } catch (e) {
      console.warn('Erro ao ler sistema:', e);
    }
  }, [currentPath]);

  useEffect(() => {
    loadSystemInfo();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadSystemInfo();
      }
    });
    return () => sub.remove();
  }, [loadSystemInfo]);

  const loadDirectory = useCallback(async (targetPath?: string) => {
    if (Platform.OS !== 'android') return;
    setLoadingFiles(true);
    try {
      const list = await AndroidScanner.listDirectory(targetPath);
      setDirEntries(list);
      if (targetPath) setCurrentPath(targetPath);
    } catch (e) {
      console.warn('Erro ao listar pasta:', e);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'FILES') {
      loadDirectory(currentPath || storage?.rootStoragePath);
    }
  }, [activeTab, currentPath, storage?.rootStoragePath, loadDirectory]);

  async function requestPermissions() {
    if (Platform.OS !== 'android') return;
    if (Platform.Version < 33) {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ]);
    }
  }

  async function runFullScan(goToReport = false) {
    if (Platform.OS !== 'android') {
      Alert.alert('Aviso', 'A varredura nativa funciona apenas em dispositivos Android.');
      return;
    }

    setScanning(true);
    setScanCompleted(false);

    try {
      setScanStep('1/4 • Verificando permissões e armazenamento...');
      await requestPermissions();
      const storageData = await AndroidScanner.getStorageInfo();
      setStorage(storageData);

      setScanStep('2/4 • Auditando pacotes e assinaturas instaladas...');
      const scannedApps = await AndroidScanner.scanInstalledApps();
      setApps(scannedApps);

      setScanStep('3/4 • Rastreando APKs residuais e arquivos pesados...');
      const foundJunk = await AndroidScanner.scanJunkFiles();
      setJunkFiles(foundJunk);

      setScanStep('4/4 • Finalizando relatório de diagnóstico...');
      const now = new Date();
      setLastScanTime(
        `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      );
      setScanCompleted(true);

      if (goToReport) {
        setActiveTab('REPORT');
      }
    } catch (error: any) {
      Alert.alert('Erro na varredura', error?.message || 'Falha ao executar diagnóstico.');
    } finally {
      setScanning(false);
      setScanStep('');
    }
  }

  async function handleDeleteSingleJunk(file: JunkFile) {
    Alert.alert(
      'Confirmar limpeza',
      `Deseja remover "${file.name}" (${formatBytes(file.size)})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            const ok = await AndroidScanner.deleteFile(file.path);
            if (ok) {
              setJunkFiles((prev) => prev.filter((item) => item.path !== file.path));
              loadSystemInfo();
            } else {
              Alert.alert(
                'Acesso restrito',
                'Ative a permissão "Acesso a todos os arquivos" na tela inicial para apagar arquivos fora da pasta do app.'
              );
            }
          },
        },
      ]
    );
  }

  async function handleCleanAllJunk() {
    if (junkFiles.length === 0) return;
    Alert.alert(
      'Limpeza Completa',
      `Deseja apagar todos os ${junkFiles.length} itens encontrados (${formatBytes(totalJunkBytes)})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar Tudo',
          style: 'destructive',
          onPress: async () => {
            const paths = junkFiles.map((f) => f.path);
            const removed = await AndroidScanner.deleteMultipleFiles(paths);
            const updatedJunk = await AndroidScanner.scanJunkFiles();
            setJunkFiles(updatedJunk);
            loadSystemInfo();
            Alert.alert('Limpeza concluída', `${removed} arquivo(s) removido(s) com sucesso.`);
          },
        },
      ]
    );
  }

  async function handleDeleteExplorerFile(entry: DirectoryEntry) {
    Alert.alert(
      'Excluir arquivo',
      `Deseja apagar "${entry.name}" (${formatBytes(entry.size)}) permanentemente?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const ok = await AndroidScanner.deleteFile(entry.path);
            if (ok) {
              loadDirectory(currentPath);
              loadSystemInfo();
            } else {
              Alert.alert(
                'Não foi possível excluir',
                'Verifique se a permissão "Acesso a todos os arquivos" está ativada na tela inicial.'
              );
            }
          },
        },
      ]
    );
  }

  function handleNavigateUp() {
    const root = storage?.rootStoragePath || '/storage/emulated/0';
    if (!currentPath || currentPath === root) return;
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/'));
    loadDirectory(parent.length >= root.length ? parent : root);
  }

  const highRiskCount = apps.filter((a) => a.riskLevel === 'ALTO').length;
  const mediumRiskCount = apps.filter((a) => a.riskLevel === 'MEDIO').length;
  const sideloadCount = apps.filter((a) => a.isSideloaded).length;
  const totalJunkBytes = junkFiles.reduce((acc, item) => acc + item.size, 0);

  const usedStoragePercent = storage
    ? Math.min(100, Math.round((storage.usedBytes / storage.totalBytes) * 100))
    : 0;

  const usedRamPercent =
    storage && storage.totalRamBytes > 0
      ? Math.min(
          100,
          Math.round(((storage.totalRamBytes - storage.freeRamBytes) / storage.totalRamBytes) * 100)
        )
      : 0;

  const healthScore = !scanCompleted
    ? 92
    : Math.max(25, 100 - highRiskCount * 18 - mediumRiskCount * 7 - (junkFiles.length > 5 ? 8 : 0));

  const healthColor =
    healthScore >= 80 ? '#10B981' : healthScore >= 55 ? '#F59E0B' : '#EF4444';

  const healthLabel = !scanCompleted
    ? 'Pronto para Varredura'
    : healthScore >= 80
    ? 'Sistema Protegido'
    : healthScore >= 55
    ? 'Atenção Recomendada'
    : 'Riscos Detectados';

  const filteredApps = apps.filter((app) => {
    if (appFilter === 'RISK') return app.riskLevel !== 'SEGURO';
    if (appFilter === 'SIDELOAD') return app.isSideloaded;
    return true;
  });

  // Garante espaçamento seguro mesmo antes do inset carregar
  const topInset = Math.max(insets.top, StatusBar.currentHeight || 24);
  const bottomInset = Math.max(insets.bottom, 12);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#060B19" translucent />

      {/* Top Bar com paddingTop dinâmico respeitando hora, Wi-Fi e câmera */}
      <View style={[styles.topBar, { paddingTop: topInset + 10 }]}>
        <View>
          <Text style={styles.brandTag}>RZ SISTEMAS • SECURITY SUITE</Text>
          <Text style={styles.topTitle}>RZ Varredura</Text>
        </View>
        {storage && (
          <View style={styles.devicePill}>
            <Text style={styles.devicePillText}>Android {storage.androidVersion}</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomInset + 82 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ==================== TELA 1: INÍCIO ==================== */}
        {activeTab === 'HOME' && (
          <>
            {storage && !storage.hasAllFilesAccess && (
              <TouchableOpacity
                style={styles.permissionBanner}
                onPress={() => AndroidScanner.requestAllFilesAccess()}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.permissionTitle}>Ativar Leitura Completa de Arquivos</Text>
                  <Text style={styles.permissionDesc}>
                    Toque aqui para liberar o acesso às pastas do Android {storage.androidVersion} e permitir limpeza profunda.
                  </Text>
                </View>
                <View style={styles.permissionBtn}>
                  <Text style={styles.permissionBtnText}>Ativar</Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.heroCard}>
              <View style={[styles.scoreRing, { borderColor: healthColor }]}>
                <Text style={[styles.scoreValue, { color: healthColor }]}>{healthScore}%</Text>
                <Text style={styles.scoreSub}>SAÚDE</Text>
              </View>

              <Text style={[styles.healthStatus, { color: healthColor }]}>{healthLabel}</Text>
              <Text style={styles.deviceSubtitle}>
                {storage ? storage.deviceModel : 'Carregando hardware...'}
              </Text>
              {lastScanTime && (
                <Text style={styles.lastScanText}>Última varredura: {lastScanTime}</Text>
              )}

              <TouchableOpacity
                style={[styles.primaryCta, scanning && { opacity: 0.75 }]}
                onPress={() => runFullScan(false)}
                disabled={scanning}
              >
                {scanning ? (
                  <View style={styles.rowCenter}>
                    <ActivityIndicator color="#060B19" style={{ marginRight: 10 }} />
                    <Text style={styles.primaryCtaText}>Varrendo Sistema...</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryCtaText}>
                    {scanCompleted ? 'Executar Nova Varredura' : 'Iniciar Varredura Completa'}
                  </Text>
                )}
              </TouchableOpacity>

              {scanning && scanStep ? <Text style={styles.stepIndicator}>{scanStep}</Text> : null}

              {scanCompleted && !scanning && (
                <TouchableOpacity
                  style={styles.secondaryCta}
                  onPress={() => setActiveTab('REPORT')}
                >
                  <Text style={styles.secondaryCtaText}>
                    Ver Relatório Completo ({apps.length} apps • {junkFiles.length} arquivos)
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {storage && (
              <View style={styles.metricsRow}>
                <View style={styles.metricCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.metricLabel}>Armazenamento</Text>
                    <Text style={styles.metricPercent}>{usedStoragePercent}%</Text>
                  </View>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${usedStoragePercent}%` }]} />
                  </View>
                  <Text style={styles.metricDetail}>
                    {formatBytes(storage.freeBytes)} livres de {formatBytes(storage.totalBytes)}
                  </Text>
                </View>

                <View style={styles.metricCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.metricLabel}>Memória RAM</Text>
                    <Text style={[styles.metricPercent, { color: '#A78BFA' }]}>
                      {usedRamPercent}%
                    </Text>
                  </View>
                  <View style={styles.barBg}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${usedRamPercent}%`, backgroundColor: '#A78BFA' },
                      ]}
                    />
                  </View>
                  <Text style={styles.metricDetail}>
                    {formatBytes(storage.freeRamBytes)} livres de {formatBytes(storage.totalRamBytes)}
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.sectionHeading}>Ferramentas do Sistema</Text>
            <View style={styles.toolsGrid}>
              <TouchableOpacity style={styles.toolCard} onPress={() => setActiveTab('REPORT')}>
                <Text style={styles.toolTitle}>Auditoria de Apps</Text>
                <Text style={styles.toolDesc}>
                  {scanCompleted
                    ? `${highRiskCount + mediumRiskCount} alerta(s) em ${apps.length} apps`
                    : 'Permissões e sideloading'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolCard} onPress={() => setActiveTab('CLEANER')}>
                <Text style={styles.toolTitle}>Limpeza Inteligente</Text>
                <Text style={styles.toolDesc}>
                  {scanCompleted
                    ? `${formatBytes(totalJunkBytes)} prontos para limpar`
                    : 'APKs e arquivos residuais'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolCard} onPress={() => setActiveTab('FILES')}>
                <Text style={styles.toolTitle}>Explorar Arquivos</Text>
                <Text style={styles.toolDesc}>Navegar pastas do celular</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolCard} onPress={() => runFullScan(true)}>
                <Text style={styles.toolTitle}>Diagnóstico Total</Text>
                <Text style={styles.toolDesc}>Varrer e abrir relatório</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ==================== TELA 2: RELATÓRIO COMPLETO & APPS ==================== */}
        {activeTab === 'REPORT' && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.pageTitle}>Relatório da Varredura</Text>
              <TouchableOpacity style={styles.miniRefreshBtn} onPress={() => runFullScan(false)}>
                <Text style={styles.miniRefreshText}>Reescanear</Text>
              </TouchableOpacity>
            </View>

            {!scanCompleted ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Nenhuma varredura executada ainda</Text>
                <Text style={styles.emptySub}>
                  Inicie a varredura completa para auditar todos os aplicativos, permissões e arquivos do aparelho.
                </Text>
                <TouchableOpacity style={styles.primaryCta} onPress={() => runFullScan(false)}>
                  <Text style={styles.primaryCtaText}>Iniciar Varredura Agora</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryVal}>{apps.length}</Text>
                    <Text style={styles.summaryLbl}>Apps</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryVal, { color: '#EF4444' }]}>{highRiskCount}</Text>
                    <Text style={styles.summaryLbl}>Risco Alto</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryVal, { color: '#F59E0B' }]}>{sideloadCount}</Text>
                    <Text style={styles.summaryLbl}>Fora da Loja</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryVal, { color: '#38BDF8' }]}>
                      {formatBytes(totalJunkBytes)}
                    </Text>
                    <Text style={styles.summaryLbl}>Limpeza</Text>
                  </View>
                </View>

                <View style={styles.filterRow}>
                  {(
                    [
                      { key: 'ALL', label: `Todos (${apps.length})` },
                      { key: 'RISK', label: `Alertas (${highRiskCount + mediumRiskCount})` },
                      { key: 'SIDELOAD', label: `Externos (${sideloadCount})` },
                    ] as { key: AppFilter; label: string }[]
                  ).map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.filterChip, appFilter === f.key && styles.filterChipActive]}
                      onPress={() => setAppFilter(f.key)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          appFilter === f.key && styles.filterChipTextActive,
                        ]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {filteredApps.map((app) => {
                  const badgeColor =
                    app.riskLevel === 'ALTO'
                      ? '#EF4444'
                      : app.riskLevel === 'MEDIO'
                      ? '#F59E0B'
                      : '#10B981';

                  return (
                    <View key={app.packageName} style={styles.itemCard}>
                      <View style={styles.rowBetween}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={styles.itemTitle}>{app.appName}</Text>
                          <Text style={styles.itemSub}>
                            {app.packageName} • v{app.versionName}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: `${badgeColor}20`, borderColor: badgeColor },
                          ]}
                        >
                          <Text style={[styles.badgeText, { color: badgeColor }]}>
                            {app.riskLevel} ({app.riskScore})
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.metaTextSmall}>
                        Origem: {app.isSideloaded ? 'Fora da Play Store' : 'Play Store / Oficial'} •{' '}
                        {formatBytes(app.apkSize)}
                      </Text>

                      {app.riskReasons.length > 0 && (
                        <View style={styles.reasonsBox}>
                          {app.riskReasons.map((reason, idx) => (
                            <Text key={idx} style={styles.reasonText}>
                              • {reason}
                            </Text>
                          ))}
                        </View>
                      )}

                      {app.dangerousPermissions.length > 0 && (
                        <Text style={styles.permsList}>
                          Permissões: {app.dangerousPermissions.join(', ')}
                        </Text>
                      )}

                      <TouchableOpacity
                        style={styles.outlineBtn}
                        onPress={() => AndroidScanner.openAppSettings(app.packageName)}
                      >
                        <Text style={styles.outlineBtnText}>Abrir Configurações / Desinstalar</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ==================== TELA 3: LIMPEZA DE ARQUIVOS ==================== */}
        {activeTab === 'CLEANER' && (
          <>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.pageTitle}>Limpeza de Arquivos</Text>
                <Text style={styles.pageSub}>
                  Espaço recuperável: {formatBytes(totalJunkBytes)}
                </Text>
              </View>
              {junkFiles.length > 0 && (
                <TouchableOpacity style={styles.cleanAllBtn} onPress={handleCleanAllJunk}>
                  <Text style={styles.cleanAllText}>Limpar Tudo</Text>
                </TouchableOpacity>
              )}
            </View>

            {!scanCompleted ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Escaneie para localizar arquivos</Text>
                <Text style={styles.emptySub}>
                  Procuramos APKs esquecidos, arquivos temporários e vídeos/arquivos pesados nas pastas do sistema.
                </Text>
                <TouchableOpacity style={styles.primaryCta} onPress={() => runFullScan(false)}>
                  <Text style={styles.primaryCtaText}>Buscar Arquivos para Limpar</Text>
                </TouchableOpacity>
              </View>
            ) : junkFiles.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Tudo limpo por aqui!</Text>
                <Text style={styles.emptySub}>
                  Nenhum APK residual, arquivo temporário ou arquivo pesado desnecessário encontrado.
                </Text>
              </View>
            ) : (
              junkFiles.map((file) => (
                <View key={file.path} style={styles.itemCard}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={styles.itemTitle}>{file.name}</Text>
                      <Text style={styles.itemSub}>
                        {file.category} • Pasta: {file.folder} • {formatBytes(file.size)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteSingleJunk(file)}
                    >
                      <Text style={styles.deleteBtnText}>Apagar</Text>
                    </TouchableOpacity>
                  </View>
                  {file.sha256 ? (
                    <Text style={styles.hashText} numberOfLines={1}>
                      SHA-256: {file.sha256}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </>
        )}

        {/* ==================== TELA 4: EXPLORADOR DE ARQUIVOS ==================== */}
        {activeTab === 'FILES' && (
          <>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.pageTitle}>Gerenciador de Arquivos</Text>
                <Text style={styles.pathText} numberOfLines={1}>
                  {currentPath || '/storage/emulated/0'}
                </Text>
              </View>
              <TouchableOpacity style={styles.miniRefreshBtn} onPress={handleNavigateUp}>
                <Text style={styles.miniRefreshText}>↑ Voltar Pasta</Text>
              </TouchableOpacity>
            </View>

            {storage && !storage.hasAllFilesAccess && (
              <TouchableOpacity
                style={styles.permissionBanner}
                onPress={() => AndroidScanner.requestAllFilesAccess()}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.permissionTitle}>Acesso restrito pelo Android</Text>
                  <Text style={styles.permissionDesc}>
                    Toque para liberar a leitura de todas as pastas e arquivos internos.
                  </Text>
                </View>
                <View style={styles.permissionBtn}>
                  <Text style={styles.permissionBtnText}>Liberar</Text>
                </View>
              </TouchableOpacity>
            )}

            {loadingFiles ? (
              <ActivityIndicator color="#38BDF8" size="large" style={{ marginTop: 30 }} />
            ) : dirEntries.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Pasta vazia ou sem permissão</Text>
                <Text style={styles.emptySub}>
                  Nenhum arquivo visível neste diretório.
                </Text>
              </View>
            ) : (
              dirEntries.map((entry) => (
                <TouchableOpacity
                  key={entry.path}
                  style={styles.fileRowCard}
                  activeOpacity={entry.isDirectory ? 0.7 : 1}
                  onPress={() => {
                    if (entry.isDirectory) {
                      loadDirectory(entry.path);
                    }
                  }}
                >
                  <View style={styles.fileIconBox}>
                    <Text style={styles.fileIconText}>{entry.isDirectory ? 'DIR' : 'ARQ'}</Text>
                  </View>

                  <View style={{ flex: 1, paddingHorizontal: 10 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {entry.name}
                    </Text>
                    <Text style={styles.itemSub}>
                      {entry.isDirectory
                        ? `${entry.itemCount} item(ns)`
                        : `${formatBytes(entry.size)} • ${formatDate(entry.lastModified)}`}
                    </Text>
                  </View>

                  {!entry.isDirectory && (
                    <TouchableOpacity
                      style={styles.smallDeleteBtn}
                      onPress={() => handleDeleteExplorerFile(entry)}
                    >
                      <Text style={styles.deleteBtnText}>Excluir</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Barra de Navegação Inferior respeitando os botões/gestos do Android */}
      <View style={[styles.bottomNav, { paddingBottom: bottomInset }]}>
        {(
          [
            { id: 'HOME', label: 'Início' },
            { id: 'REPORT', label: 'Relatório' },
            { id: 'CLEANER', label: 'Limpeza' },
            { id: 'FILES', label: 'Arquivos' },
          ] as { id: ScreenTab; label: string }[]
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060B19' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#060B19',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  brandTag: { color: '#38BDF8', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  topTitle: { color: '#F8FAFC', fontSize: 22, fontWeight: '800' },
  devicePill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  devicePillText: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },
  scrollContent: { padding: 18 },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B4B',
    borderColor: '#6366F1',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  permissionTitle: { color: '#E0E7FF', fontSize: 13, fontWeight: '800' },
  permissionDesc: { color: '#A5B4FC', fontSize: 11, marginTop: 2 },
  permissionBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  permissionBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  scoreRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#060B19',
    marginBottom: 12,
  },
  scoreValue: { fontSize: 28, fontWeight: '900' },
  scoreSub: { color: '#94A3B8', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  healthStatus: { fontSize: 18, fontWeight: '800' },
  deviceSubtitle: { color: '#CBD5E1', fontSize: 13, marginTop: 4 },
  lastScanText: { color: '#64748B', fontSize: 11, marginTop: 4 },
  primaryCta: {
    backgroundColor: '#38BDF8',
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryCtaText: { color: '#060B19', fontSize: 15, fontWeight: '900' },
  stepIndicator: { color: '#38BDF8', fontSize: 12, marginTop: 10, fontWeight: '600' },
  secondaryCta: {
    marginTop: 10,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    backgroundColor: '#1E293B',
  },
  secondaryCtaText: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  metricCard: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metricLabel: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  metricPercent: { color: '#38BDF8', fontSize: 12, fontWeight: '800' },
  barBg: {
    height: 7,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    marginVertical: 8,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: '#38BDF8', borderRadius: 4 },
  metricDetail: { color: '#94A3B8', fontSize: 10 },
  sectionHeading: { color: '#F8FAFC', fontSize: 15, fontWeight: '800', marginBottom: 10 },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  toolCard: {
    width: '48.3%',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  toolTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  toolDesc: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  pageTitle: { color: '#F8FAFC', fontSize: 19, fontWeight: '800' },
  pageSub: { color: '#38BDF8', fontSize: 12, fontWeight: '700', marginTop: 2 },
  pathText: { color: '#94A3B8', fontSize: 11, marginTop: 2, fontFamily: 'monospace' },
  miniRefreshBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  miniRefreshText: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },
  cleanAllBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  cleanAllText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { color: '#F8FAFC', fontSize: 16, fontWeight: '900' },
  summaryLbl: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
  filterChipText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: '#060B19' },
  itemCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  itemTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  itemSub: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  metaTextSmall: { color: '#CBD5E1', fontSize: 11, marginTop: 8 },
  reasonsBox: {
    marginTop: 8,
    backgroundColor: '#1E293B',
    padding: 10,
    borderRadius: 8,
  },
  reasonText: { color: '#FBBF24', fontSize: 11, marginBottom: 2 },
  permsList: { color: '#94A3B8', fontSize: 10, marginTop: 6 },
  outlineBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#1E293B',
  },
  outlineBtnText: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  deleteBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  smallDeleteBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deleteBtnText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  hashText: { color: '#64748B', fontSize: 10, marginTop: 8, fontFamily: 'monospace' },
  emptyCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  emptyTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptySub: { color: '#94A3B8', fontSize: 12, textAlign: 'center', marginTop: 6 },
  fileRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  fileIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileIconText: { color: '#38BDF8', fontSize: 10, fontWeight: '900' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowCenter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  navItemActive: { backgroundColor: '#1E293B' },
  navLabel: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  navLabelActive: { color: '#38BDF8' },
});