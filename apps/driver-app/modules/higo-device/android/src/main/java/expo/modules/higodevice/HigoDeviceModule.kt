package expo.modules.higodevice

import android.content.Context
import android.os.Build
import com.google.android.gms.tasks.Tasks
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HigoDeviceModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: error("React context is not available")

  override fun definition() = ModuleDefinition {
    Name("HigoDevice")

    Function("getBuildInfo") {
      val packageManager = context.packageManager
      val packageName = context.packageName
      val packageInfo = packageManager.getPackageInfo(packageName, 0)
      val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        packageManager.getInstallSourceInfo(packageName).installingPackageName
      } else {
        @Suppress("DEPRECATION")
        packageManager.getInstallerPackageName(packageName)
      }
      val installSource = when (installer) {
        "com.android.vending" -> "GOOGLE_PLAY"
        null, "" -> "UNKNOWN"
        else -> "SIDELOADED"
      }
      val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        packageInfo.longVersionCode
      } else {
        @Suppress("DEPRECATION")
        packageInfo.versionCode.toLong()
      }

      mapOf(
        "packageName" to packageName,
        "appVersion" to (packageInfo.versionName ?: ""),
        "buildNumber" to versionCode.toString(),
        "installSource" to installSource,
        "installerPackage" to (installer ?: ""),
      )
    }

    AsyncFunction("requestIntegrityToken") { nonce: String ->
      val manager = IntegrityManagerFactory.create(context)
      val task = manager.requestIntegrityToken(
        IntegrityTokenRequest.builder().setNonce(nonce).build(),
      )
      Tasks.await(task).token()
    }
  }
}
