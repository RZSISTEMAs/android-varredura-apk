import { requireNativeModule } from 'expo-modules-core';

export interface StorageInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  totalRamBytes: number;
  freeRamBytes: number;
  deviceModel: string;
  androidVersion: string;
  sdkInt: number;
  hasAllFilesAccess: boolean;
  rootStoragePath: string;
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
  folder: string;
  size: number;
  lastModified: number;
  category: 'APK_RESIDUAL' | 'TEMPORARIO' | 'ARQUIVO_GRANDE' | 'MIDIA_PESADA';
  sha256: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  itemCount: number;
}

interface AndroidScannerNativeModule {
  getStorageInfo(): Promise<StorageInfo>;
  requestAllFilesAccess(): void;
  scanInstalledApps(): Promise<ScannedApp[]>;
  scanJunkFiles(): Promise<JunkFile[]>;
  listDirectory(dirPath?: string): Promise<DirectoryEntry[]>;
  deleteFile(filePath: string): Promise<boolean>;
  deleteMultipleFiles(filePaths: string[]): Promise<number>;
  openAppSettings(packageName: string): void;
}

const AndroidScanner = requireNativeModule<AndroidScannerNativeModule>('AndroidScanner');

export default AndroidScanner;