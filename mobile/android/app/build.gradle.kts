plugins {
    id("com.android.application")
    // Required, not optional. Several plugins this app uses (package_info_plus,
    // flutter_secure_storage, mobile_scanner) are Kotlin-only, and Flutter
    // generates GeneratedPluginRegistrant.java. Java cannot see a Kotlin class
    // unless the Kotlin plugin is applied here, so without this the build dies
    // with "cannot find symbol: class PackageInfoPlugin". The `kotlin { }` block
    // at the bottom of this file needs it too.
    id("org.jetbrains.kotlin.android")
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.astu.mobile"

    // Pinned to 37 rather than `flutter.compileSdkVersion` (36). The
    // flutter_secure_storage plugin compiles against 37, and a plugin that is
    // compiled against a newer SDK than the app fails at build time with an
    // unhelpful error. Newer SDKs are backward compatible, so compiling
    // against 37 is safe. Drop this back to flutter.compileSdkVersion once
    // Flutter's default catches up.
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.astu.mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    implementation(files("libs/EthiopiaPaySdkModule-uat-release.aar"))
    // The inspected SDK pay() signature requires AndroidX FragmentActivity.
    implementation("androidx.fragment:fragment-ktx:1.8.9")
}
