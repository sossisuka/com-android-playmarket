package com.google.playstore.install

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.result.ActivityResultLauncher
import java.io.File

internal fun buildLegacyViewInstallIntent(context: Context, apkUri: Uri): Intent {
    return Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(apkUri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        putExtra(Intent.EXTRA_RETURN_RESULT, true)
        clipData = ClipData.newUri(context.contentResolver, "apk", apkUri)
    }
}

internal fun buildPackageInstallIntent(context: Context, apkUri: Uri): Intent {
    return Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
        data = apkUri
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        putExtra(Intent.EXTRA_RETURN_RESULT, true)
        clipData = ClipData.newUri(context.contentResolver, "apk", apkUri)
    }
}

internal fun buildLegacyFileInstallIntent(legacyFilePath: String): Intent {
    return Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(Uri.fromFile(File(legacyFilePath)), "application/vnd.android.package-archive")
        putExtra(Intent.EXTRA_RETURN_RESULT, true)
    }
}

internal fun launchInstallerWithFallback(
    context: Context,
    primaryIntent: Intent,
    fallbackIntent: Intent,
    launcher: ActivityResultLauncher<Intent>,
    onFailure: () -> Unit
) {
    val launcherIntents = listOf(primaryIntent, fallbackIntent)
    for (intent in launcherIntents) {
        grantReadPermissionToResolvedActivities(context, intent)
        val launched = runCatching {
            launcher.launch(intent)
        }.isSuccess
        if (launched) return
    }

    val directIntents = listOf(primaryIntent, fallbackIntent)
    for (intent in directIntents) {
        val intentForDirectStart = Intent(intent).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        grantReadPermissionToResolvedActivities(context, intentForDirectStart)
        val launched = runCatching {
            context.startActivity(intentForDirectStart)
        }.isSuccess
        if (launched) return
    }

    onFailure()
}

private fun grantReadPermissionToResolvedActivities(
    context: Context,
    intent: Intent
) {
    val apkUri = intent.data ?: return
    if (apkUri.scheme != "content") return
    runCatching {
        context.packageManager
            .queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
            .asSequence()
            .mapNotNull { it.activityInfo?.packageName }
            .distinct()
            .forEach { packageName ->
                context.grantUriPermission(packageName, apkUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
    }
}
