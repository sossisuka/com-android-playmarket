package com.google.playstore.install.api21

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResultLauncher
import com.google.playstore.install.ApkInstallDispatcher
import com.google.playstore.install.buildLegacyFileInstallIntent
import com.google.playstore.install.buildLegacyViewInstallIntent
import com.google.playstore.install.buildPackageInstallIntent
import com.google.playstore.install.launchInstallerDirectWithFallback
import com.google.playstore.install.launchInstallerWithFallback

internal class LegacyApkInstallDispatcher(
    private val context: Context
) : ApkInstallDispatcher {
    override fun launch(
        apkUri: Uri,
        legacyFilePath: String?,
        launcher: ActivityResultLauncher<Intent>,
        onFailure: () -> Unit
    ) {
        val primaryIntent = legacyFilePath
            ?.takeIf { it.isNotBlank() }
            ?.let { buildLegacyFileInstallIntent(it) }
            ?: buildLegacyViewInstallIntent(context, apkUri)
        launchInstallerWithFallback(
            context = context,
            primaryIntent = primaryIntent,
            fallbackIntent = buildPackageInstallIntent(context, apkUri),
            launcher = launcher,
            onFailure = onFailure
        )
    }

    override fun launchDirect(apkUri: Uri, legacyFilePath: String?): Boolean {
        val primaryIntent = legacyFilePath
            ?.takeIf { it.isNotBlank() }
            ?.let { buildLegacyFileInstallIntent(it) }
            ?: buildLegacyViewInstallIntent(context, apkUri)
        return launchInstallerDirectWithFallback(
            context = context,
            primaryIntent = primaryIntent,
            fallbackIntent = buildPackageInstallIntent(context, apkUri)
        )
    }
}
