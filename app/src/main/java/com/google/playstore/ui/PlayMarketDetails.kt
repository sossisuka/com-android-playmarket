package com.google.playstore.ui

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.ContextThemeWrapper
import android.widget.ImageView
import android.widget.ProgressBar
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import coil.compose.AsyncImagePainter
import com.google.playstore.BuildConfig
import com.google.playstore.R
import com.google.playstore.data.AuthSessionStore
import com.google.playstore.data.PlayApiClient
import com.google.playstore.install.AppInstallCoordinator
import com.google.playstore.install.INSTALL_STAGE_DOWNLOADING
import com.google.playstore.install.INSTALL_STAGE_IDLE
import com.google.playstore.install.INSTALL_STAGE_INSTALLING
import com.google.playstore.install.INSTALL_STAGE_PREPARING
import com.google.playstore.install.InstallSessionEvent
import com.google.playstore.install.InstallSessionState
import com.google.playstore.model.CatalogMode
import com.google.playstore.model.DrawerSection
import com.google.playstore.model.HomeBanner
import com.google.playstore.model.HomePayload
import com.google.playstore.model.HomeTab
import com.google.playstore.model.AppReview
import com.google.playstore.model.AppReviewsPage
import com.google.playstore.model.ReviewHistogramEntry
import com.google.playstore.model.StoreApp
import com.google.playstore.model.tr
import com.google.playstore.ui.theme.PlayMarketTheme
import java.text.SimpleDateFormat
import java.util.Locale
import kotlin.math.min
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
internal fun AppDetailsPage(
    app: StoreApp,
    catalogApps: List<StoreApp>,
    apiClient: PlayApiClient,
    authToken: String?,
    loadingDetails: Boolean,
    isAuthenticated: Boolean,
    unsupportedOnCurrentDeviceApi: Boolean,
    installedAppsRefreshKey: Int,
    installSession: InstallSessionState?,
    activeInstallSession: InstallSessionState?,
    wishlistSelected: Boolean,
    onWishlistClick: () -> Unit,
    onMarkUnsupportedForCurrentApi: () -> Unit,
    onStartInstall: (StoreApp) -> Unit,
    onCancelInstall: () -> Unit,
    onDismissInstallError: () -> Unit,
    onRetryInstall: (StoreApp) -> Unit,
    onInstalledStateChanged: () -> Unit,
    onRequireSignIn: () -> Unit,
    onAppClick: (StoreApp) -> Unit
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val packageManager = context.packageManager
    val uriHandler = LocalUriHandler.current
    val unsupportedOnDeviceMessage = tr(
        "Это приложение больше не совместимо с вашим устройством.",
        "This app isn't compatible with your device anymore."
    )
    val unsupportedActionLabel = tr("НЕ ПОДДЕРЖИВАЕТСЯ", "NOT COMPATIBLE")
    val abiIncompatibleMessage = stringResource(R.string.install_failed_cpu_abi_incompatible)
    val screenshotImages = remember(app.id, app.screenshots, app.iconUrl) {
        app.screenshots
            .map(String::trim)
            .filter(String::isNotBlank)
            .ifEmpty { if (app.iconUrl.isBlank()) emptyList() else listOf(app.iconUrl) }
    }
    val trailerImage = app.trailerImageUrl.trim()
    val hasTrailer = trailerImage.isNotBlank()
    val screenshotsOnly = remember(screenshotImages, trailerImage) {
        screenshotImages.filterNot { it == trailerImage }
    }
    val infiniteScreenshots = screenshotsOnly.size > 1
    val infiniteScreenshotsVirtualCount = 1_000_000
    val screenshotsVirtualCount = if (infiniteScreenshots) {
        infiniteScreenshotsVirtualCount
    } else {
        screenshotsOnly.size
    }
    val screenshotsStartIndex = remember(screenshotsOnly.size, hasTrailer, screenshotsVirtualCount) {
        if (hasTrailer || !infiniteScreenshots) {
            0
        } else {
            val middle = screenshotsVirtualCount / 2
            val alignedMiddle = middle - (middle % screenshotsOnly.size)
            alignedMiddle
        }
    }
    val screenshotsListState = remember(app.id, screenshotsStartIndex) {
        LazyListState(firstVisibleItemIndex = screenshotsStartIndex)
    }
    val descriptionText = app.descriptionBlocks.joinToString("\n\n").ifBlank { app.subtitle.ifBlank { "Описание отсутствует" } }
    val whatsNewText = app.whatsNew.joinToString("\n").ifBlank { "" }
    val similarApps = remember(app.similarAppIds, catalogApps) { app.similarAppIds.mapNotNull { id -> catalogApps.firstOrNull { it.id == id } } }
    val moreFromDeveloper = remember(app.moreFromDeveloperIds, catalogApps) { app.moreFromDeveloperIds.mapNotNull { id -> catalogApps.firstOrNull { it.id == id } } }
    val launchIntent = remember(packageManager, app.id, installedAppsRefreshKey) {
        packageManager.getLaunchIntentForPackage(app.id)
    }
    val isInstalledOnDevice = remember(context, app.id, launchIntent, installedAppsRefreshKey) {
        isAppInstalledOnDevice(context, app.id) || launchIntent != null
    }
    val isUnsupportedForCurrentDevice = unsupportedOnCurrentDeviceApi && !isInstalledOnDevice
    val uninstallLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        onInstalledStateChanged()
    }
    var showInstallDialog by rememberSaveable(app.id) { mutableStateOf(false) }
    var showInstallAuthDialog by rememberSaveable(app.id) { mutableStateOf(false) }
    var fullscreenShotIndex by rememberSaveable(app.id) { mutableStateOf<Int?>(null) }
    var localInstallErrorMessage by rememberSaveable(app.id) { mutableStateOf<String?>(null) }
    var headerActionWidthPx by rememberSaveable(app.id) { mutableIntStateOf(0) }
    val installProgress = installSession?.progress
    val installStage = installSession?.stage ?: INSTALL_STAGE_IDLE
    val installDownloadedBytes = installSession?.downloadedBytes ?: 0L
    val installTotalBytes = installSession?.totalBytes
    val installErrorMessage = installSession?.errorMessage ?: localInstallErrorMessage

    val startInstallFlow = startInstallFlow@{
        if (isUnsupportedForCurrentDevice) {
            localInstallErrorMessage = null
            onMarkUnsupportedForCurrentApi()
            return@startInstallFlow
        }
        if (!isAuthenticated) {
            localInstallErrorMessage = null
            showInstallAuthDialog = true
            return@startInstallFlow
        }
        val requiredApi = parseRequiresAndroidApiLevel(app.requiresAndroid)
        if (requiredApi != null && Build.VERSION.SDK_INT < requiredApi) {
            val requiredLabel = app.requiresAndroid.ifBlank { "API $requiredApi" }
            localInstallErrorMessage = tr(
                "Приложение требует Android $requiredLabel (API $requiredApi). На устройстве Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}).",
                "This app requires Android $requiredLabel (API $requiredApi). Device is Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})."
            )
            return@startInstallFlow
        }
        localInstallErrorMessage = null
        onStartInstall(app)
    }
    val launchUninstallFlow = {
        val uninstallIntent = Intent(Intent.ACTION_DELETE).apply {
            data = Uri.parse("package:${app.id}")
            putExtra(Intent.EXTRA_RETURN_RESULT, true)
        }
        runCatching {
            uninstallLauncher.launch(uninstallIntent)
        }.onFailure {
            val fallbackIntent = Intent(Intent.ACTION_DELETE).apply {
                data = Uri.parse("package:${app.id}")
            }
            runCatching { context.startActivity(fallbackIntent) }
            onInstalledStateChanged()
        }
    }

    if (showInstallAuthDialog) {
        LegacyInstallAuthRequiredDialog(
            appName = app.name,
            onDismiss = { showInstallAuthDialog = false },
            onSignIn = {
                showInstallAuthDialog = false
                onRequireSignIn()
            }
        )
    }
    if (showInstallDialog) {
        LegacyInstallDialog(
            appName = app.name,
            appPublisher = app.publisher,
            appIconUrl = app.iconUrl,
            priceLabel = priceLabelForUi(app),
            onDismiss = { showInstallDialog = false },
            onInstall = {
                showInstallDialog = false
                startInstallFlow()
            }
        )
    }
    val shouldShowInstallErrorDialog = !installErrorMessage.isNullOrBlank() &&
        !(isUnsupportedForCurrentDevice && installErrorMessage == abiIncompatibleMessage)

    if (shouldShowInstallErrorDialog) {
        LegacyInstallErrorDialog(
            appName = app.name,
            message = installErrorMessage.orEmpty(),
            onDismiss = {
                if (installSession?.errorMessage != null) {
                    onDismissInstallError()
                } else {
                    localInstallErrorMessage = null
                }
            },
            showRetry = !isUnsupportedForCurrentDevice,
            onRetry = {
                if (installSession?.errorMessage != null) {
                    onRetryInstall(app)
                } else {
                    startInstallFlow()
                }
            }
        )
    }
    val openShotIndex = fullscreenShotIndex
    if (openShotIndex != null && screenshotsOnly.isNotEmpty()) {
        FullscreenScreenshotViewer(
            images = screenshotsOnly,
            initialIndex = openShotIndex.coerceIn(0, screenshotsOnly.lastIndex),
            onDismiss = { fullscreenShotIndex = null }
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFE5E5E5)),
        contentPadding = PaddingValues(bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .padding(horizontal = 10.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top
                ) {
                    Box(
                        modifier = Modifier
                            .size(104.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color.White),
                        contentAlignment = Alignment.Center
                    ) {
                        AppIconImage(app.iconUrl, 104.dp, cornerRadius = 10.dp)
                    }
                    Column(Modifier.weight(1f).padding(start = 10.dp, end = 8.dp)) {
                        Text(
                            app.name,
                            color = Color(0xFF333333),
                            fontSize = 24.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            fontWeight = FontWeight.Light
                        )
                        Row(
                            modifier = Modifier
                                .padding(top = 4.dp)
                                .background(Color(0x08000000))
                                .padding(horizontal = 2.dp, vertical = 1.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(app.publisher, color = Color(0xFF2D7EA1), fontSize = 13.sp, maxLines = 1)
                            Text("  >", color = Color(0x992D7EA1), fontSize = 13.sp)
                        }
                        if (installProgress == null) {
                            Spacer(Modifier.height(6.dp))
                            LegacyStarText(rating = ratingForCard(app))
                            Text("${app.reviews} ${tr("отзывов", "reviews")}", color = Color(0xFF9A9A9A), fontSize = 11.sp, maxLines = 1)
                        } else {
                            Spacer(Modifier.height(6.dp))
                            val headerActionWidthDp = with(density) { headerActionWidthPx.toDp() }
                            HeaderDownloadProgressPanel(
                                progress = installProgress,
                                stage = installStage,
                                downloadedBytes = installDownloadedBytes,
                                totalBytes = installTotalBytes,
                                onCancel = onCancelInstall,
                                modifier = Modifier.fillMaxWidth(),
                                showCancel = false,
                                barTrailingOverlap = headerActionWidthDp + 8.dp
                            )
                        }
                    }
                    Column(
                        modifier = Modifier
                            .align(Alignment.Top)
                            .onSizeChanged { headerActionWidthPx = it.width }
                            .padding(top = 2.dp),
                        horizontalAlignment = Alignment.End
                    ) {
                        if (app.isFree && !isInstalledOnDevice) {
                            Text(priceLabelForUi(app), color = Color(0xFF7C7C7C), fontSize = 15.sp)
                            Spacer(Modifier.height(6.dp))
                        }
                        if (installProgress == null) {
                            val detailsActionButtonModifier = if (isUnsupportedForCurrentDevice) {
                                Modifier
                                    .width(170.dp)
                                    .height(40.dp)
                            } else {
                                Modifier
                                    .width(122.dp)
                                    .height(40.dp)
                            }
                            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Box(
                                    detailsActionButtonModifier
                                        .background(
                                            if (isUnsupportedForCurrentDevice) Color(0xFFD8D8D8) else Color(0xFFAFCA34),
                                            RoundedCornerShape(2.dp)
                                        )
                                        .then(
                                            if (isUnsupportedForCurrentDevice) {
                                                Modifier
                                            } else {
                                                Modifier.clickable {
                                                    if (isInstalledOnDevice && launchIntent != null) {
                                                        context.startActivity(launchIntent)
                                                    } else if (!isInstalledOnDevice) {
                                                        if (isAuthenticated) {
                                                            showInstallDialog = true
                                                        } else {
                                                            localInstallErrorMessage = null
                                                            showInstallAuthDialog = true
                                                        }
                                                    }
                                                }
                                            }
                                        )
                                        .padding(horizontal = 10.dp, vertical = 7.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = when {
                                            isUnsupportedForCurrentDevice -> unsupportedActionLabel
                                            isInstalledOnDevice -> stringResource(R.string.open).uppercase(Locale.getDefault())
                                            app.isFree -> stringResource(R.string.install).uppercase(Locale.getDefault())
                                            else -> priceLabelForUi(app)
                                        },
                                        color = if (isUnsupportedForCurrentDevice) Color(0xFF636363) else Color.White,
                                        fontSize = if (isUnsupportedForCurrentDevice) 11.sp else 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.fillMaxWidth(),
                                        textAlign = TextAlign.Center,
                                        maxLines = 1,
                                        overflow = TextOverflow.Clip
                                    )
                                }
                                if (isInstalledOnDevice) {
                                    Row(
                                        modifier = detailsActionButtonModifier
                                            .background(Color.White)
                                            .border(1.dp, Color(0x14000000))
                                            .clickable { launchUninstallFlow() }
                                            .padding(horizontal = 10.dp, vertical = 7.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            stringResource(R.string.uninstall).uppercase(Locale.getDefault()),
                                            color = Color(0xFF666666),
                                            fontSize = 11.sp,
                                            maxLines = 1,
                                            modifier = Modifier.fillMaxWidth(),
                                            textAlign = TextAlign.Center
                                        )
                                    }
                                }
                            }
                        } else {
                            Row(
                                modifier = Modifier
                                    .background(Color.White)
                                    .border(1.dp, Color(0x14000000))
                                    .clickable { onCancelInstall() }
                                    .padding(horizontal = 8.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("ОТМЕНА", color = Color(0xFF666666), fontSize = 11.sp, maxLines = 1)
                            }
                        }
                    }
                }
                if (isUnsupportedForCurrentDevice) {
                    LegacyDeviceIncompatibleWarning(message = unsupportedOnDeviceMessage)
                }
            }
            HorizontalDivider(color = Color(0x12000000))
        }
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                DetailsSmallAction(
                    iconRes = R.drawable.ic_menu_market_wishlist,
                    label = if (wishlistSelected) stringResource(R.string.wishlist_remove) else stringResource(R.string.wishlist_add),
                    modifier = Modifier.weight(1f),
                    onClick = onWishlistClick
                )
                DetailsSmallAction(R.drawable.ic_menu_share_holo_dark, tr("Поделиться", "Share"), Modifier.weight(1f))
            }
            HorizontalDivider(color = Color(0x12000000))
        }
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .border(1.dp, Color(0x14000000))
                    .padding(vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 10.dp)
                ) {
                    Text(stringResource(R.string.details_screenshots_title), color = Color(0xFF404040), fontSize = 24.sp, fontWeight = FontWeight.Light)
                    Text(stringResource(R.string.details_screenshots_subtitle), color = Color(0xFF7B7B7B), fontSize = 12.sp)
                }
                if (loadingDetails) {
                    LegacyDetailsScreenshotsSkeleton()
                } else {
                    LazyRow(
                        state = screenshotsListState,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(horizontal = 10.dp)
                    ) {
                        if (hasTrailer) {
                            item {
                                AdaptiveMediaCard(
                                    imageUrl = trailerImage,
                                    height = 180.dp,
                                    defaultRatio = 1.34f,
                                    minRatio = 0.52f,
                                    maxRatio = 1.85f,
                                    onClick = {
                                        if (app.trailerUrl.isNotBlank()) {
                                            uriHandler.openUri(app.trailerUrl)
                                        }
                                    },
                                    showPlay = app.trailerUrl.isNotBlank()
                                )
                            }
                        }
                        items(count = screenshotsVirtualCount) { index ->
                            val screenshotIndex = if (screenshotsOnly.isEmpty()) 0 else index % screenshotsOnly.size
                            val imageUrl = screenshotsOnly.getOrNull(screenshotIndex) ?: return@items
                            AdaptiveMediaCard(
                                imageUrl = imageUrl,
                                height = 180.dp,
                                defaultRatio = 0.58f,
                                minRatio = 0.52f,
                                maxRatio = 1.85f,
                                onClick = {
                                    fullscreenShotIndex = screenshotIndex
                                },
                                showPlay = false
                            )
                        }
                    }
                }
            }
        }
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .border(1.dp, Color(0x14000000))
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = stringResource(R.string.details_description_title),
                    color = Color(0xFF404040),
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Light
                )
                if (loadingDetails) {
                    LegacyDetailsDescriptionSkeleton()
                } else {
                    Text(
                        text = app.subtitle.ifBlank { app.publisher },
                        color = Color(0xFF4D4D4D),
                        fontSize = 13.sp
                    )
                    if (app.updatedAt.isNotBlank()) {
                        Text(
                            text = app.updatedAt,
                            color = Color(0xFF8A8A8A),
                            fontSize = 11.sp
                        )
                    }
                    Text(descriptionText, color = Color(0xFF555555), fontSize = 13.sp)
                }
            }
        }
        if (loadingDetails || whatsNewText.isNotBlank()) {
            item {
                DetailsContentBlock(
                    title = stringResource(R.string.details_whats_new_title),
                    subtitle = if (loadingDetails) null else app.updatedAt.ifBlank { null }
                ) {
                    if (loadingDetails) {
                        LegacyDetailsTextBlockSkeleton(lineCount = 3)
                    } else {
                        Text(whatsNewText, color = Color(0xFF555555), fontSize = 13.sp)
                    }
                }
            }
        }
        item {
            DetailsContentBlock(title = stringResource(R.string.details_info_title)) {
                if (loadingDetails) {
                    LegacyDetailsInfoSkeleton()
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        DetailMetaRow(stringResource(R.string.details_category_label), categoryLabelRu(app.category))
                        DetailMetaRow(stringResource(R.string.details_developer_label), app.publisher)
                        DetailMetaRow(stringResource(R.string.details_age_label), app.contentRating.ifBlank { stringResource(R.string.details_everyone) })
                        if (app.version.isNotBlank()) {
                            DetailMetaRow(stringResource(R.string.details_version_label), app.version)
                        }
                        DetailMetaRow(
                            stringResource(R.string.details_size_label),
                            app.sizeLabel.ifBlank { tr("Неизвестно", "Unknown") }
                        )
                        if (app.requiresAndroid.isNotBlank()) {
                            DetailMetaRow("Android", app.requiresAndroid)
                        }
                    }
                }
            }
        }
        item {
            DetailsContentBlock(
                title = stringResource(R.string.details_reviews_title),
                subtitle = stringResource(R.string.details_reviews_subtitle)
            ) {
                if (loadingDetails) {
                    LegacyReviewsSectionSkeleton()
                } else {
                    LegacyReviewsSection(
                        app = app,
                        apiClient = apiClient,
                        authToken = authToken,
                        isAuthenticated = isAuthenticated,
                        onRequireSignIn = onRequireSignIn
                    )
                }
            }
        }
        if (loadingDetails || similarApps.isNotEmpty()) {
            item {
                DetailsContentBlock(title = stringResource(R.string.details_similar_apps_title)) {
                    if (loadingDetails) {
                        LegacyHorizontalAppsSkeleton()
                    } else {
                        HorizontalAppsRow(similarApps, installedAppsRefreshKey, activeInstallSession, onAppClick)
                    }
                }
            }
        }
        if (loadingDetails || moreFromDeveloper.isNotEmpty()) {
            item { DetailsSectionHeader("Ещё от разработчика", null) }
            item {
                if (loadingDetails) {
                    LegacyHorizontalAppsSkeleton()
                } else {
                    HorizontalAppsRow(moreFromDeveloper, installedAppsRefreshKey, activeInstallSession, onAppClick)
                }
            }
        }
    }
}

