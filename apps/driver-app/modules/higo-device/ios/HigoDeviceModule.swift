import ExpoModulesCore
import Foundation

public final class HigoDeviceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HigoDevice")

    Function("getBuildInfo") {
      let bundle = Bundle.main
      let info = bundle.infoDictionary ?? [:]
      return [
        "packageName": bundle.bundleIdentifier ?? "",
        "appVersion": info["CFBundleShortVersionString"] as? String ?? "",
        "buildNumber": info["CFBundleVersion"] as? String ?? "",
        "installSource": "UNKNOWN",
        "installerPackage": "",
      ]
    }

    AsyncFunction("requestIntegrityToken") { (_: String) -> String in
      throw Exception(name: "not_supported", description: "Play Integrity is Android-only")
    }
  }
}
