package expo.modules.androidscanner

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class AndroidScannerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context indisponivel")

  override fun definition() = ModuleDefinition {
    Name("AndroidScanner")

    AsyncFunction("getStorageInfo") {
      val path = Environment.getDataDirectory()
      val stat = StatFs(path.path)
      val blockSize = stat.blockSizeLong
      val totalBlocks = stat.blockCountLong
      val availableBlocks = stat.availableBlocksLong

      val totalBytes = totalBlocks * blockSize
      val freeBytes = availableBlocks * blockSize
      val usedBytes = totalBytes - freeBytes

      mapOf(
        "totalBytes" to totalBytes,
        "freeBytes" to freeBytes,
        "usedBytes" to usedBytes,
        "deviceModel" to "${Build.MANUFACTURER} ${Build.MODEL}",
        "androidVersion" to Build.VERSION.RELEASE,
        "sdkInt" to Build.VERSION.SDK_INT
      )
    }

    AsyncFunction("scanInstalledApps") {
      val pm = context.packageManager
      val packages: List<PackageInfo> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.getInstalledPackages(PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
      } else {
        @Suppress("DEPRECATION")
        pm.getInstalledPackages(PackageManager.GET_PERMISSIONS)
      }

      val criticalPermissions = setOf(
        "android.permission.READ_SMS",
        "android.permission.RECEIVE_SMS",
        "android.permission.SEND_SMS",
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.REQUEST_INSTALL_PACKAGES",
        "android.permission.BIND_ACCESSIBILITY_SERVICE",
        "android.permission.BIND_DEVICE_ADMIN",
        "android.permission.READ_CONTACTS",
        "android.permission.RECORD_AUDIO",
        "android.permission.ACCESS_FINE_LOCATION"
      )

      val officialInstallers = setOf(
        "com.android.vending",
        "com.google.android.feedback",
        "com.tcl.appmarket",
        "com.android.packageinstaller"
      )

      val results = mutableListOf(emptyMap<String, Any?>()).apply { clear() }

      for (pkg in packages) {
        val appInfo = pkg.applicationInfo ?: continue
        val isSystemApp = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        if (isSystemApp) continue

        val appName = pm.getApplicationLabel(appInfo).toString()
        val packageName = pkg.packageName
        val versionName = pkg.versionName ?: "1.0"

        val installer = try {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            pm.getInstallSourceInfo(packageName).installingPackageName
          } else {
            @Suppress("DEPRECATION")
            pm.getInstallerPackageName(packageName)
          }
        } catch (e: Exception) {
          null
        }

        val isSideloaded = installer == null || !officialInstallers.contains(installer)

        val requestedPerms = pkg.requestedPermissions?.toList() ?: emptyList()
        val dangerousFound = requestedPerms.filter { criticalPermissions.contains(it) }
          .map { it.substringAfterLast(".") }

        var riskScore = 0
        val riskReasons = ArrayList<String>()

        if (isSideloaded) {
          riskScore += 45
          riskReasons.add("Instalado fora da Play Store (${installer ?: "Origem desconhecida"})")
        }
        if (dangerousFound.contains("SYSTEM_ALERT_WINDOW")) {
          riskScore += 20
          riskReasons.add("Permissao de sobreposicao de tela")
        }
        if (dangerousFound.contains("REQUEST_INSTALL_PACKAGES")) {
          riskScore += 25
          riskReasons.add("Pode instalar outros APKs")
        }
        if (dangerousFound.contains("READ_SMS") || dangerousFound.contains("RECEIVE_SMS")) {
          riskScore += 25
          riskReasons.add("Acesso a leitura/recebimento de SMS")
        }
        if (dangerousFound.size >= 4) {
          riskScore += 15
          riskReasons.add("Excesso de permissoes sensiveis (${dangerousFound.size})")
        }

        val riskLevel = when {
          riskScore >= 60 -> "ALTO"
          riskScore >= 30 -> "MEDIO"
          else -> "SEGURO"
        }

        val apkFile = File(appInfo.sourceDir)
        val apkSize = if (apkFile.exists()) apkFile.length() else 0L

        results.add(
          mapOf(
            "appName" to appName,
            "packageName" to packageName,
            "versionName" to versionName,
            "installer" to (installer ?: "Desconhecido"),
            "isSideloaded" to isSideloaded,
            "riskScore" to riskScore.coerceAtMost(100),
            "riskLevel" to riskLevel,
            "riskReasons" to riskReasons,
            "dangerousPermissions" to dangerousFound,
            "apkSize" to apkSize
          )
        )
      }

      results.sortedByDescending { it["riskScore"] as Int }
    }

    AsyncFunction("scanJunkFiles") {
      val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
      val junkList = mutableListOf(emptyMap<String, Any>()).apply { clear() }

      if (downloadsDir != null && downloadsDir.exists() && downloadsDir.isDirectory) {
        downloadsDir.walkTopDown().maxDepth(3).forEach { file ->
          if (file.isFile) {
            val name = file.name.lowercase()
            val isApk = name.endsWith(".apk") || name.endsWith(".xapk")
            val isTemp = name.endsWith(".tmp") || name.endsWith(".log") || name.endsWith(".bak")
            val isLargeFile = file.length() > 50 * 1024 * 1024

            if (isApk || isTemp || isLargeFile) {
              val category = when {
                isApk -> "APK_RESIDUAL"
                isTemp -> "TEMPORARIO"
                else -> "ARQUIVO_GRANDE"
              }

              junkList.add(
                mapOf(
                  "name" to file.name,
                  "path" to file.absolutePath,
                  "size" to file.length(),
                  "category" to category,
                  "sha256" to if (isApk) calculateSha256(file) else ""
                )
              )
            }
          }
        }
      }

      junkList.sortedByDescending { it["size"] as Long }
    }

    AsyncFunction("deleteFile") { filePath: String ->
      val file = File(filePath)
      if (file.exists() && file.canWrite()) {
        file.delete()
      } else {
        false
      }
    }

    Function("openAppSettings") { packageName: String ->
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.fromParts("package", packageName, null)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }
  }

  private fun calculateSha256(file: File): String {
    return try {
      val digest = MessageDigest.getInstance("SHA-256")
      FileInputStream(file).use { fis ->
        val buffer = ByteArray(8192)
        var bytesRead: Int
        while (fis.read(buffer).also { bytesRead = it } != -1) {
          digest.update(buffer, 0, bytesRead)
        }
      }
      digest.digest().joinToString("") { "%02x".format(it) }
    } catch (e: Exception) {
      ""
    }
  }
}