package com.google.playstore.install

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
import coil.ImageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import com.google.playstore.MainActivity
import com.google.playstore.R
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

internal class InstallNotificationController(
    context: Context
) {
    private val appContext = context.applicationContext
    private val notificationManager = NotificationManagerCompat.from(appContext)
    private val imageLoader = ImageLoader.Builder(appContext)
        .allowHardware(false)
        .build()
    private val notificationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val largeIconCache = ConcurrentHashMap<String, Bitmap>()
    private val iconLoadInFlight = ConcurrentHashMap.newKeySet<String>()
    private val unavailableIcons = ConcurrentHashMap.newKeySet<String>()
    private val latestProgressStates = ConcurrentHashMap<String, InstallSessionState>()

    init {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID,
                appContext.getString(R.string.install_notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = appContext.getString(R.string.install_notification_channel_description)
            }
            manager.createNotificationChannel(channel)
        }
    }

    fun showProgress(state: InstallSessionState) {
        if (!canPostNotifications()) return
        latestProgressStates[state.packageId] = state
        val title = state.appName.ifBlank { state.packageId }
        val text = when (state.stage) {
            INSTALL_STAGE_PREPARING -> appContext.getString(R.string.download_pending)
            INSTALL_STAGE_INSTALLING -> appContext.getString(R.string.installing)
            else -> appContext.getString(R.string.download_in_progress)
        }
        val builder = baseBuilder(
            title = title,
            smallIconRes = R.mipmap.ic_launcher_play_store
        )
            .setCustomContentView(createProgressRemoteViews(state, title, text))
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setContentText(text)
            .setContentIntent(openStorePendingIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)

        notificationManager.notify(progressNotificationId(state.packageId), builder.build())
        warmUpNotificationLargeIcon(state)
    }

    fun showInstalled(packageId: String, appName: String, iconUrl: String) {
        if (!canPostNotifications()) return
        latestProgressStates.remove(packageId)
        val launchIntent = appContext.packageManager.getLaunchIntentForPackage(packageId)
        val contentIntent = launchIntent
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
            ?.let {
                PendingIntent.getActivity(
                    appContext,
                    successNotificationId(packageId),
                    it,
                    PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag()
                )
            } ?: openStorePendingIntent()

        notificationManager.cancel(progressNotificationId(packageId))
        val builder = baseBuilder(
            title = appContext.getString(
                R.string.notification_installation_success_banner,
                appName.ifBlank { packageId }
            ),
            smallIconRes = R.drawable.stat_notify_installed
        )
            .setCustomContentView(
                createSuccessRemoteViews(
                    packageId = packageId,
                    appName = appName.ifBlank { packageId }
                )
            )
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setContentText(
                appContext.getString(
                    R.string.notification_installation_success_banner,
                    appName.ifBlank { packageId }
                )
            )
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setOngoing(false)
            .setProgress(0, 0, false)
            .setCategory(NotificationCompat.CATEGORY_STATUS)

        notificationManager.notify(successNotificationId(packageId), builder.build())
        if (iconUrl.isNotBlank()) {
            warmUpNotificationLargeIcon(
                InstallSessionState(
                    packageId = packageId,
                    appName = appName,
                    iconUrl = iconUrl
                )
            )
        }
    }

    fun showFailure(packageId: String, appName: String, message: String) {
        if (!canPostNotifications()) return
        val builder = baseBuilder(
            title = appName.ifBlank { packageId },
            smallIconRes = R.mipmap.ic_launcher_play_store
        )
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setContentIntent(openStorePendingIntent())
            .setAutoCancel(true)
            .setOngoing(false)

        notificationManager.notify(progressNotificationId(packageId), builder.build())
    }

    fun cancel(packageId: String) {
        latestProgressStates.remove(packageId)
        notificationManager.cancel(progressNotificationId(packageId))
        notificationManager.cancel(successNotificationId(packageId))
    }

    private fun baseBuilder(
        title: String,
        smallIconRes: Int
    ): NotificationCompat.Builder {
        return NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(smallIconRes)
            .setContentTitle(title)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
    }

    private fun openStorePendingIntent(): PendingIntent {
        val intent = Intent(appContext, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        return PendingIntent.getActivity(
            appContext,
            STORE_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag()
        )
    }

    private fun progressText(progress: Int, downloadedBytes: Long, totalBytes: Long?): String {
        val total = totalBytes?.takeIf { it > 0L }
        if (total == null) return "$progress%"
        return appContext.getString(
            R.string.install_notification_progress_bytes,
            android.text.format.Formatter.formatShortFileSize(appContext, downloadedBytes),
            android.text.format.Formatter.formatShortFileSize(appContext, total)
        )
    }

    private fun canPostNotifications(): Boolean {
        if (!notificationManager.areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            appContext,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun pendingIntentImmutableFlag(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE
        } else {
            0
        }
    }

    private fun warmUpNotificationLargeIcon(state: InstallSessionState) {
        val iconUrl = state.iconUrl.trim()
        val packageId = state.packageId
        if (iconUrl.isBlank()) return
        if (largeIconCache.containsKey(packageId)) return
        if (unavailableIcons.contains(packageId)) return
        if (!iconLoadInFlight.add(packageId)) return

        notificationScope.launch {
            val loadedBitmap = runCatching {
                val request = ImageRequest.Builder(appContext)
                    .data(iconUrl)
                    .allowHardware(false)
                    .size(128, 128)
                    .build()
                val result = imageLoader.execute(request)
                (result as? SuccessResult)?.drawable?.toBitmap()
            }.getOrNull()

            if (loadedBitmap != null) {
                largeIconCache[packageId] = loadedBitmap
                latestProgressStates[packageId]?.let { latestState ->
                    showProgress(latestState)
                }
            } else {
                unavailableIcons.add(packageId)
            }
            iconLoadInFlight.remove(packageId)
        }
    }

    private fun resolveNotificationLargeIcon(packageId: String): Bitmap? {
        return largeIconCache[packageId] ?: resolveInstalledPackageIcon(packageId)?.also {
            largeIconCache[packageId] = it
        }
    }

    private fun createProgressRemoteViews(
        state: InstallSessionState,
        title: String,
        statusText: String
    ): RemoteViews {
        val progress = state.progress?.coerceIn(0, 100) ?: 0
        val indeterminate = state.stage != INSTALL_STAGE_DOWNLOADING || state.progress == null
        val remoteViews = RemoteViews(appContext.packageName, R.layout.notification_install_progress)
        bindNotificationIcon(remoteViews, R.id.notification_app_icon, state.packageId)
        remoteViews.setTextViewText(R.id.notification_title, title)
        remoteViews.setTextViewText(R.id.notification_status, statusText)
        remoteViews.setProgressBar(R.id.notification_progress, 100, progress, indeterminate)
        val metaText = if (!indeterminate) {
            progressText(progress, state.downloadedBytes, state.totalBytes)
        } else {
            ""
        }
        remoteViews.setTextViewText(R.id.notification_meta, metaText)
        remoteViews.setViewVisibility(
            R.id.notification_meta,
            if (metaText.isBlank()) View.GONE else View.VISIBLE
        )
        return remoteViews
    }

    private fun createSuccessRemoteViews(
        packageId: String,
        appName: String
    ): RemoteViews {
        val remoteViews = RemoteViews(appContext.packageName, R.layout.notification_install_success)
        bindNotificationIcon(remoteViews, R.id.notification_app_icon, packageId)
        remoteViews.setTextViewText(
            R.id.notification_success_title,
            appContext.getString(R.string.notification_installation_success_banner, appName)
        )
        remoteViews.setImageViewResource(
            R.id.notification_success_mark,
            R.drawable.ic_menu_check_holo_light
        )
        return remoteViews
    }

    private fun bindNotificationIcon(
        remoteViews: RemoteViews,
        viewId: Int,
        packageId: String
    ) {
        val iconBitmap = resolveNotificationLargeIcon(packageId)
        if (iconBitmap != null) {
            remoteViews.setImageViewBitmap(viewId, iconBitmap)
        } else {
            remoteViews.setImageViewResource(viewId, R.mipmap.ic_launcher_play_store)
        }
    }

    private fun resolveInstalledPackageIcon(packageId: String): Bitmap? {
        return runCatching {
            appContext.packageManager.getApplicationIcon(packageId).toBitmap()
        }.getOrNull()
    }

    private fun progressNotificationId(packageId: String): Int {
        return kotlin.math.abs(packageId.hashCode()) + NOTIFICATION_ID_BASE
    }

    private fun successNotificationId(packageId: String): Int {
        return kotlin.math.abs(packageId.hashCode()) + SUCCESS_NOTIFICATION_ID_BASE
    }

    private companion object {
        private const val CHANNEL_ID = "app_install_progress"
        private const val STORE_REQUEST_CODE = 4_271
        private const val NOTIFICATION_ID_BASE = 20_000
        private const val SUCCESS_NOTIFICATION_ID_BASE = 60_000
    }
}
