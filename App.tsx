import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AndroidScanner, {
  JunkFile,
  ScannedApp,
  StorageInfo,
} from './modules/android-scanner';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function App() {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [apps, setApps] = useState<ScannedApp[]>([]);
  const [junkFiles, setJunkFiles] = useState<JunkFile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<'APPS' | 'CLEANER'>('APPS');

  useEffect(() => {
    loadStorage();
  }, []);

  async function loadStorage() {
    if (Platform.OS !== 'android') return;
    try {
      const info = await AndroidScanner.getStorageInfo();
      setStorage(info);
    } catch (e) {
      console.warn('Erro ao ler armazenamento:', e);
    }
  }

  async function requestStoragePermissions() {
    if (Platform.OS !== 'android') return;
    if (Platform.Version < 33) {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ]);
    }
  }

  async function runFullScan() {
    if (Platform.OS !== 'android') {
      Alert.alert('Aviso', 'A varredura nativa funciona apenas em dispositivos Android.');
      return;
    }

    setScanning(true);
    setScanCompleted(false);

    try {
      await requestStoragePermissions();
      const [storageData, scannedApps, foundJunk] = await Promise.all([
        AndroidScanner.getStorageInfo(),
        AndroidScanner.scanInstalledApps(),
        AndroidScanner.scanJunkFiles(),
      ]);

      setStorage(storageData);
      setApps(scannedApps);
      setJunkFiles(foundJunk);
      setScanCompleted(true);
    } catch (error: any) {
      Alert.alert('Erro na varredura', error?.message || 'Falha ao executar diagnóstico.');
    } finally {
      setScanning(false);
    }
  }

  async function handleDeleteJunk(file: JunkFile) {
    Alert.alert(
      'Remover arquivo',
      `Deseja apagar permanentemente "${file.name}" (${formatBytes(file.size)})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            const deleted = await AndroidScanner.deleteFile(file.path);
            if (deleted) {
              setJunkFiles((prev) => prev.filter((item) => item.path !== file.path));
              loadStorage();
            } else {
              Alert.alert(
                'Permissão necessária',
                'O Android bloqueou a exclusão direta deste arquivo. Remova-o pelo gerenciador de arquivos do sistema.'
              );
            }
          },
        },
      ]
    );
  }

  const highRiskCount = apps.filter((a) => a.riskLevel === 'ALTO').length;
  const mediumRiskCount = apps.filter((a) => a.riskLevel === 'MEDIO').length;
  const totalJunkBytes = junkFiles.reduce((acc, item) => acc + item.size, 0);
  const usedPercent = storage
    ? Math.min(100, Math.round((storage.usedBytes / storage.totalBytes) * 100))
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1120" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.brand}>RZ SISTEMAS • SECURITY</Text>
          <Text style={styles.title}>Varredura & Limpeza</Text>
          {storage && (
            <Text style={styles.subtitle}>
              {storage.deviceModel} • Android {storage.androidVersion} (API {storage.sdkInt})
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Armazenamento Interno</Text>
            <Text style={styles.percentText}>{usedPercent}% usado</Text>
          </View>

          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${usedPercent}%` }]} />
          </View>

          {storage && (
            <View style={styles.rowBetween}>
              <Text style={styles.metaText}>Livre: {formatBytes(storage.freeBytes)}</Text>
              <Text style={styles.metaText}>Total: {formatBytes(storage.totalBytes)}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
          onPress={runFullScan}
          disabled={scanning}
        >
          {scanning ? (
            <View style={styles.rowCenter}>
              <ActivityIndicator color="#0B1120" style={{ marginRight: 10 }} />
              <Text style={styles.scanButtonText}>Analisando sistema e pacotes...</Text>
            </View>
          ) : (
            <Text style={styles.scanButtonText}>
              {scanCompleted ? 'Executar Nova Varredura' : 'Iniciar Varredura Completa'}
            </Text>
          )}
        </TouchableOpacity>

        {scanCompleted && (
          <>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{apps.length}</Text>
                <Text style={styles.statLabel}>Apps Auditados</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: highRiskCount > 0 ? '#EF4444' : '#10B981' }]}>
                  {highRiskCount + mediumRiskCount}
                </Text>
                <Text style={styles.statLabel}>Alertas de Risco</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: '#38BDF8' }]}>
                  {formatBytes(totalJunkBytes)}
                </Text>
                <Text style={styles.statLabel}>Lixo / APKs</Text>
              </View>
            </View>

            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'APPS' && styles.tabButtonActive]}
                onPress={() => setActiveTab('APPS')}
              >
                <Text style={[styles.tabText, activeTab === 'APPS' && styles.tabTextActive]}>
                  Segurança ({apps.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'CLEANER' && styles.tabButtonActive]}
                onPress={() => setActiveTab('CLEANER')}
              >
                <Text style={[styles.tabText, activeTab === 'CLEANER' && styles.tabTextActive]}>
                  Limpeza ({junkFiles.length})
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'APPS' &&
              apps.map((app) => {
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
                        <Text style={styles.itemSub}>{app.packageName}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: `${badgeColor}22`, borderColor: badgeColor }]}>
                        <Text style={[styles.badgeText, { color: badgeColor }]}>{app.riskLevel}</Text>
                      </View>
                    </View>

                    <Text style={styles.metaTextSmall}>
                      Origem: {app.isSideloaded ? 'Fora da Play Store' : 'Loja Oficial'} • Tamanho:{' '}
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

                    {app.riskLevel !== 'SEGURO' && (
                      <TouchableOpacity
                        style={styles.actionOutlineBtn}
                        onPress={() => AndroidScanner.openAppSettings(app.packageName)}
                      >
                        <Text style={styles.actionOutlineText}>Inspecionar / Desinstalar no Android</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

            {activeTab === 'CLEANER' &&
              (junkFiles.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.emptyText}>
                    Nenhum APK residual ou arquivo temporário encontrado na pasta Downloads!
                  </Text>
                </View>
              ) : (
                junkFiles.map((file) => (
                  <View key={file.path} style={styles.itemCard}>
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.itemTitle}>{file.name}</Text>
                        <Text style={styles.itemSub}>
                          {file.category} • {formatBytes(file.size)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteJunk(file)}
                      >
                        <Text style={styles.deleteBtnText}>Limpar</Text>
                      </TouchableOpacity>
                    </View>
                    {file.sha256 ? (
                      <Text style={styles.hashText} numberOfLines={1}>
                        SHA-256: {file.sha256}
                      </Text>
                    ) : null}
                  </View>
                ))
              ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 20, marginTop: 10 },
  brand: { color: '#38BDF8', fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: '#F8FAFC', fontSize: 26, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#94A3B8', fontSize: 13, marginTop: 4 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '700' },
  percentText: { color: '#38BDF8', fontSize: 14, fontWeight: '700' },
  progressBarBg: {
    height: 10,
    backgroundColor: '#0F172A',
    borderRadius: 6,
    marginVertical: 12,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: '#38BDF8', borderRadius: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowCenter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  metaText: { color: '#94A3B8', fontSize: 12 },
  metaTextSmall: { color: '#CBD5E1', fontSize: 12, marginTop: 8 },
  scanButton: {
    backgroundColor: '#38BDF8',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  scanButtonDisabled: { opacity: 0.7 },
  scanButtonText: { color: '#0B1120', fontSize: 16, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statNumber: { color: '#F8FAFC', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#94A3B8', fontSize: 11, marginTop: 4 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  tabButtonActive: { backgroundColor: '#38BDF8' },
  tabText: { color: '#94A3B8', fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#0B1120' },
  itemCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  itemTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '700' },
  itemSub: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  reasonsBox: {
    marginTop: 8,
    backgroundColor: '#0F172A',
    padding: 10,
    borderRadius: 8,
  },
  reasonText: { color: '#FBBF24', fontSize: 12, marginBottom: 2 },
  actionOutlineBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  actionOutlineText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  deleteBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  hashText: { color: '#64748B', fontSize: 10, marginTop: 8, fontFamily: 'monospace' },
  emptyText: { color: '#94A3B8', textAlign: 'center', fontSize: 13 },
});