@Composable
private fun HeaderDownloadProgressPanel(
    progress: Int,
    stage: String,
    downloadedBytes: Long,
    totalBytes: Long?,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    showCancel: Boolean = true,
    barTrailingOverlap: Dp = 0.dp
) {
    val isPreparing = stage == INSTALL_STAGE_PREPARING
    val isInstalling = stage == INSTALL_STAGE_INSTALLING
    val total = totalBytes?.takeIf { it > 0L }
    val actualProgress = if (total != null) {
        ((downloadedBytes.coerceAtMost(total) * 100L) / total).toInt().coerceIn(0, 100)
    } else {
        progress.coerceIn(-1, 100)
    }
    val bytesLabel = when {
        isInstalling -> tr("Установка...", "Installing...")
        isPreparing -> tr("Подготовка загрузки...", "Preparing download...")
        actualProgress < 0 -> tr("Подготовка загрузки...", "Preparing download...")
        total != null -> "${formatBytesLabel(downloadedBytes)} / ${formatBytesLabel(total)}"
        downloadedBytes > 0L -> formatBytesLabel(downloadedBytes)
        else -> "0 B"
    }
    val progressText = when {
        isInstalling -> ""
        actualProgress < 0 -> tr("Ожидание", "Waiting")
        total != null -> "$actualProgress%"
        else -> tr("Ожидание загрузки...", "Waiting for download...")
    }
    val overlapCompensation = if (barTrailingOverlap > 0.dp) barTrailingOverlap / 2 else 0.dp
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(3.dp),
        horizontalAlignment = Alignment.Start
    ) {
        if (showCancel) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = bytesLabel,
                    color = Color(0xFF8B8B8B),
                    fontSize = 10.sp,
                    maxLines = 1
                )
                Spacer(Modifier.weight(1f))
                Text(
                    text = progressText,
                    color = Color(0xFF8B8B8B),
                    fontSize = 10.sp,
                    maxLines = 1
                )
                Spacer(Modifier.width(6.dp))
                Image(
                    painter = painterResource(R.drawable.ic_menu_close_clear_cancel_light),
                    contentDescription = "Отмена",
                    modifier = Modifier
                        .size(18.dp)
                        .clickable { onCancel() }
                )
            }
        } else {
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val extendedWidth = if (barTrailingOverlap > 0.dp) maxWidth + barTrailingOverlap else maxWidth
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = bytesLabel,
                        color = Color(0xFF8B8B8B),
                        fontSize = 10.sp,
                        maxLines = 1
                    )
                }
                if (progressText.isNotBlank()) {
                    Text(
                        text = progressText,
                        color = Color(0xFF8B8B8B),
                        fontSize = 10.sp,
                        maxLines = 1,
                        textAlign = TextAlign.End,
                        modifier = Modifier
                            .requiredWidth(extendedWidth)
                            .offset(x = overlapCompensation)
                            .align(Alignment.CenterStart)
                    )
                }
            }
        }
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val extendedWidth = if (barTrailingOverlap > 0.dp) maxWidth + barTrailingOverlap else maxWidth
            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.CenterStart
            ) {
                val barModifier = Modifier
                    .requiredWidth(extendedWidth)
                    .offset(x = overlapCompensation)
                    .align(Alignment.CenterStart)
                if (isPreparing || isInstalling || actualProgress < 0 || total == null) {
                    LegacyKitkatWaitingBar(modifier = barModifier)
                } else {
                    LegacyThinProgressBar(progress = actualProgress, modifier = barModifier)
                }
            }
        }
    }
}

