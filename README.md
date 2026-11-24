# 🛡️ RZ Varredura & Limpeza (Android Security & Storage Suite)

Aplicativo móvel desenvolvido em **React Native + Expo SDK 58 (TypeScript)** integrado a um **módulo nativo próprio em Kotlin (`android-scanner`)**, projetado para **diagnóstico de hardware, auditoria de segurança de aplicativos instalados, detecção de sideloading/permissões críticas, limpeza de arquivos residuais e gerenciamento de diretórios no Android** (homologado no **TCL 60 SE / Android 15**).

---

## ✨ Funcionalidades Implementadas (v1.1.0)

### 1. Dashboard Inicial & Saúde do Dispositivo
- **Medidor Visual de Saúde (0% a 100%):** Cálculo dinâmico baseado na presença de aplicativos de risco alto/médio, instalações fora da Play Store e acúmulo de arquivos residuais.
- **Monitoramento de Hardware em Tempo Real (`StatFs` & `ActivityManager`):** Leitura nativa do armazenamento interno (total, usado e livre) e da memória RAM disponível no dispositivo.
- **Compatibilidade Edge-to-Edge (Android 15):** Layout responsivo utilizando `react-native-safe-area-context` (`useSafeAreaInsets`), respeitando entalhes de câmera, barra de status e gestos de navegação.
- **Gerenciamento de Permissões Modernas:** Verificação automática e atalho direto para concessão de *Acesso a Todos os Arquivos* (`MANAGE_EXTERNAL_STORAGE`) no Android 11+.

### 2. Motor de Varredura & Auditoria de Segurança (Kotlin Nativo)
- **Varredura Completa em 4 Etapas:** Inspeção automatizada com feedback de progresso em tempo real.
- **Auditoria de Pacotes (`PackageManager`):** Listagem de todos os aplicativos de usuário instalados no dispositivo, filtrando pacotes puros do sistema.
- **Detecção de Sideloading:** Identifica a origem de instalação (`getInstallSourceInfo`), alertando sobre aplicativos instalados fora da Google Play Store ou lojas oficiais.
- **Análise Heurística de Permissões Críticas:** Pontuação de risco (`SEGURO`, `MEDIO`, `ALTO`) baseada na solicitação de permissões sensíveis (`READ_SMS`, `RECEIVE_SMS`, `SYSTEM_ALERT_WINDOW`, `REQUEST_INSTALL_PACKAGES`, `BIND_ACCESSIBILITY_SERVICE`, `BIND_DEVICE_ADMIN`, gravação de áudio e localização precisa).
- **Inspeção e Desinstalação Segura:** Atalho direto para a tela oficial de configurações do pacote no Android (`ACTION_APPLICATION_DETAILS_SETTINGS`).

### 3. Limpeza Inteligente & Integridade SHA-256
- **Rastreamento Multi-Diretório:** Varredura nas pastas `Download`, `Documents`, `Pictures`, `Movies` e `DCIM` em busca de:
  - Instaladores residuais (`.apk`, `.xapk`, `.apks`).
  - Arquivos temporários e logs (`.tmp`, `.log`, `.bak`, `.cache`).
  - Mídias e arquivos pesados (`> 30 MB`).
- **Cálculo de Hash Criptográfico (`SHA-256`):** Geração automática de assinatura SHA-256 para todos os arquivos `.apk` encontrados, preparando o motor para validação de reputação de malware.
- **Limpeza Individual ou em Lote:** Exclusão segura item por item ou limpeza completa com atualização imediata do espaço livre.

### 4. Explorador Nativo de Arquivos
- **Navegação de Diretórios:** Listagem de pastas e arquivos internos com contagem de itens, tamanho formatado, data de modificação e exclusão direta.

---

## 🛠️ Arquitetura & Stack Tecnológica

- **Frontend:** React Native + Expo SDK 58 (TypeScript)
- **Responsividade & UI:** `react-native-safe-area-context` (suporte nativo Edge-to-Edge no Android 15)
- **Camada Nativa:** Expo Modules API (`modules/android-scanner`) escrita em **Kotlin**
- **Build & Distribuição:** EAS Build (`preview` em `.apk` para testes diretos e `production` em `.aab` para Google Play Console)

---

## 📂 Estrutura do Projeto

```text
android-varredura-apk/
├── App.tsx                                      # Interface principal (Início, Relatório, Limpeza e Arquivos)
├── app.json                                     # Configurações Expo, pacote Android e permissões
├── eas.json                                     # Perfis de build (APK preview e AAB production)
├── modules/
│   └── android-scanner/                         # Módulo nativo local (Expo Autolinking)
│       ├── expo-module.config.json
│       ├── index.ts                             # Tipagens TypeScript e bridge nativa
│       └── android/
│           ├── build.gradle
│           └── src/main/java/expo/modules/androidscanner/
│               └── AndroidScannerModule.kt      # Lógica nativa Android (PackageManager, StatFs, SHA-256)
└── assets/                                      # Ícones adaptativos e splash screen