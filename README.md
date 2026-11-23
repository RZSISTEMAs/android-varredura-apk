# 🛡️ Android Varredura & Limpeza (APK / Play Store)

Aplicativo móvel desenvolvido em **React Native + Expo (TypeScript)** com módulos nativos Android voltado para **diagnóstico de segurança, varredura de aplicativos instalados e limpeza inteligente de armazenamento**.

## 🎯 Objetivos do Projeto

- **Varredura de Segurança (Anti-Malware):**
  - Auditoria de pacotes instalados via `PackageManager` do Android.
  - Identificação de aplicativos instalados fora da Google Play Store (*sideloading*).
  - Análise heurística de permissões sensíveis (Acessibilidade, Administrador do Dispositivo, leitura de SMS, sobreposição de tela).
  - Verificação de integridade e hash `SHA-256` de arquivos `.apk` locais.
- **Limpeza e Otimização de Armazenamento:**
  - Localização e remoção segura de arquivos `.apk` obsoletos, arquivos temporários e mídias duplicadas/pesadas.
  - Análise visual do espaço ocupado no dispositivo.
- **Compatibilidade e Distribuição:**
  - Suporte moderno ao **Android 15** (testado no TCL 60 SE) e versões anteriores.
  - Geração de **APK** para testes diretos e instalação manual.
  - Arquitetura em conformidade com as políticas de privacidade e permissões do **Google Play Console** (`.aab`).

## 🛠️ Stack Tecnológica

- **Framework:** React Native + Expo SDK (TypeScript)
- **Camada Nativa:** Expo Modules API (Kotlin / Android SDK)
- **Build & Distribuição:** EAS Build (APK / AAB)

## 🚀 Como Executar Localmente

```bash
npm install
npx expo start