private fun formatBytesLabel(bytes: Long): String {
    if (bytes <= 0L) return "0 B"

    val kb = 1024.0
    val mb = kb * 1024.0
    val gb = mb * 1024.0
    val value = bytes.toDouble()

    return when {
        value >= gb -> String.format(Locale.US, "%.2f GB", value / gb)
        value >= mb -> String.format(Locale.US, "%.1f MB", value / mb)
        value >= kb -> String.format(Locale.US, "%.1f KB", value / kb)
        else -> "$bytes B"
    }
}

@Composable
private fun LegacyThinProgressBar(progress: Int, modifier: Modifier = Modifier) {
    val value = (progress.coerceIn(0, 100) / 100f)
    val barHeight = 5.dp
    Box(
        modifier = modifier
            .height(barHeight)
            .background(Color(0xFFD8D8D8))
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(value)
                .fillMaxHeight()
                .align(Alignment.CenterStart)
                .background(Color(0xFF33B5E5))
        )
    }
}

@Composable
private fun LegacyKitkatWaitingBar(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "kitkat_wait")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 750, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "kitkat_phase"
    )
    Box(
        modifier = modifier
            .height(5.dp)
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val segment = size.width * 0.42f
            val gap = size.width * 0.02f
            val pattern = segment + gap
            val y = size.height / 2f
            val stroke = size.height
            val shift = phase * pattern
            var x = -pattern + shift
            while (x < size.width + segment) {
                val startX = x.coerceAtLeast(0f)
                val endX = (x + segment).coerceAtMost(size.width)
                if (endX > startX) {
                    drawLine(
                        color = Color(0xFF33B5E5),
                        start = androidx.compose.ui.geometry.Offset(startX, y),
                        end = androidx.compose.ui.geometry.Offset(endX, y),
                        strokeWidth = stroke,
                        cap = StrokeCap.Butt
                    )
                }
                x += pattern
            }
        }
    }
}

