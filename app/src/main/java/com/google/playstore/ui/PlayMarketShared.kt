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

internal fun ratingForCard(app: StoreApp): Float = app.ratingValue.takeIf { it > 0f } ?: derivedAverageRating(app.reviews)

internal fun buildMediaProxyUrl(rawUrl: String): String {
    val value = rawUrl.trim()
    if (value.isBlank()) return ""
    val base = BuildConfig.PLAY_API_BASE_URL.trim().trimEnd('/')
    if (base.isBlank()) return ""
    return "$base/media?url=${Uri.encode(value)}"
}

@Composable
internal fun ResilientAsyncImage(
    imageUrl: String,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    contentScale: ContentScale = ContentScale.Crop,
    placeholder: Painter? = null,
    error: Painter? = null,
    fallback: Painter? = null,
    onSuccess: ((AsyncImagePainter.State.Success) -> Unit)? = null
) {
    val primaryUrl = imageUrl.trim()
    val proxyUrl = remember(primaryUrl) { buildMediaProxyUrl(primaryUrl) }
    var currentUrl by remember(primaryUrl) { mutableStateOf(primaryUrl) }
    var proxyTried by remember(primaryUrl) { mutableStateOf(false) }

    AsyncImage(
        model = currentUrl,
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = contentScale,
        placeholder = placeholder,
        error = error,
        fallback = fallback,
        onError = {
            if (
                !proxyTried &&
                primaryUrl.isNotBlank() &&
                proxyUrl.isNotBlank() &&
                proxyUrl != primaryUrl
            ) {
                proxyTried = true
                currentUrl = proxyUrl
            }
        },
        onSuccess = { state -> onSuccess?.invoke(state) }
    )
}

@Composable
internal fun AdaptiveMediaCard(
    imageUrl: String,
    height: Dp,
    defaultRatio: Float,
    minRatio: Float,
    maxRatio: Float,
    onClick: (() -> Unit)? = null,
    showPlay: Boolean = false
) {
    var ratio by remember(imageUrl) { mutableStateOf(defaultRatio) }
    val width = (height.value * ratio.coerceIn(minRatio, maxRatio)).dp
    Box(
        modifier = Modifier.width(width).height(height).background(Color.White).border(1.dp, Color(0x1A000000))
            .let { base -> if (onClick != null) base.clickable { onClick() } else base },
        contentAlignment = Alignment.Center
    ) {
        ResilientAsyncImage(
            imageUrl = imageUrl,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
            placeholder = painterResource(R.mipmap.ic_menu_play_store),
            error = painterResource(R.mipmap.ic_menu_play_store),
            fallback = painterResource(R.mipmap.ic_menu_play_store),
            onSuccess = { state: AsyncImagePainter.State.Success ->
                val d = state.result.drawable
                if (d.intrinsicWidth > 0 && d.intrinsicHeight > 0) {
                    ratio = d.intrinsicWidth.toFloat() / d.intrinsicHeight.toFloat()
                }
            }
        )
        if (showPlay) {
            Box(Modifier.background(Color(0xAA000000), RoundedCornerShape(999.dp)).padding(horizontal = 10.dp, vertical = 4.dp)) {
                Text("\u25b6", color = Color.White, fontSize = 18.sp)
            }
        }
    }
}

