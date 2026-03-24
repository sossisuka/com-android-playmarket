package com.google.playstore.install.api23

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResultLauncher
import com.google.playstore.install.ApkInstallDispatcher
import com.google.playstore.install.buildLegacyViewInstallIntent
import com.google.playstore.install.buildPackageInstallIntent
import com.google.playstore.install.launchInstallerWithFallback

internal class ModernApkInstallDispatcher(
    private val context: Context
) : ApkInstallDispatcher {
    override fun launch(
        apkUri: Uri,
        legacyFilePath: String?,
        launcher: ActivityResultLauncher<Intent>,
        onFailure: () -> Unit
    ) {
        launchInstallerWithFallback(
            context = context,
            primaryIntent = buildPackageInstallIntent(context, apkUri),
            fallbackIntent = buildLegacyViewInstallIntent(context, apkUri),
            launcher = launcher,
            onFailure = onFailure
        )
    }
}