@Composable
private fun FullscreenScreenshotViewer(
    images: List<String>,
    initialIndex: Int,
    onDismiss: () -> Unit
) {
    val pagerState = rememberPagerState(
        initialPage = initialIndex.coerceIn(0, images.lastIndex),
        pageCount = { images.size }
    )
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
            usePlatformDefaultWidth = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
        ) {
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxSize(),
                key = { page -> page }
            ) { page ->
                AsyncImage(
                    model = images[page],
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit,
                    placeholder = painterResource(R.mipmap.ic_menu_play_store),
                    error = painterResource(R.mipmap.ic_menu_play_store),
                    fallback = painterResource(R.mipmap.ic_menu_play_store)
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Image(
                    painter = painterResource(R.drawable.ic_arrow_back_modern),
                    contentDescription = "Назад",
                    modifier = Modifier
                        .size(28.dp)
                        .clickable { onDismiss() }
                )
                Spacer(Modifier.weight(1f))
                Text(
                    text = "${pagerState.currentPage + 1}/${images.size}",
                    color = Color.White,
                    fontSize = 13.sp
                )
            }
        }
    }
}

@Composable
private fun DetailsSmallAction(
    iconRes: Int,
    label: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val actionModifier = if (onClick != null) {
        modifier.clickable { onClick() }
    } else {
        modifier
    }
    Row(
        modifier = actionModifier
            .fillMaxWidth()
            .background(Color(0xFFF8F8F8))
            .border(1.dp, Color(0x12000000))
            .padding(horizontal = 8.dp, vertical = 7.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(Color(0xFF6F6F6F))
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = label,
            color = Color(0xFF666666),
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun LegacyDeviceIncompatibleWarning(message: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .background(Color(0xFFF4E6EC))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            painter = painterResource(R.drawable.ic_menu_warning),
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            colorFilter = ColorFilter.tint(Color(0xFFAF1D55))
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text = message,
            color = Color(0xFFAF1D55),
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun LegacyInstallDialog(
    appName: String,
    appPublisher: String,
    appIconUrl: String,
    priceLabel: String,
    onDismiss: () -> Unit,
    onInstall: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(dismissOnBackPress = true, dismissOnClickOutside = true)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .border(1.dp, Color(0x33000000))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(tr("Установка приложения", "Install application"), color = Color(0xFF333333), fontSize = 18.sp, fontWeight = FontWeight.Normal)
            Row(verticalAlignment = Alignment.CenterVertically) {
                AppIconImage(url = appIconUrl, iconSize = 42.dp, cornerRadius = 6.dp)
                Spacer(Modifier.width(8.dp))
                Text(
                    appName,
                    color = Color(0xFF222222),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Text(appPublisher, color = Color(0xFF7B7B7B), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            InstallDialogInfoRow(
                iconRes = R.drawable.ic_store_credit_card_light,
                text = tr("Цена", "Price") + ": $priceLabel"
            )
            InstallDialogInfoRow(
                iconRes = R.drawable.ic_menu_market_myapps,
                text = tr("Приложение будет установлено на устройство.", "The application will be installed on the device.")
            )
            InstallDialogInfoRow(
                iconRes = R.drawable.ic_menu_warning,
                text = tr("Проверьте подключение к сети перед установкой.", "Check your network connection before installation.")
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Text(
                    tr("ОТМЕНА", "CANCEL"),
                    color = Color(0xFF7F7F7F),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { onDismiss() }.padding(horizontal = 10.dp, vertical = 6.dp)
                )
                Spacer(Modifier.width(6.dp))
                Box(
                    Modifier
                        .background(Color(0xFFB2CB39), RoundedCornerShape(2.dp))
                        .clickable { onInstall() }
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(tr("ПРИНЯТЬ", "ACCEPT"), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun LegacyInstallAuthRequiredDialog(
    appName: String,
    onDismiss: () -> Unit,
    onSignIn: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(dismissOnBackPress = true, dismissOnClickOutside = true)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .border(1.dp, Color(0x33000000))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = tr("Требуется вход", "Sign in required"),
                color = Color(0xFF333333),
                fontSize = 18.sp,
                fontWeight = FontWeight.Normal
            )
            Text(
                text = appName,
                color = Color(0xFF1F1F1F),
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = tr(
                    "Чтобы установить приложение, войдите в аккаунт Google Play.",
                    "To install this app, sign in to your Google Play account."
                ),
                color = Color(0xFF4D4D4D),
                fontSize = 13.sp,
                lineHeight = 17.sp
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Text(
                    tr("ОТМЕНА", "CANCEL"),
                    color = Color(0xFF7F7F7F),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .clickable { onDismiss() }
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                )
                Spacer(Modifier.width(6.dp))
                Box(
                    Modifier
                        .background(Color(0xFFAFCA34), RoundedCornerShape(2.dp))
                        .clickable { onSignIn() }
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        tr("ВОЙТИ", "SIGN IN"),
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
private fun LegacyInstallErrorDialog(
    appName: String,
    message: String,
    onDismiss: () -> Unit,
    showRetry: Boolean = true,
    onRetry: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(dismissOnBackPress = true, dismissOnClickOutside = true)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .border(1.dp, Color(0x33000000))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = tr("Ошибка установки", "Install error"),
                color = Color(0xFF333333),
                fontSize = 18.sp,
                fontWeight = FontWeight.Normal
            )
            Text(
                text = appName,
                color = Color(0xFF1F1F1F),
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = message,
                color = Color(0xFF4D4D4D),
                fontSize = 13.sp,
                lineHeight = 17.sp
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Text(
                    if (showRetry) tr("ОТМЕНА", "CANCEL") else tr("ОК", "OK"),
                    color = Color(0xFF7F7F7F),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .clickable { onDismiss() }
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                )
                if (showRetry) {
                    Spacer(Modifier.width(6.dp))
                    Box(
                        Modifier
                            .background(Color(0xFFAFCA34), RoundedCornerShape(2.dp))
                            .clickable { onRetry() }
                            .padding(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Text(
                            tr("ПОВТОРИТЬ", "RETRY"),
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun InstallDialogInfoRow(iconRes: Int, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Image(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(16.dp)
        )
        Spacer(Modifier.width(7.dp))
        Text(text, color = Color(0xFF666666), fontSize = 12.sp)
    }
}

@Composable
private fun DetailsSectionHeader(title: String, subtitle: String?) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Color.White)
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        Text(title, color = Color(0xFF404040), fontSize = 24.sp, fontWeight = FontWeight.Light)
        if (!subtitle.isNullOrBlank()) {
            Text(subtitle, color = Color(0xFF7B7B7B), fontSize = 12.sp)
        }
    }
}

@Composable
private fun DetailsContentBlock(
    title: String,
    subtitle: String? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .border(1.dp, Color(0x14000000))
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(title, color = Color(0xFF404040), fontSize = 24.sp, fontWeight = FontWeight.Light)
        if (!subtitle.isNullOrBlank()) {
            Text(subtitle, color = Color(0xFF7B7B7B), fontSize = 12.sp)
        }
        content()
    }
}

@Composable
private fun DetailMetaRow(label: String, value: String) {
    val normalizedLabel = label.trim().trimEnd(':')
    val normalizedValue = value
        .lineSequence()
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .joinToString(" ")
        .replace(Regex("\\s+"), " ")
        .trim()
    if (normalizedLabel.isBlank() || normalizedValue.isBlank()) {
        return
    }

    Row(
        Modifier
            .fillMaxWidth()
            .background(Color.White)
            .padding(horizontal = 10.dp, vertical = 2.dp)
    ) {
        Text("$normalizedLabel:", color = Color(0xFF555555), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(8.dp))
        Text(normalizedValue, color = Color(0xFF666666), fontSize = 12.sp)
    }
}

@Composable
private fun rememberSkeletonBrush(): Brush {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val shift by transition.animateFloat(
        initialValue = 0f,
        targetValue = 900f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1150, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "skeletonShift"
    )
    return Brush.linearGradient(
        colors = listOf(
            Color(0xFFE7E7E7),
            Color(0xFFF4F4F4),
            Color(0xFFE1E1E1)
        ),
        start = Offset(shift - 260f, shift - 120f),
        end = Offset(shift, shift + 120f)
    )
}

@Composable
private fun LegacySkeletonBlock(
    modifier: Modifier,
    cornerRadius: Dp = 3.dp
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(cornerRadius))
            .background(rememberSkeletonBrush())
    )
}

@Composable
private fun LegacySkeletonTextLine(
    widthFraction: Float,
    height: Dp = 12.dp,
    modifier: Modifier = Modifier
) {
    LegacySkeletonBlock(
        modifier = modifier
            .fillMaxWidth(widthFraction)
            .height(height)
    )
}

@Composable
private fun LegacySkeletonStarRow(
    count: Int = 5,
    size: Dp = 13.dp
) {
    val transition = rememberInfiniteTransition(label = "skeletonStars")
    val alpha by transition.animateFloat(
        initialValue = 0.28f,
        targetValue = 0.58f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "skeletonStarAlpha"
    )
    Row(verticalAlignment = Alignment.CenterVertically) {
        repeat(count) { index ->
            Image(
                painter = painterResource(R.drawable.ic_skeleton_star),
                contentDescription = null,
                colorFilter = ColorFilter.tint(Color(0xFFCFCFCF)),
                modifier = Modifier
                    .size(size)
                    .graphicsLayer(alpha = alpha)
            )
            if (index < count - 1) {
                Spacer(Modifier.width(2.dp))
            }
        }
    }
}

@Composable
private fun LegacyDetailsScreenshotsSkeleton() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        LegacySkeletonBlock(
            modifier = Modifier
                .weight(1.3f)
                .height(180.dp),
            cornerRadius = 2.dp
        )
        LegacySkeletonBlock(
            modifier = Modifier
                .width(104.dp)
                .height(180.dp),
            cornerRadius = 2.dp
        )
        LegacySkeletonBlock(
            modifier = Modifier
                .width(104.dp)
                .height(180.dp),
            cornerRadius = 2.dp
        )
    }
}

@Composable
private fun LegacyDetailsDescriptionSkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        LegacySkeletonTextLine(widthFraction = 0.48f, height = 12.dp)
        LegacySkeletonTextLine(widthFraction = 0.22f, height = 10.dp)
        LegacyDetailsTextBlockSkeleton(lineCount = 5)
    }
}

@Composable
private fun LegacyDetailsTextBlockSkeleton(
    lineCount: Int,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        repeat(lineCount) { index ->
            val fraction = when (index) {
                lineCount - 1 -> 0.62f
                0 -> 0.96f
                1 -> 0.9f
                else -> 0.98f
            }
            LegacySkeletonTextLine(widthFraction = fraction)
        }
    }
}

@Composable
private fun LegacyDetailsInfoSkeleton() {
    Column {
        repeat(5) { index ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                LegacySkeletonBlock(
                    modifier = Modifier
                        .width(86.dp)
                        .height(12.dp)
                )
                Spacer(Modifier.width(8.dp))
                LegacySkeletonBlock(
                    modifier = Modifier
                        .fillMaxWidth(
                            when (index) {
                                0 -> 0.42f
                                1 -> 0.56f
                                2 -> 0.28f
                                3 -> 0.2f
                                else -> 0.3f
                            }
                        )
                        .height(12.dp)
                )
            }
        }
    }
}

@Composable
private fun LegacyHorizontalAppsSkeleton() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        repeat(4) {
            Column(
                modifier = Modifier.width(98.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                LegacySkeletonBlock(
                    modifier = Modifier
                        .size(88.dp)
                        .clip(RoundedCornerShape(8.dp)),
                    cornerRadius = 8.dp
                )
                LegacySkeletonTextLine(widthFraction = 0.88f, height = 11.dp)
                LegacySkeletonTextLine(widthFraction = 0.56f, height = 10.dp)
                LegacySkeletonStarRow(count = 5, size = 10.dp)
            }
        }
    }
}

@Composable
private fun LegacyReviewsSectionSkeleton() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 10.dp, end = 10.dp, top = 4.dp, bottom = 12.dp),
            verticalAlignment = Alignment.Top
        ) {
            Column(
                modifier = Modifier
                    .width(122.dp)
                    .background(Color(0xFFB2CB39))
                    .padding(1.dp)
            ) {
                LegacySkeletonBlock(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(26.dp),
                    cornerRadius = 0.dp
                )
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    LegacySkeletonBlock(
                        modifier = Modifier
                            .width(54.dp)
                            .height(30.dp)
                    )
                    LegacySkeletonStarRow()
                    LegacySkeletonBlock(
                        modifier = Modifier
                            .width(66.dp)
                            .height(11.dp)
                    )
                }
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 12.dp, top = 4.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                repeat(5) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        LegacySkeletonBlock(
                            modifier = Modifier
                                .width(14.dp)
                                .height(12.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        LegacySkeletonBlock(
                            modifier = Modifier
                                .weight(1f)
                                .height(18.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        LegacySkeletonBlock(
                            modifier = Modifier
                                .width(38.dp)
                                .height(12.dp)
                        )
                    }
                }
            }
        }
        repeat(2) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 10.dp, end = 10.dp, top = 10.dp, bottom = 8.dp),
                verticalAlignment = Alignment.Top
            ) {
                LegacySkeletonBlock(
                    modifier = Modifier.size(36.dp),
                    cornerRadius = 18.dp
                )
                Spacer(Modifier.width(10.dp))
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    LegacySkeletonTextLine(widthFraction = 0.54f, height = 12.dp)
                    LegacySkeletonStarRow()
                    LegacySkeletonTextLine(widthFraction = 0.34f, height = 10.dp)
                    LegacyDetailsTextBlockSkeleton(lineCount = 3)
                }
            }
            HorizontalDivider(
                color = Color(0x12000000),
                modifier = Modifier.padding(horizontal = 10.dp)
            )
        }
    }
}