@Composable
internal fun SmallCategoryCard(text: String, iconRes: Int, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .height(58.dp)
            .background(Color.White)
            .border(1.dp, Color(0x12000000))
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(Color(0xFFB2CB39))
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text,
            color = Color(0xFF444444),
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
internal fun SectionRow(title: String, showMore: Boolean = true) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Color.White)
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, color = Color(0xFF484848), fontSize = 24.sp, fontWeight = FontWeight.Light)
        Spacer(Modifier.weight(1f))
        if (showMore) {
            Box(Modifier.background(Color(0xFFD0D83A)).padding(horizontal = 8.dp, vertical = 2.dp)) {
                Text("ЕЩЕ", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
internal fun HorizontalAppsRow(
    apps: List<StoreApp>,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    onAppClick: (StoreApp) -> Unit
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(horizontal = 8.dp)
    ) {
        items(apps) { app -> LegacyAppTile(app, installedAppsRefreshKey, activeInstallSession) { onAppClick(app) } }
    }
}

@Composable
internal fun LegacyAppTile(
    app: StoreApp,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    onClick: () -> Unit
) {
    val isInstalledOnDevice = rememberAppInstalledState(app.id, installedAppsRefreshKey)
    val statusUi = appCardStatusUi(app, isInstalledOnDevice, activeInstallSession)
    val interactionSource = remember { MutableInteractionSource() }
    val hovered by interactionSource.collectIsHoveredAsState()
    val pressed by interactionSource.collectIsPressedAsState()
    val topBg = if (hovered || pressed) Color(0xFFC7C7C7) else Color.Transparent

    Column(
        modifier = Modifier
            .width(148.dp)
            .background(Color(0xFFFBFBFB))
            .clickable(interactionSource = interactionSource, indication = null) { onClick() }
            .hoverable(interactionSource = interactionSource),
        horizontalAlignment = Alignment.Start
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(topBg)
                .padding(8.dp),
            horizontalAlignment = Alignment.Start
        ) {
            Box(
                Modifier
                    .size(126.dp)
                    .clip(RoundedCornerShape(2.dp)),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    Modifier
                        .size(116.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.Transparent),
                    contentAlignment = Alignment.Center
                ) {
                    AppIconImage(app.iconUrl, 116.dp, cornerRadius = 12.dp)
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        Column(
            modifier = Modifier.padding(start = 8.dp, end = 8.dp, bottom = 8.dp),
            horizontalAlignment = Alignment.Start
        ) {
            Text(app.name, color = Color(0xFF555555), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(1.dp))
            Text(app.publisher, color = Color(0xFF999999), fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                LegacyStarText(
                    rating = app.ratingValue.takeIf { it > 0f } ?: derivedAverageRating(app.reviews),
                    modifier = Modifier
                )
                Spacer(Modifier.weight(1f))
                Text(
                    statusUi.label,
                    color = Color(0xFF96B62A),
                    fontSize = if (statusUi.compact) 9.sp else 11.sp,
                    textAlign = TextAlign.End,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
internal fun CompactListItem(
    app: StoreApp,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    onClick: () -> Unit
) {
    val isInstalledOnDevice = rememberAppInstalledState(app.id, installedAppsRefreshKey)
    val statusUi = appCardStatusUi(app, isInstalledOnDevice, activeInstallSession)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .background(Color.White)
            .clickable { onClick() }
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(58.dp)
                .background(Color.White)
                .clip(RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center
        ) {
            AppIconImage(app.iconUrl, 40.dp)
        }
        Column(Modifier.weight(1f).padding(start = 8.dp, end = 8.dp)) {
            Text(app.name, color = Color(0xFF333333), fontSize = 18.sp, maxLines = 1, fontWeight = FontWeight.Light)
            Text(app.publisher, color = Color(0xFF888888), fontSize = 12.sp, maxLines = 1)
            LegacyStarText(rating = ratingForCard(app))
        }
        Text(
            statusUi.label,
            color = Color(0xFF96B62A),
            fontSize = if (statusUi.compact) 10.sp else 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
    HorizontalDivider(color = Color(0x12000000), modifier = Modifier.padding(start = 76.dp))
}

@Composable
internal fun CompactListItemSkeleton() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .background(Color.White)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(58.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(Color(0xFFDADADA))
        )
        Column(Modifier.weight(1f).padding(start = 8.dp, end = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.fillMaxWidth(0.75f).height(14.dp).background(Color(0xFFE1E1E1), RoundedCornerShape(2.dp)))
            Box(Modifier.fillMaxWidth(0.55f).height(12.dp).background(Color(0xFFE8E8E8), RoundedCornerShape(2.dp)))
            Box(Modifier.fillMaxWidth(0.35f).height(10.dp).background(Color(0xFFEDEDED), RoundedCornerShape(2.dp)))
        }
        Box(Modifier.width(38.dp).height(12.dp).background(Color(0xFFE5E5E5), RoundedCornerShape(2.dp)))
    }
}

@Composable
internal fun LoadMoreTrigger(onLoadMore: () -> Unit) {
    LaunchedEffect(Unit) { onLoadMore() }
    Box(modifier = Modifier.fillMaxWidth().height(1.dp))
}

@Composable
internal fun AppIconImage(url: String, iconSize: Dp, cornerRadius: Dp = 9.dp) {
    val clippedModifier = Modifier.size(iconSize).clip(RoundedCornerShape(cornerRadius))
    if (url.isBlank()) {
        Image(
            painter = painterResource(R.mipmap.ic_menu_play_store),
            contentDescription = null,
            modifier = clippedModifier
        )
        return
    }

    var loaded by remember(url) { mutableStateOf(false) }

    Box(modifier = clippedModifier) {
        if (!loaded) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFFD8D8D8))
            )
        }
        ResilientAsyncImage(
            imageUrl = url,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
            placeholder = painterResource(R.mipmap.ic_menu_play_store),
            error = painterResource(R.mipmap.ic_menu_play_store),
            fallback = painterResource(R.mipmap.ic_menu_play_store),
            onSuccess = { loaded = true }
        )
    }
}

@Composable
internal fun LegacyPlayLoadingSpinner(
    size: Dp
) {
    AndroidView(
        modifier = Modifier.size(size),
        factory = { context ->
            ProgressBar(
                ContextThemeWrapper(context, android.R.style.Theme_Holo_Light),
                null,
                android.R.attr.progressBarStyleSmall
            ).apply {
                isIndeterminate = true
            }
        }
    )
}

internal fun priceLabelForUi(app: StoreApp): String {
    if (app.isFree) return tr("БЕСПЛАТНО", "FREE")
    val raw = app.priceRaw.trim()
    return when {
        raw.startsWith("USD ", ignoreCase = true) -> "$" + raw.substring(4).trim()
        raw.equals("USD", ignoreCase = true) -> "$"
        raw.isBlank() -> tr("ПЛАТНО", "PAID")
        else -> raw
    }
}

@Composable
internal fun rememberAppInstalledState(packageName: String, installedAppsRefreshKey: Int): Boolean {
    val context = LocalContext.current
    return remember(context, packageName, installedAppsRefreshKey) {
        isAppInstalledOnDevice(context, packageName)
    }
}

internal data class AppCardStatusUi(
    val label: String,
    val compact: Boolean
)

internal fun appCardStatusUi(
    app: StoreApp,
    isInstalledOnDevice: Boolean,
    activeInstallSession: InstallSessionState?
): AppCardStatusUi {
    val activeStage = activeInstallSession
        ?.takeIf { it.packageId == app.id && it.errorMessage.isNullOrBlank() }
        ?.stage

    return when (activeStage) {
        INSTALL_STAGE_PREPARING,
        INSTALL_STAGE_DOWNLOADING -> AppCardStatusUi(
            label = tr("ЗАГРУЗКА…", "DOWNLOADING…"),
            compact = true
        )
        INSTALL_STAGE_INSTALLING -> AppCardStatusUi(
            label = tr("УСТАНОВКА…", "INSTALLING…"),
            compact = true
        )
        else -> if (isInstalledOnDevice) {
            AppCardStatusUi(
                label = tr("УСТАНОВЛЕНО", "INSTALLED"),
                compact = true
            )
        } else {
            AppCardStatusUi(
                label = priceLabelForUi(app),
                compact = false
            )
        }
    }
}

internal fun isAppInstalledOnDevice(context: android.content.Context, packageName: String): Boolean {
    if (packageName.isBlank()) return false
    val packageManager = context.packageManager
    if (packageManager.getLaunchIntentForPackage(packageName) != null) return true
    return runCatching { packageManager.getPackageInfo(packageName, 0) }.isSuccess
}

internal fun displayNameFromEmail(email: String): String {
    val local = email.substringBefore('@').trim()
    if (local.isBlank()) return email
    return local
        .replace('.', ' ')
        .replace('_', ' ')
        .split(' ')
        .filter { it.isNotBlank() }
        .joinToString(" ") { part ->
            part.lowercase().replaceFirstChar { ch ->
                if (ch.isLowerCase()) ch.titlecase(Locale.getDefault()) else ch.toString()
            }
        }
        .ifBlank { email }
}

internal fun starsByRating(rating: Float, reviews: Long): String {
    if (rating > 0f) {
        val rounded = kotlin.math.round(rating * 10f) / 10f
        return "$rounded \u2605"
    }
    return starsByReviews(reviews)
}

internal fun localizeSectionTitle(title: String): String {
    return when (title.trim()) {
        "Top Free" -> tr("Топ бесплатных", "Top Free")
        "Top Free Apps" -> tr("Топ бесплатных", "Top Free Apps")
        "Top Paid" -> "Топ платных"
        "Top Paid Apps" -> "Топ платных"
        "Top Grossing" -> "Самые кассовые"
        "Top New Paid" -> "Новые платные"
        "Top New Free" -> "Новые бесплатные"
        "Editors' Choice" -> tr("Выбор редакции", "Editors' Choice")
        "Editor's Choice" -> tr("Выбор редакции", "Editor's Choice")
        "Games" -> "Игры"
        "Our Favorites" -> "Наш выбор"
        "Recommended" -> "Рекомендуем"
        else -> title
    }
}

internal fun derivedAverageRating(reviews: Long): Float {
    return when {
        reviews >= 500_000 -> 4.8f
        reviews >= 100_000 -> 4.6f
        reviews >= 20_000 -> 4.3f
        reviews >= 5_000 -> 4.0f
        reviews > 0 -> 3.6f
        else -> 0f
    }
}

internal fun formatAverageRating(rating: Float): String {
    if (rating <= 0f) return "0.0"
    val rounded = kotlin.math.round(rating * 10f) / 10f
    return String.format(Locale.US, "%.1f", rounded)
}

internal fun buildReviewHistogramRows(histogram: List<ReviewHistogramEntry>): List<ReviewHistogramRow> {
    val countsByStars = histogram.associate { it.stars to it.count.coerceAtLeast(0L) }
    val maxCount = countsByStars.values.maxOrNull()?.coerceAtLeast(1L) ?: 1L
    val colors = listOf(
        Color(0xFF9FC34D),
        Color(0xFFB7BE54),
        Color(0xFFD4A34A),
        Color(0xFFD18F4A),
        Color(0xFFD36B4B)
    )
    return listOf(5, 4, 3, 2, 1).mapIndexed { index, stars ->
        val count = countsByStars[stars] ?: 0L
        ReviewHistogramRow(
            stars = stars,
            fill = if (count <= 0L) 0f else count.toFloat() / maxCount.toFloat(),
            countLabel = count.toString(),
            barColor = colors[index]
        )
    }
}

internal fun buildSyntheticReviewHistogramRows(reviews: Long, rating: Float): List<ReviewHistogramRow> {
    val total = reviews.coerceAtLeast(1L).toFloat()
    val ratios = when {
        rating >= 4.7f -> listOf(0.62f, 0.20f, 0.10f, 0.05f, 0.03f)
        rating >= 4.4f -> listOf(0.54f, 0.23f, 0.12f, 0.07f, 0.04f)
        rating >= 4.0f -> listOf(0.44f, 0.25f, 0.16f, 0.09f, 0.06f)
        rating > 0f -> listOf(0.30f, 0.24f, 0.20f, 0.14f, 0.12f)
        else -> listOf(0f, 0f, 0f, 0f, 0f)
    }
    val colors = listOf(
        Color(0xFF9FC34D),
        Color(0xFFB7BE54),
        Color(0xFFD4A34A),
        Color(0xFFD18F4A),
        Color(0xFFD36B4B)
    )
    val maxRatio = ratios.maxOrNull()?.coerceAtLeast(0.01f) ?: 1f
    return listOf(5, 4, 3, 2, 1).mapIndexed { index, stars ->
        val ratio = ratios[index]
        val count = if (reviews <= 0L) 0L else (total * ratio).toLong().coerceAtLeast(1L)
        ReviewHistogramRow(
            stars = stars,
            fill = (ratio / maxRatio).coerceIn(0f, 1f),
            countLabel = count.toString(),
            barColor = colors[index]
        )
    }
}

internal fun formatReviewCountLabel(count: Long): String {
    if (count <= 0L) {
        return tr("Нет отзывов", "No reviews")
    }
    return if (Locale.getDefault().language.lowercase().startsWith("ru")) {
        val mod10 = count % 10
        val mod100 = count % 100
        when {
            mod10 == 1L && mod100 != 11L -> "$count отзыв"
            mod10 in 2L..4L && mod100 !in 12L..14L -> "$count отзыва"
            else -> "$count отзывов"
        }
    } else {
        if (count == 1L) "1 review" else "$count reviews"
    }
}

internal fun mergeReviewPages(
    existing: AppReviewsPage,
    incoming: AppReviewsPage
): AppReviewsPage {
    val mergedItems = buildList {
        addAll(existing.items)
        incoming.items.forEach { review ->
            if (none { it.id == review.id }) add(review)
        }
    }
    return incoming.copy(items = mergedItems)
}

internal fun buildReviewMetadataLabel(review: AppReview): String {
    return buildList {
        if (review.mine) add(tr("Ваш отзыв", "Your review"))
        if (review.appVersion.isNotBlank()) add(tr("Версия ${review.appVersion}", "Version ${review.appVersion}"))
        if (review.deviceLabel.isNotBlank()) add(review.deviceLabel)
    }.joinToString(" \u2022 ")
}

internal fun reviewInitials(authorName: String): String {
    val parts = authorName
        .split(' ')
        .map { it.trim() }
        .filter { it.isNotBlank() }
    if (parts.isEmpty()) return "?"
    return parts
        .take(2)
        .joinToString("") { it.take(1).uppercase(Locale.getDefault()) }
}

internal fun formatReviewDateLabel(raw: String): String {
    if (raw.isBlank()) return ""
    val patterns = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd"
    )
    val parsed = patterns.firstNotNullOfOrNull { pattern ->
        runCatching {
            SimpleDateFormat(pattern, Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
                isLenient = false
            }.parse(raw)
        }.getOrNull()
    } ?: return raw
    return SimpleDateFormat("d MMM yyyy", Locale.getDefault()).format(parsed)
}

internal fun categoryLabelRu(raw: String): String {
    val key = raw.trim().uppercase()
    if (key.isBlank()) return ""

    val direct = mapOf(
        "GAME_ACTION" to tr("Игры: Экшен", "Games: Action"),
        "GAME_ARCADE" to tr("Игры: Аркады", "Games: Arcade"),
        "GAME_ADVENTURE" to tr("Игры: Приключения", "Games: Adventure"),
        "GAME_CASUAL" to tr("Игры: Казуальные", "Games: Casual"),
        "GAME_CARD" to tr("Игры: Карточные", "Games: Card"),
        "GAME_CASINO" to tr("Игры: Казино", "Games: Casino"),
        "GAME_MUSIC" to tr("Игры: Музыкальные", "Games: Music"),
        "GAME_PUZZLE" to tr("Игры: Головоломки", "Games: Puzzle"),
        "GAME_RACING" to tr("Игры: Гонки", "Games: Racing"),
        "GAME_ROLE_PLAYING" to tr("Игры: Ролевые", "Games: Role Playing"),
        "GAME_SIMULATION" to tr("Игры: Симуляторы", "Games: Simulation"),
        "GAME_SPORTS" to tr("Игры: Спорт", "Games: Sports"),
        "GAME_STRATEGY" to tr("Игры: Стратегии", "Games: Strategy"),
        "GAME_TRIVIA" to tr("Игры: Викторины", "Games: Trivia"),
        "GAME_WORD" to tr("Игры: Слова", "Games: Word"),
        "PRODUCTIVITY" to tr("Продуктивность", "Productivity"),
        "COMMUNICATION" to tr("Связь", "Communication"),
        "SOCIAL" to tr("Социальные", "Social"),
        "SHOPPING" to tr("Покупки", "Shopping"),
        "TOOLS" to tr("Инструменты", "Tools"),
        "EDUCATION" to tr("Образование", "Education"),
        "BUSINESS" to tr("Бизнес", "Business"),
        "FINANCE" to tr("Финансы", "Finance"),
        "LIFESTYLE" to tr("Стиль жизни", "Lifestyle"),
        "HEALTH_AND_FITNESS" to tr("Здоровье и фитнес", "Health & Fitness"),
        "BOOKS_AND_REFERENCE" to tr("Книги и справка", "Books & Reference"),
        "MUSIC_AND_AUDIO" to tr("Музыка и аудио", "Music & Audio"),
        "VIDEO_PLAYERS" to tr("Видеоплееры", "Video Players"),
        "ENTERTAINMENT" to tr("Развлечения", "Entertainment"),
        "PHOTOGRAPHY" to tr("Фотография", "Photography"),
        "TRAVEL_AND_LOCAL" to tr("Путешествия", "Travel & Local"),
        "FOOD_AND_DRINK" to tr("Еда и напитки", "Food & Drink"),
        "PERSONALIZATION" to tr("Персонализация", "Personalization"),
        "NEWS_AND_MAGAZINES" to tr("Новости и журналы", "News & Magazines"),
        "MAPS_AND_NAVIGATION" to tr("Карты и навигация", "Maps & Navigation"),
        "AUTO_AND_VEHICLES" to tr("Авто и транспорт", "Auto & Vehicles"),
        "WEATHER" to tr("Погода", "Weather"),
        "PARENTING" to tr("Для родителей", "Parenting"),
        "LIBRARIES_AND_DEMO" to tr("Библиотеки и демо", "Libraries & Demo")
    )
    direct[key]?.let { return it }

    val tokenMap = mapOf(
        "GAME" to tr("Игры", "Games"),
        "ACTION" to tr("Экшен", "Action"),
        "ARCADE" to tr("Аркады", "Arcade"),
        "ADVENTURE" to tr("Приключения", "Adventure"),
        "CASUAL" to tr("Казуальные", "Casual"),
        "CARD" to tr("Карточные", "Card"),
        "CASINO" to tr("Казино", "Casino"),
        "MUSIC" to tr("Музыкальные", "Music"),
        "PUZZLE" to tr("Головоломки", "Puzzle"),
        "RACING" to tr("Гонки", "Racing"),
        "ROLE" to tr("Ролевые", "Role Playing"),
        "PLAYING" to "",
        "SIMULATION" to tr("Симуляторы", "Simulation"),
        "SPORTS" to tr("Спорт", "Sports"),
        "STRATEGY" to tr("Стратегии", "Strategy"),
        "TRIVIA" to tr("Викторины", "Trivia"),
        "WORD" to tr("Слова", "Word"),
        "PRODUCTIVITY" to tr("Продуктивность", "Productivity"),
        "COMMUNICATION" to tr("Связь", "Communication"),
        "SOCIAL" to tr("Социальные", "Social"),
        "SHOPPING" to tr("Покупки", "Shopping"),
        "TOOLS" to tr("Инструменты", "Tools")
    )

    val translated = key
        .split('_')
        .mapNotNull { part ->
            val t = tokenMap[part] ?: part.lowercase().replaceFirstChar { c -> c.uppercase() }
            t.takeIf { it.isNotBlank() }
        }
        .joinToString(" ")

    return translated.ifBlank { raw.replace('_', ' ') }
}

internal fun starsByReviews(reviews: Long): String {
    val stars = when {
        reviews >= 500_000 -> 5
        reviews >= 100_000 -> 4
        reviews >= 20_000 -> 3
        reviews >= 5_000 -> 2
        reviews > 0 -> 1
        else -> 0
    }
    return "\u2605".repeat(stars) + "\u2606".repeat(5 - stars)
}

internal fun parseInstallsEstimate(raw: String): Long {
    if (raw.isBlank()) return 0L
    val nums = Regex("""\d[\d,\s.]*""")
        .findAll(raw)
        .map { it.value.replace(Regex("""[^\d]"""), "") }
        .mapNotNull { it.toLongOrNull() }
        .toList()
    return nums.maxOrNull() ?: 0L
}

internal fun parseRequiresAndroidApiLevel(raw: String): Int? {
    if (raw.isBlank()) return null
    val lower = raw.lowercase(Locale.US)
    if (lower.contains("varies")) return null

    val match = Regex("""(\d+)(?:\.(\d+))?""").find(lower) ?: return null
    val major = match.groupValues.getOrNull(1)?.toIntOrNull() ?: return null
    val minor = match.groupValues.getOrNull(2)?.toIntOrNull() ?: 0

    return when (major) {
        1 -> when {
            minor <= 1 -> 2
            minor == 5 -> 3
            minor == 6 -> 4
            else -> null
        }
        2 -> when {
            minor <= 0 -> 5
            minor == 1 -> 7
            minor == 2 -> 8
            else -> 10
        }
        3 -> 11
        4 -> when {
            minor <= 0 -> 14
            minor == 1 -> 16
            minor == 2 -> 17
            minor == 3 -> 18
            else -> 19
        }
        5 -> if (minor >= 1) 22 else 21
        6 -> 23
        7 -> if (minor >= 1) 25 else 24
        8 -> if (minor >= 1) 27 else 26
        9 -> 28
        10 -> 29
        11 -> 30
        12 -> if (minor >= 1) 32 else 31
        13 -> 33
        14 -> 34
        15 -> 35
        else -> 36
    }
}
