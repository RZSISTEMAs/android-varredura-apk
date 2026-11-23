import { requireNativeModule } from 'expo-modules-core';

export interface StorageInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  deviceModel: string;
  androidVersion: string;
  sdkInt: number;
}

export interface ScannedApp {
  appName: string;
  packageName: string;
  versionName: string;
  installer: string;
  isSideloaded: boolean;
  riskScore: number;
  riskLevel: 'SEGURO' | 'MEDIO' | 'ALTO';
  riskReasons: string[];
  dangerousPermissions: string[];
  apkSize: number;
}

export interface JunkFile {
  name: string;
  path: string;
  size: number;
  category: 'APK_RESIDUAL' | 'TEMPORARIO' | 'ARQUIVO_GRANDE';
  sha256: string;
}

interface AndroidScannerNativeModule {
  getStorageInfo(): Promise<StorageInfo>;
  scanInstalledApps(): Promise<ScannedApp[]>;
  scanJunkFiles(): Promise<JunkFile[]>;
  deleteFile(filePath: string): Promise<boolean>;
  openAppSettings(packageName: string): void;
}

const AndroidScanner = requireNativeModule<AndroidScannerNativeModule>('AndroidScanner');

export default AndroidScanner;