@Composable
private fun LegacyReviewsSection(
    app: StoreApp,
    apiClient: PlayApiClient,
    authToken: String?,
    isAuthenticated: Boolean,
    onRequireSignIn: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var reviewsPage by remember(app.id, authToken) { mutableStateOf<AppReviewsPage?>(null) }
    var reviewsLoading by remember(app.id, authToken) { mutableStateOf(false) }
    var reviewsLoadingMore by remember(app.id, authToken) { mutableStateOf(false) }
    var reviewsSubmitting by remember(app.id, authToken) { mutableStateOf(false) }
    var reviewsError by remember(app.id, authToken) { mutableStateOf<String?>(null) }
    var formMessage by remember(app.id, authToken) { mutableStateOf<String?>(null) }
    var ratingDraft by rememberSaveable(app.id, authToken) { mutableIntStateOf(0) }
    var titleDraft by rememberSaveable(app.id, authToken) { mutableStateOf("") }
    var textDraft by rememberSaveable(app.id, authToken) { mutableStateOf("") }
    var formInitialized by remember(app.id, authToken) { mutableStateOf(false) }

    fun syncFormFromReview(review: AppReview?) {
        ratingDraft = review?.rating ?: 0
        titleDraft = review?.title.orEmpty()
        textDraft = review?.text.orEmpty()
        formInitialized = true
    }

    suspend fun loadReviewsPage(offset: Int, append: Boolean) {
        if (append) {
            reviewsLoadingMore = true
        } else {
            reviewsLoading = true
        }
        runCatching {
            withContext(Dispatchers.IO) {
                apiClient.readReviews(
                    appId = app.id,
                    offset = offset,
                    limit = 5,
                    authToken = authToken
                )
            }
        }.onSuccess { page ->
            val mergedPage = if (append && reviewsPage != null) {
                mergeReviewPages(reviewsPage!!, page)
            } else {
                page
            }
            reviewsPage = mergedPage
            reviewsError = null
            if (isAuthenticated && !formInitialized) {
                syncFormFromReview(mergedPage.myReview)
            }
        }.onFailure {
            reviewsError = it.message
        }
        if (append) {
            reviewsLoadingMore = false
        } else {
            reviewsLoading = false
        }
    }

    LaunchedEffect(app.id, authToken) {
        formMessage = null
        formInitialized = false
        loadReviewsPage(offset = 0, append = false)
    }

    val totalReviews = reviewsPage?.totalReviews ?: app.reviews
    val averageRating = reviewsPage?.averageRating?.takeIf { it > 0f }
        ?: app.ratingValue.takeIf { it > 0f }
        ?: derivedAverageRating(totalReviews)
    val histogramRows = remember(reviewsPage?.histogram, totalReviews, averageRating) {
        val liveHistogram = reviewsPage?.histogram.orEmpty()
        if (liveHistogram.isNotEmpty()) {
            buildReviewHistogramRows(liveHistogram)
        } else {
            buildSyntheticReviewHistogramRows(totalReviews, averageRating)
        }
    }
    val ratingCountLabel = formatReviewCountLabel(totalReviews)
    val loadedReviews = reviewsPage?.items
        .orEmpty()
        .filterNot { review ->
            isAuthenticated && review.id == reviewsPage?.myReview?.id
        }
    val hasVisibleReviews = loadedReviews.isNotEmpty()
    val hasAnyReviews = totalReviews > 0L

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
    ) {
        LegacyReviewSummaryPanel(
            averageRating = averageRating,
            ratingCountLabel = ratingCountLabel,
            histogramRows = histogramRows
        )
        if (isAuthenticated) {
            LegacyReviewEditor(
                hasExistingReview = reviewsPage?.myReview != null,
                rating = ratingDraft,
                title = titleDraft,
                text = textDraft,
                submitting = reviewsSubmitting,
                message = formMessage,
                onRatingChange = {
                    ratingDraft = it
                    formMessage = null
                },
                onTitleChange = {
                    titleDraft = it
                    formMessage = null
                },
                onTextChange = {
                    textDraft = it
                    formMessage = null
                },
                onSubmit = {
                    val token = authToken.orEmpty()
                    if (token.isBlank()) {
                        onRequireSignIn()
                        return@LegacyReviewEditor
                    }
                    when {
                        ratingDraft <= 0 -> {
                            formMessage = tr("Поставьте оценку от 1 до 5.", "Choose a rating from 1 to 5.")
                        }
                        textDraft.isBlank() -> {
                            formMessage = tr("Введите текст отзыва.", "Enter review text.")
                        }
                        else -> {
                            scope.launch {
                                reviewsSubmitting = true
                                runCatching {
                                    withContext(Dispatchers.IO) {
                                        apiClient.submitReview(
                                            token = token,
                                            appId = app.id,
                                            rating = ratingDraft,
                                            title = titleDraft.trim(),
                                            text = textDraft.trim(),
                                            appVersion = app.version,
                                            deviceLabel = Build.MODEL.orEmpty()
                                        )
                                    }
                                }.onSuccess { page ->
                                    reviewsPage = page
                                    syncFormFromReview(page.myReview)
                                    reviewsError = null
                                    formMessage = tr("Отзыв сохранен.", "Review saved.")
                                }.onFailure {
                                    formMessage = it.message
                                }
                                reviewsSubmitting = false
                            }
                        }
                    }
                }
            )
        }
        if (reviewsLoading && reviewsPage == null) {
            LegacyReviewsSectionSkeleton()
        } else {
            if (!reviewsError.isNullOrBlank() && reviewsPage == null) {
                LegacyReviewsInfoMessage(
                    text = tr("Не удалось загрузить отзывы.", "Could not load reviews."),
                    actionLabel = tr("Повторить", "Retry")
                ) {
                    scope.launch { loadReviewsPage(offset = 0, append = false) }
                }
            } else if (!hasAnyReviews) {
                LegacyReviewsEmptyState(
                    isAuthenticated = isAuthenticated,
                    onRequireSignIn = onRequireSignIn
                )
            } else {
                if (hasVisibleReviews) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp)
                    ) {
                        loadedReviews.forEach { review ->
                            LegacyReviewListItem(review)
                        }
                    }
                }
                if (!reviewsError.isNullOrBlank() && reviewsPage != null) {
                    Text(
                        text = reviewsError!!,
                        color = Color(0xFFC14F42),
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                    )
                }
                if (reviewsLoadingMore) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        LegacyPlayLoadingSpinner(size = 18.dp)
                    }
                } else if (reviewsPage?.hasMore == true) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 10.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.End
                    ) {
                        LegacyInlineActionButton(
                            label = tr("ЕЩЕ ОТЗЫВЫ", "MORE REVIEWS"),
                            enabled = true
                        ) {
                            scope.launch {
                                loadReviewsPage(
                                    offset = reviewsPage?.items?.size ?: 0,
                                    append = true
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LegacyReviewSummaryPanel(
    averageRating: Float,
    ratingCountLabel: String,
    histogramRows: List<ReviewHistogramRow>
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .padding(start = 10.dp, end = 10.dp, top = 4.dp, bottom = 12.dp),
        verticalAlignment = Alignment.Top
    ) {
        Column(
            modifier = Modifier
                .width(122.dp)
                .background(Color(0xFFB2CB39))
                .padding(1.dp)
        ) {
            Text(
                text = tr("СРЕДНЯЯ ОЦЕНКА", "AVERAGE RATING"),
                color = Color.White,
                fontSize = 11.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 5.dp),
                textAlign = TextAlign.Center
            )
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = formatAverageRating(averageRating),
                    color = Color(0xFF666666),
                    fontSize = 30.sp,
                    fontWeight = FontWeight.Bold
                )
                LegacySmallRatingBar(
                    rating = averageRating,
                    modifier = Modifier.padding(top = 2.dp)
                )
                Text(
                    text = ratingCountLabel,
                    color = Color(0xFF7D7D7D),
                    fontSize = 11.sp,
                    modifier = Modifier.padding(top = 4.dp),
                    textAlign = TextAlign.Center
                )
            }
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 12.dp, top = 4.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            histogramRows.forEach { row ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = row.stars.toString(),
                        color = Color(0xFF6F6F6F),
                        fontSize = 11.sp,
                        modifier = Modifier.width(14.dp)
                    )
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(18.dp)
                            .padding(vertical = 1.dp)
                            .background(Color(0xFFD9D9D9))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(row.fill)
                                .fillMaxHeight()
                                .background(row.barColor)
                        )
                    }
                    Text(
                        text = row.countLabel,
                        color = Color(0xFF7D7D7D),
                        fontSize = 11.sp,
                        modifier = Modifier
                            .width(54.dp)
                            .padding(start = 8.dp),
                        textAlign = TextAlign.End
                    )
                }
            }
        }
    }
}

