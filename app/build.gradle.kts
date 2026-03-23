import java.io.File

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

fun loadEnv(file: File): Map<String, String> {
    if (!file.exists()) return emptyMap()
    return file.readLines()
        .asSequence()
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") && it.contains("=") }
        .map {
            val idx = it.indexOf('=')
            val key = it.substring(0, idx).trim().trimStart('\uFEFF')
            val value = it.substring(idx + 1).trim().trim('"')
            key to value
        }
        .toMap()
}

fun asQuotedGradleString(value: String): String {
    val escaped = value.replace("\\", "\\\\").replace("\"", "\\\"")
    return "\"$escaped\""
}

val env = loadEnv(rootProject.file(".env"))
val playApiBaseUrl = env["PLAY_API_BASE_URL"] ?: "http://10.0.2.2:8787"

android {
    namespace = "com.google.playstore"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.google.playstore"
        minSdk = 21
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "PLAY_API_BASE_URL", asQuotedGradleString(playApiBaseUrl))

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

val renameDebugApk by tasks.registering {
    doLast {
        val outDir = layout.buildDirectory.dir("outputs/apk/debug").get().asFile
        val sourceApk = outDir.listFiles()?.firstOrNull { it.name.endsWith("-debug.apk") } ?: return@doLast
        val targetApk = File(outDir, "com.android.playmarket.apk")
        sourceApk.copyTo(targetApk, overwrite = true)
        if (sourceApk.name != targetApk.name) {
            sourceApk.delete()
        }
    }
}

tasks.matching { it.name == "assembleDebug" }.configureEach {
    finalizedBy(renameDebugApk)
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation("io.coil-kt:coil-compose:2.7.0")
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
