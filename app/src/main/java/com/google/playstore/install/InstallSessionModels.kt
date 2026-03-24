package com.google.playstore.install

internal const val INSTALL_STAGE_IDLE = "idle"
internal const val INSTALL_STAGE_PREPARING = "preparing"
internal const val INSTALL_STAGE_DOWNLOADING = "downloading"
internal const val INSTALL_STAGE_INSTALLING = "installing"

internal data class InstallSessionState(
    val packageId: String,
    val appName: String,
    val iconUrl: String = "",
    val stage: String = INSTALL_STAGE_IDLE,
    val progress: Int? = null,
    val downloadedBytes: Long = 0L,
    val totalBytes: Long? = null,
    val errorMessage: String? = null
)

internal sealed interface InstallSessionEvent {
    data class Installed(val packageId: String) : InstallSessionEvent
    data class AbiIncompatible(val packageId: String) : InstallSessionEvent
}