@Composable
private fun LegacyReviewEditor(
    hasExistingReview: Boolean,
    rating: Int,
    title: String,
    text: String,
    submitting: Boolean,
    message: String?,
    onRatingChange: (Int) -> Unit,
    onTitleChange: (String) -> Unit,
    onTextChange: (String) -> Unit,
    onSubmit: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp)
            .background(Color(0xFFF7F7F7))
            .border(1.dp, Color(0x12000000))
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = tr("МОЯ ОЦЕНКА", "MY RATING"),
                color = Color(0xFF4D4D4D),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.weight(1f))
            LegacyEditableRatingBar(
                rating = rating,
                enabled = !submitting,
                onRatingChange = onRatingChange
            )
        }
        LegacyReviewInput(
            value = title,
            onValueChange = onTitleChange,
            placeholder = tr("Заголовок отзыва", "Review title"),
            singleLine = true,
            enabled = !submitting
        )
        LegacyReviewInput(
            value = text,
            onValueChange = onTextChange,
            placeholder = tr("Поделитесь впечатлениями о приложении", "Share your thoughts about this app"),
            singleLine = false,
            enabled = !submitting,
            minHeight = 92.dp
        )
        if (!message.isNullOrBlank()) {
            Text(
                text = message,
                color = if (message.contains("saved", ignoreCase = true) || message.contains("сохран", ignoreCase = true)) {
                    Color(0xFF7A8F22)
                } else {
                    Color(0xFFC14F42)
                },
                fontSize = 11.sp
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End
        ) {
            LegacyInlineActionButton(
                label = if (submitting) {
                    tr("СОХРАНЕНИЕ…", "SAVING…")
                } else if (hasExistingReview) {
                    tr("ОБНОВИТЬ", "UPDATE")
                } else {
                    tr("ОПУБЛИКОВАТЬ", "POST")
                },
                enabled = !submitting
            ) {
                onSubmit()
            }
        }
    }
}

