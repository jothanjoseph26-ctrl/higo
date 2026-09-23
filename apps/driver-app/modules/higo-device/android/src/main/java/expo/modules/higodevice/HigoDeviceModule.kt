package expo.modules.higodevice

import android.content.Context
import android.os.Build
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

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
      suspendCoroutine<String> { continuation ->
        try {
          val manager = IntegrityManagerFactory.create(context)
          manager
            .requestIntegrityToken(
              IntegrityTokenRequest.builder().setNonce(nonce).build(),
            )
            .addOnSuccessListener { result ->
              if (!continuation.isCompleted) continuation.resume(result.token())
            }
            .addOnFailureListener { error ->
              if (!continuation.isCompleted) {
                continuation.resumeWithException(error)
              }
            }
        } catch (error: Exception) {
          if (!continuation.isCompleted) {
            continuation.resumeWithException(error)
          }
        }
      }
    }
  }
}
