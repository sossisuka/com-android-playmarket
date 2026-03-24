package com.google.playstore.install

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResultLauncher
import com.google.playstore.install.api21.LegacyApkInstallDispatcher
import com.google.playstore.install.api23.ModernApkInstallDispatcher

internal interface ApkInstallDispatcher {
    fun launch(
        apkUri: Uri,
        legacyFilePath: String?,
        launcher: ActivityResultLauncher<Intent>,
        onFailure: () -> Unit
    )
}

internal fun createApkInstallDispatcher(context: Context): ApkInstallDispatcher {
    return if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.LOLLIPOP_MR1) {
        LegacyApkInstallDispatcher(context)
    } else {
        ModernApkInstallDispatcher(context)
    }
}