@Composable
private fun LegacyReviewInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    singleLine: Boolean,
    enabled: Boolean,
    minHeight: Dp = 40.dp
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = minHeight)
            .background(Color.White)
            .border(1.dp, Color(0x22000000))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            singleLine = singleLine,
            textStyle = TextStyle(
                color = Color(0xFF333333),
                fontSize = 13.sp,
                lineHeight = 18.sp
            ),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Sentences,
                autoCorrectEnabled = true,
                keyboardType = KeyboardType.Text,
                imeAction = if (singleLine) ImeAction.Next else ImeAction.Default
            ),
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { innerTextField ->
                if (value.isBlank()) {
                    Text(
                        text = placeholder,
                        color = Color(0xFF9A9A9A),
                        fontSize = 13.sp
                    )
                }
                innerTextField()
            }
        )
    }
}

@Composable
private fun LegacyEditableRatingBar(
    rating: Int,
    enabled: Boolean,
    onRatingChange: (Int) -> Unit
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        repeat(5) { index ->
            Image(
                painter = painterResource(
                    if (index < rating.coerceIn(0, 5)) {
                        R.drawable.ic_rating_star_active
                    } else {
                        R.drawable.ic_rating_star_inactive
                    }
                ),
                contentDescription = null,
                modifier = Modifier
                    .size(20.dp)
                    .clickable(enabled = enabled) { onRatingChange(index + 1) }
            )
            if (index < 4) {
                Spacer(Modifier.width(2.dp))
            }
        }
    }
}

