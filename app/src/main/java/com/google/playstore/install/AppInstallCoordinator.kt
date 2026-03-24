package com.google.playstore.install

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import com.google.playstore.BuildConfig
import com.google.playstore.R
import com.google.playstore.data.PlayApiClient
import com.google.playstore.model.StoreApp
import java.io.File
import java.util.zip.ZipFile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal class AppInstallCoordinator(
    context: Context,
    private val apiClient: PlayApiClient = PlayApiClient(BuildConfig.PLAY_API_BASE_URL),
    private val notifications: InstallNotificationController = InstallNotificationController(context)
) {
    private val appContext = context.applicationContext
    private val packageManager = appContext.packageManager
    private val apkInstallDispatcher = createApkInstallDispatcher(appContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _state = MutableStateFlow<InstallSessionState?>(null)
    private val _events = MutableSharedFlow<InstallSessionEvent>(extraBufferCapacity = 8)
    private var installFlowJob: Job? = null
    private var installMonitorJob: Job? = null
    private var pendingApkCachePath: String? = null
    private var pendingLegacyInstallPath: String? = null

    val state: StateFlow<InstallSessionState?> = _state.asStateFlow()
    val events: SharedFlow<InstallSessionEvent> = _events.asSharedFlow()

    fun start(app: StoreApp) {
        val requiredUnknownSources = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !appContext.packageManager.canRequestPackageInstalls()
        if (requiredUnknownSources) {
            openUnknownSourcesSettings()
            fail(
                app = app,
                message = appContext.getString(R.string.install_unknown_sources_required)
            )
            return
        }

        clearActiveSession(clearNotification = true, clearErrorState = true)
        updateState(
            InstallSessionState(
                packageId = app.id,
                appName = app.name,
                iconUrl = app.iconUrl,
                stage = INSTALL_STAGE_PREPARING,
                progress = null
            )
        )

        installFlowJob = scope.launch {
            delay(INSTALL_PREPARATION_DURATION_MS)
            updateState(
                currentState()?.copy(
                    stage = INSTALL_STAGE_DOWNLOADING,
                    progress = 0,
                    downloadedBytes = 0L,
                    totalBytes = null,
                    errorMessage = null
                ) ?: return@launch
            )

            val apkCacheDir = File(appContext.cacheDir, "apk-installer")
            val apkCacheFile = File(apkCacheDir, "${app.id}.apk")
            val downloadedFile = runCatching {
                withContext(Dispatchers.IO) {
                    if (!apkCacheDir.exists()) {
                        apkCacheDir.mkdirs()
                    }
                    if (apkCacheFile.exists()) {
                        apkCacheFile.delete()
                    }
                    apiClient.downloadApkToFile(app.id, apkCacheFile) { downloadedBytes, totalBytes ->
                        scope.launch {
                            updateState(
                                currentState()?.copy(
                                    stage = INSTALL_STAGE_DOWNLOADING,
                                    progress = if (totalBytes > 0L) {
                                        ((downloadedBytes * 100L) / totalBytes).toInt().coerceIn(0, 100)
                                    } else {
                                        0
                                    },
                                    downloadedBytes = downloadedBytes,
                                    totalBytes = totalBytes.takeIf { it > 0L }
                                ) ?: return@launch
                            )
                        }
                    }
                    apkCacheFile
                }
            }.getOrElse { failure ->
                fail(
                    app = app,
                    message = appContext.getString(
                        R.string.install_download_failed_with_reason,
                        failure.message?.takeIf(String::isNotBlank) ?: "unknown error"
                    )
                )
                runCatching { apkCacheFile.delete() }
                return@launch
            }

            val apkUri = runCatching {
                FileProvider.getUriForFile(
                    appContext,
                    "${appContext.packageName}.fileprovider",
                    downloadedFile
                )
            }.getOrElse {
                fail(app, appContext.getString(R.string.install_prepare_failed))
                runCatching { downloadedFile.delete() }
                return@launch
            }

            val legacyInstallPath = prepareLegacyInstallPath(app.id, downloadedFile)
            pendingApkCachePath = downloadedFile.absolutePath
            pendingLegacyInstallPath = legacyInstallPath

            val parsedPackageName = runCatching {
                packageManager.getPackageArchiveInfo(downloadedFile.absolutePath, 0)?.packageName
            }.getOrNull()
            if (parsedPackageName.isNullOrBlank()) {
                fail(app, appContext.getString(R.string.install_invalid_apk))
                runCatching { downloadedFile.delete() }
                return@launch
            }
            if (!parsedPackageName.equals(app.id, ignoreCase = true)) {
                fail(
                    app,
                    appContext.getString(R.string.install_package_mismatch, app.id, parsedPackageName)
                )
                runCatching { downloadedFile.delete() }
                return@launch
            }

            val apkNativeAbis = readApkNativeAbis(downloadedFile.absolutePath)
            val deviceAbis = Build.SUPPORTED_ABIS.toSet()
            if (apkNativeAbis.isNotEmpty() && apkNativeAbis.intersect(deviceAbis).isEmpty()) {
                _events.tryEmit(InstallSessionEvent.AbiIncompatible(app.id))
                fail(app, appContext.getString(R.string.install_failed_cpu_abi_incompatible))
                runCatching { downloadedFile.delete() }
                return@launch
            }

            updateState(
                currentState()?.copy(
                    stage = INSTALL_STAGE_INSTALLING,
                    progress = null,
                    downloadedBytes = downloadedFile.length().coerceAtLeast(0L),
                    totalBytes = downloadedFile.length().coerceAtLeast(0L)
                ) ?: return@launch
            )

            val launched = apkInstallDispatcher.launchDirect(
                apkUri = apkUri,
                legacyFilePath = legacyInstallPath
            )
            if (!launched) {
                fail(app, appContext.getString(R.string.install_launch_failed))
                return@launch
            }

            startInstallMonitor(app)
        }
    }

    fun cancel() {
        clearActiveSession(clearNotification = true, clearErrorState = true)
    }

    fun dismissError() {
        val session = _state.value ?: return
        if (session.errorMessage == null) return
        notifications.cancel(session.packageId)
        clearPendingFiles()
        _state.value = null
    }

    fun dispose() {
        clearActiveSession(clearNotification = true, clearErrorState = true)
        scope.coroutineContext[Job]?.cancel()
    }

    private fun startInstallMonitor(app: StoreApp) {
        installMonitorJob?.cancel()
        installMonitorJob = scope.launch {
            val startedAt = System.currentTimeMillis()
            while (true) {
                if (isAppInstalledOnDevice(app.id)) {
                    installFlowJob = null
                    installMonitorJob = null
                    clearPendingFiles()
                    _state.value = null
                    notifications.showInstalled(app.id, app.name, app.iconUrl)
                    _events.tryEmit(InstallSessionEvent.Installed(app.id))
                    return@launch
                }
                if (System.currentTimeMillis() - startedAt >= INSTALL_MONITOR_TIMEOUT_MS) {
                    fail(
                        app = app,
                        message = appContext.getString(R.string.install_timeout_error)
                    )
                    return@launch
                }
                delay(INSTALL_POLL_INTERVAL_MS)
            }
        }
    }

    private fun fail(app: StoreApp, message: String) {
        installFlowJob?.cancel()
        installFlowJob = null
        installMonitorJob?.cancel()
        installMonitorJob = null
        val nextState = InstallSessionState(
            packageId = app.id,
            appName = app.name,
            iconUrl = app.iconUrl,
            stage = INSTALL_STAGE_IDLE,
            progress = null,
            downloadedBytes = 0L,
            totalBytes = null,
            errorMessage = message
        )
        _state.value = nextState
        notifications.showFailure(app.id, app.name, message)
        clearPendingFiles()
    }

    private fun clearActiveSession(clearNotification: Boolean, clearErrorState: Boolean) {
        installFlowJob?.cancel()
        installFlowJob = null
        installMonitorJob?.cancel()
        installMonitorJob = null
        val current = _state.value
        if (clearNotification && current != null) {
            notifications.cancel(current.packageId)
        }
        clearPendingFiles()
        if (clearErrorState) {
            _state.value = null
        }
    }

    private fun updateState(nextState: InstallSessionState) {
        _state.value = nextState
        notifications.showProgress(nextState)
    }

    private fun currentState(): InstallSessionState? = _state.value

    private fun openUnknownSourcesSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val settingsIntent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${appContext.packageName}")
        ).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { appContext.startActivity(settingsIntent) }
    }

    private fun clearPendingFiles() {
        pendingApkCachePath?.let { cachedPath ->
            runCatching { File(cachedPath).delete() }
        }
        pendingLegacyInstallPath?.let { cachedPath ->
            runCatching { File(cachedPath).delete() }
        }
        pendingApkCachePath = null
        pendingLegacyInstallPath = null
    }

    private fun prepareLegacyInstallPath(packageId: String, downloadedFile: File): String? {
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.LOLLIPOP_MR1) return null
        return runCatching {
            val externalBaseDir = appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: appContext.getExternalFilesDir(null)
                ?: appContext.cacheDir
            val legacyDir = File(externalBaseDir, "apk-installer")
            if (!legacyDir.exists()) {
                legacyDir.mkdirs()
            }
            val legacyFile = File(legacyDir, "$packageId.apk")
            if (legacyFile.exists()) {
                legacyFile.delete()
            }
            downloadedFile.copyTo(legacyFile, overwrite = true)
            legacyFile.absolutePath
        }.getOrNull()
    }

    private fun isAppInstalledOnDevice(packageName: String): Boolean {
        if (packageName.isBlank()) return false
        if (packageManager.getLaunchIntentForPackage(packageName) != null) return true
        return runCatching { packageManager.getPackageInfo(packageName, 0) }.isSuccess
    }

    private fun readApkNativeAbis(apkPath: String): Set<String> {
        return runCatching {
            ZipFile(apkPath).use { zip ->
                zip.entries()
                    .asSequence()
                    .map { it.name }
                    .filter { it.startsWith("lib/") }
                    .mapNotNull { entry ->
                        val parts = entry.split('/')
                        parts.getOrNull(1)?.takeIf { it.isNotBlank() }
                    }
                    .toSet()
            }
        }.getOrDefault(emptySet())
    }

    private companion object {
        private const val INSTALL_PREPARATION_DURATION_MS = 3_000L
        private const val INSTALL_POLL_INTERVAL_MS = 500L
        private const val INSTALL_MONITOR_TIMEOUT_MS = 120_000L
    }
}