@Composable
private fun LegacyReviewsEmptyState(
    isAuthenticated: Boolean,
    onRequireSignIn: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = tr("Пока нет отзывов.", "No reviews yet."),
            color = Color(0xFF666666),
            fontSize = 13.sp
        )
        if (!isAuthenticated) {
            Text(
                text = tr("Войдите, чтобы оставить первый отзыв.", "Sign in to leave the first review."),
                color = Color(0xFF3B78B6),
                fontSize = 13.sp,
                modifier = Modifier.clickable { onRequireSignIn() }
            )
        }
    }
}

@Composable
private fun LegacyReviewsInfoMessage(
    text: String,
    actionLabel: String,
    onAction: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = text,
            color = Color(0xFF666666),
            fontSize = 13.sp
        )
        Text(
            text = actionLabel,
            color = Color(0xFF3B78B6),
            fontSize = 13.sp,
            modifier = Modifier.clickable { onAction() }
        )
    }
}

@Composable
private fun LegacyReviewListItem(review: AppReview) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 10.dp, end = 10.dp, top = 10.dp, bottom = 8.dp),
        verticalAlignment = Alignment.Top
    ) {
        LegacyReviewAvatar(authorName = review.authorName)
        Spacer(Modifier.width(10.dp))
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            if (review.title.isNotBlank()) {
                Text(
                    text = review.title,
                    color = Color(0xFF3F3F3F),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                LegacySmallRatingBar(rating = review.rating.toFloat())
                Spacer(Modifier.width(6.dp))
                Text(
                    text = review.authorName,
                    color = Color(0xFF4E4E4E),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                val reviewDate = formatReviewDateLabel(review.updatedAt.ifBlank { review.createdAt })
                if (reviewDate.isNotBlank()) {
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = reviewDate,
                        color = Color(0xFF8A8A8A),
                        fontSize = 11.sp,
                        maxLines = 1
                    )
                }
            }
            val metadata = buildReviewMetadataLabel(review)
            if (metadata.isNotBlank()) {
                Text(
                    text = metadata,
                    color = Color(0xFF8E8E8E),
                    fontSize = 10.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Text(
                text = review.text,
                color = Color(0xFF5A5A5A),
                fontSize = 13.sp,
                lineHeight = 18.sp
            )
        }
    }
    HorizontalDivider(
        color = Color(0x12000000),
        modifier = Modifier.padding(horizontal = 10.dp)
    )
}

@Composable
private fun LegacyReviewAvatar(authorName: String) {
    val initials = remember(authorName) { reviewInitials(authorName) }
    Box(
        modifier = Modifier
            .size(36.dp)
            .background(Color(0xFFD6E097), RoundedCornerShape(18.dp)),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = initials,
            color = Color(0xFF5A6620),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun LegacyInlineActionButton(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .background(if (enabled) Color(0xFFD0D83A) else Color(0xFFD8D8D8))
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 10.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

internal data class ReviewHistogramRow(
    val stars: Int,
    val fill: Float,
    val countLabel: String,
    val barColor: Color
)

@Composable
private fun LegacySmallRatingBar(rating: Float, modifier: Modifier = Modifier) {
    LegacyStarIcons(
        rating = rating,
        modifier = modifier,
        iconSize = 12.dp,
        spacing = 1.dp
    )
}

@Composable
internal fun LegacyStarText(rating: Float, modifier: Modifier = Modifier) {
    LegacyStarIcons(
        rating = rating,
        modifier = modifier,
        iconSize = 10.dp,
        spacing = 1.dp
    )
}

@Composable
private fun LegacyStarIcons(
    rating: Float,
    modifier: Modifier = Modifier,
    iconSize: Dp = 10.dp,
    spacing: Dp = 1.dp
) {
    val activeStars = kotlin.math.round(rating.coerceIn(0f, 5f)).toInt()
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        repeat(5) { index ->
            Image(
                painter = painterResource(if (index < activeStars) R.drawable.star_active else R.drawable.star_no_active),
                contentDescription = null,
                modifier = Modifier.size(iconSize)
            )
            if (index < 4) {
                Spacer(Modifier.width(spacing))
            }
        }
    }
}
