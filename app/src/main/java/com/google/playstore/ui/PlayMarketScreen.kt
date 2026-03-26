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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayMarketScreen() {
    var apps by remember { mutableStateOf<List<StoreApp>>(emptyList()) }
    var fullCatalogLoaded by rememberSaveable { mutableStateOf(false) }
    var fullCatalogLoading by remember { mutableStateOf(false) }
    var homePayload by remember { mutableStateOf<HomePayload?>(null) }
    var loading by remember { mutableStateOf(true) }
    var loadingDetails by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var tab by rememberSaveable { mutableStateOf(HomeTab.Home) }
    var catalogMode by rememberSaveable { mutableStateOf(CatalogMode.Apps) }
    var selectedApp by remember { mutableStateOf<StoreApp?>(null) }
    var selectedCategory by rememberSaveable { mutableStateOf<String?>(null) }
    var showInstalledPackages by rememberSaveable { mutableStateOf(false) }
    var showWishlist by rememberSaveable { mutableStateOf(false) }
    var searchMode by rememberSaveable { mutableStateOf(false) }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var authMode by rememberSaveable { mutableStateOf<LegacyAuthMode?>(null) }
    var authToken by rememberSaveable { mutableStateOf<String?>(null) }
    var signedInName by rememberSaveable { mutableStateOf<String?>(null) }
    var signedInEmail by rememberSaveable { mutableStateOf<String?>(null) }
    var pendingAppAfterAuth by remember { mutableStateOf<StoreApp?>(null) }
    var authInProgress by remember { mutableStateOf(false) }
    var wishlistAppIds by rememberSaveable { mutableStateOf(setOf<String>()) }
    var wishlistApps by remember { mutableStateOf<List<StoreApp>>(emptyList()) }
    var wishlistLoading by remember { mutableStateOf(false) }
    var wishlistError by remember { mutableStateOf<String?>(null) }
    var wishlistMutationInFlightIds by remember { mutableStateOf(setOf<String>()) }
    var unsupportedAppIdsForDeviceApi by remember { mutableStateOf(setOf<String>()) }
    var installedAppsRefreshKey by rememberSaveable { mutableIntStateOf(0) }
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val apiClient = remember { PlayApiClient(BuildConfig.PLAY_API_BASE_URL) }
    val context = LocalContext.current
    val activity = context as? Activity
    val appContext = remember(context) { context.applicationContext }
    val installCoordinator = remember(appContext, apiClient) {
        AppInstallCoordinator(appContext, apiClient)
    }
    val installSession by installCoordinator.state.collectAsState()
    val authSessionStore = remember(context.applicationContext) {
        AuthSessionStore(context.applicationContext)
    }
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { }
    val headerSearchMode = searchMode && selectedApp == null && authMode == null
    var pullRefreshInProgress by remember { mutableStateOf(false) }
    val canPullRefresh = !loading && authMode == null && selectedApp == null
    val handlePullRefresh = {
        if (canPullRefresh && !pullRefreshInProgress) {
            pullRefreshInProgress = true
            scope.launch {
                // Small delay keeps the refresh indicator visible before Activity recreation.
                delay(220)
                if (activity != null) {
                    activity.recreate()
                } else {
                    pullRefreshInProgress = false
                }
            }
        }
    }
    val ensureNotificationPermission = {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            runCatching {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
    val loadWishlistFromApi: suspend (String) -> Unit = { token ->
        if (token.isBlank()) {
            wishlistApps = emptyList()
            wishlistAppIds = emptySet()
            wishlistError = null
            wishlistLoading = false
        } else {
            wishlistLoading = true
            runCatching {
                withContext(Dispatchers.IO) { apiClient.readFavorites(token) }
            }.onSuccess { payload ->
                wishlistApps = payload.items
                wishlistAppIds = payload.favoriteAppIds.toSet()
                wishlistError = null
            }.onFailure {
                wishlistError = it.message
            }.also {
                wishlistLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        runCatching {
            withContext(Dispatchers.IO) {
                apiClient.readInitialSummaries(limit = 300)
            }
        }.onSuccess {
            apps = it
            loading = false
        }.onFailure {
            error = it.message
            loading = false
        }
    }

    LaunchedEffect(Build.VERSION.SDK_INT) {
        runCatching {
            withContext(Dispatchers.IO) {
                apiClient.readUnsupportedApps(Build.VERSION.SDK_INT)
            }
        }.onSuccess {
            unsupportedAppIdsForDeviceApi = it
        }
    }

    LaunchedEffect(showInstalledPackages) {
        if (!showInstalledPackages || fullCatalogLoaded || fullCatalogLoading) return@LaunchedEffect
        fullCatalogLoading = true
        runCatching {
            withContext(Dispatchers.IO) {
                apiClient.readAllSummariesPaged(pageLimit = 1000)
            }
        }.onSuccess { fetched ->
            val merged = LinkedHashMap<String, StoreApp>(apps.size + fetched.size)
            apps.forEach { merged[it.id] = it }
            fetched.forEach { merged[it.id] = it }
            apps = merged.values.toList()
            fullCatalogLoaded = true
        }.onFailure {
            // Keep current list; clicking package can still lazy-load details by id.
        }.also {
            fullCatalogLoading = false
        }
    }

    LaunchedEffect(catalogMode) {
        val mode = when (catalogMode) {
            CatalogMode.Apps -> "apps"
            CatalogMode.Games -> "games"
        }
        runCatching {
            withContext(Dispatchers.IO) { apiClient.readHome(mode) }
        }.onSuccess {
            homePayload = it
        }.onFailure {
            if (homePayload == null) error = it.message
        }
    }

    LaunchedEffect(Unit) {
        val storedToken = authSessionStore.readToken()
        if (storedToken.isBlank()) return@LaunchedEffect
        runCatching {
            withContext(Dispatchers.IO) {
                apiClient.readCurrentUser(storedToken)
            }
        }.onSuccess { user ->
            authToken = storedToken
            signedInName = user.name
            signedInEmail = user.email
            wishlistAppIds = user.favoriteAppIds.toSet()
            wishlistError = null
        }.onFailure {
            authSessionStore.clear()
            authToken = null
            signedInName = null
            signedInEmail = null
            wishlistAppIds = emptySet()
            wishlistApps = emptyList()
            wishlistError = null
            wishlistMutationInFlightIds = emptySet()
            showWishlist = false
        }
    }

    val catalogApps = remember(apps, catalogMode) {
        when (catalogMode) {
            CatalogMode.Apps -> apps
            CatalogMode.Games -> apps.filter { it.category.startsWith("GAME_") }
        }
    }
    val onAppClick: (StoreApp) -> Unit = { summaryApp ->
        selectedApp = summaryApp
        loadingDetails = true
        scope.launch {
            val details = runCatching {
                withContext(Dispatchers.IO) {
                    apiClient.readById(summaryApp.id)
                }
            }.getOrNull()
            selectedApp = details ?: summaryApp
            loadingDetails = false
        }
    }
    val restorePendingAppAfterAuth: suspend () -> Unit = restorePendingAppAfterAuth@{
        val appToRestore = pendingAppAfterAuth ?: return@restorePendingAppAfterAuth
        pendingAppAfterAuth = null
        selectedApp = appToRestore
        loadingDetails = true
        val details = runCatching {
            withContext(Dispatchers.IO) {
                apiClient.readById(appToRestore.id)
            }
        }.getOrNull()
        selectedApp = details ?: appToRestore
        loadingDetails = false
    }
    val openAuthScreen: (LegacyAuthMode, StoreApp?) -> Unit = { mode, returnToApp ->
        authMode = mode
        pendingAppAfterAuth = returnToApp
        selectedApp = null
        selectedCategory = null
        showInstalledPackages = false
        showWishlist = false
        searchMode = false
        searchQuery = ""
        scope.launch { drawerState.close() }
    }
    val toggleWishlistForApp: (StoreApp) -> Unit = toggleWishlistForApp@{ app ->
        val token = authToken.orEmpty()
        if (token.isBlank()) {
            openAuthScreen(LegacyAuthMode.SignIn, selectedApp ?: app)
            return@toggleWishlistForApp
        }
        val appId = app.id
        if (appId in wishlistMutationInFlightIds) {
            return@toggleWishlistForApp
        }

        val previousIds = wishlistAppIds
        val previousApps = wishlistApps
        val wasFavorite = appId in previousIds

        wishlistMutationInFlightIds = wishlistMutationInFlightIds + appId
        wishlistAppIds = if (wasFavorite) {
            previousIds - appId
        } else {
            previousIds + appId
        }
        wishlistApps = if (wasFavorite) {
            previousApps.filterNot { it.id == appId }
        } else {
            listOf(app) + previousApps.filterNot { it.id == appId }
        }

        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    apiClient.setFavorite(token, appId, favorite = !wasFavorite)
                }
            }.onSuccess { result ->
                wishlistAppIds = result.favoriteAppIds.toSet()
                wishlistError = null
                if (showWishlist) {
                    loadWishlistFromApi(token)
                }
            }.onFailure {
                wishlistAppIds = previousIds
                wishlistApps = previousApps
                wishlistError = it.message
            }.also {
                wishlistMutationInFlightIds = wishlistMutationInFlightIds - appId
            }
        }
    }
    val reportUnsupportedAppForCurrentApi: (String) -> Unit = reportUnsupportedAppForCurrentApi@{ packageId ->
        val normalizedPackageId = packageId.trim()
        if (normalizedPackageId.isBlank()) return@reportUnsupportedAppForCurrentApi
        if (normalizedPackageId in unsupportedAppIdsForDeviceApi) {
            return@reportUnsupportedAppForCurrentApi
        }

        unsupportedAppIdsForDeviceApi = unsupportedAppIdsForDeviceApi + normalizedPackageId
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    apiClient.reportUnsupportedApp(Build.VERSION.SDK_INT, normalizedPackageId)
                }
            }.onSuccess {
                unsupportedAppIdsForDeviceApi = it
            }
        }
    }
    LaunchedEffect(showWishlist, authToken) {
        if (!showWishlist) return@LaunchedEffect
        val token = authToken.orEmpty()
        if (token.isBlank()) return@LaunchedEffect
        loadWishlistFromApi(token)
    }
    LaunchedEffect(installCoordinator) {
        installCoordinator.events.collect { event ->
            when (event) {
                is InstallSessionEvent.Installed -> {
                    installedAppsRefreshKey += 1
                }
                is InstallSessionEvent.AbiIncompatible -> {
                    reportUnsupportedAppForCurrentApi(event.packageId)
                }
            }
        }
    }
    DisposableEffect(installCoordinator) {
        onDispose { installCoordinator.dispose() }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            LegacyLeftDrawer(
                signedInName = signedInName,
                signedInEmail = signedInEmail,
                onItemClick = { section ->
                    when (section) {
                        DrawerSection.MyApps -> {
                            showInstalledPackages = true
                            showWishlist = false
                            catalogMode = CatalogMode.Apps
                            tab = HomeTab.Home
                            selectedCategory = null
                        }
                        DrawerSection.Games -> {
                            showInstalledPackages = false
                            showWishlist = false
                            catalogMode = CatalogMode.Games
                            tab = HomeTab.Home
                            selectedCategory = null
                        }
                        DrawerSection.Categories -> {
                            showInstalledPackages = false
                            showWishlist = false
                            catalogMode = CatalogMode.Apps
                            tab = HomeTab.Categories
                            selectedCategory = null
                        }
                        DrawerSection.Editors -> {
                            val token = authToken.orEmpty()
                            if (token.isBlank()) {
                                openAuthScreen(LegacyAuthMode.SignIn, null)
                                return@LegacyLeftDrawer
                            }
                            showInstalledPackages = false
                            showWishlist = true
                            catalogMode = CatalogMode.Apps
                            tab = HomeTab.Home
                            selectedCategory = null
                        }
                        else -> {
                            showInstalledPackages = false
                            showWishlist = false
                            catalogMode = CatalogMode.Apps
                            tab = HomeTab.Home
                            selectedCategory = null
                        }
                    }
                    selectedApp = null
                    authMode = null
                    searchMode = false
                    searchQuery = ""
                    scope.launch { drawerState.close() }
                },
                onSignInClick = { openAuthScreen(LegacyAuthMode.SignIn, null) },
                onRegisterClick = { openAuthScreen(LegacyAuthMode.Register, null) },
                onLogoutClick = {
                    val token = authToken.orEmpty()
                    authMode = null
                    if (token.isBlank()) {
                        authSessionStore.clear()
                        authToken = null
                        signedInName = null
                        signedInEmail = null
                        wishlistAppIds = emptySet()
                        wishlistApps = emptyList()
                        wishlistError = null
                        wishlistMutationInFlightIds = emptySet()
                        showWishlist = false
                        scope.launch { drawerState.close() }
                    } else {
                        scope.launch {
                            runCatching {
                                withContext(Dispatchers.IO) { apiClient.logout(token) }
                            }
                            authSessionStore.clear()
                            authToken = null
                            signedInName = null
                            signedInEmail = null
                            wishlistAppIds = emptySet()
                            wishlistApps = emptyList()
                            wishlistError = null
                            wishlistMutationInFlightIds = emptySet()
                            showWishlist = false
                            drawerState.close()
                        }
                    }
                }
            )
        },
        gesturesEnabled = selectedApp == null && !searchMode && authMode == null
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .background(Color(0xFFE5E5E5))
        ) {
            if (!loading) {
                LegacyTopBar(
                    title = selectedApp?.name
                        ?: when (authMode) {
                            LegacyAuthMode.SignIn -> stringResource(R.string.auth_sign_in_title)
                            LegacyAuthMode.Register -> stringResource(R.string.auth_register_title)
                            null -> null
                        }
                        ?: if (showInstalledPackages) stringResource(R.string.my_downloads_menu) else null
                        ?: if (showWishlist) stringResource(R.string.menu_my_wishlist) else null
                        ?: selectedCategory?.let { categoryLabelRu(it) }
                        ?: if (catalogMode == CatalogMode.Games) stringResource(R.string.games_corpus_title) else stringResource(R.string.apps_title),
                    showBack = selectedApp != null || selectedCategory != null || showInstalledPackages || showWishlist || searchMode || authMode != null,
                    appPageMode = selectedApp != null || selectedCategory != null || showInstalledPackages || showWishlist || authMode != null,
                    showAppHeaderActions = selectedApp != null,
                    searchMode = headerSearchMode,
                    searchQuery = searchQuery,
                    onSearchQueryChange = { searchQuery = it },
                    onSearchClick = {
                        if (selectedApp == null && authMode == null && !showInstalledPackages && !showWishlist) {
                            searchMode = true
                        }
                    },
                    wishlistSelected = selectedApp?.id?.let { it in wishlistAppIds } == true,
                    onWishlistClick = { selectedApp?.let(toggleWishlistForApp) },
                    onShareClick = {
                        val app = selectedApp ?: return@LegacyTopBar
                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_SUBJECT, app.name)
                            putExtra(
                                Intent.EXTRA_TEXT,
                                "https://play.google.com/store/apps/details?id=${app.id}"
                            )
                        }
                        context.startActivity(Intent.createChooser(shareIntent, "Поделиться"))
                    },
                    onLeftClick = {
                        when {
                            selectedApp != null -> selectedApp = null
                            authMode != null -> {
                                pendingAppAfterAuth = null
                                authMode = null
                            }
                            showInstalledPackages -> showInstalledPackages = false
                            showWishlist -> showWishlist = false
                            selectedCategory != null -> selectedCategory = null
                            searchMode -> {
                                searchMode = false
                                searchQuery = ""
                            }
                            else -> scope.launch { drawerState.open() }
                        }
                    }
                )
            }

            when {
                loading -> InitialLoadingScreen()
                authMode != null -> LegacyAuthPage(
                    mode = authMode!!,
                    signedInName = signedInName,
                    signedInEmail = signedInEmail,
                    loading = authInProgress,
                    onCancel = {
                        pendingAppAfterAuth = null
                        authMode = null
                    },
                    onSubmit = { mode, firstName, lastName, email, password ->
                        authInProgress = true
                        try {
                            val session = withContext(Dispatchers.IO) {
                                if (mode == LegacyAuthMode.SignIn) {
                                    apiClient.login(email = email, password = password)
                                } else {
                                    apiClient.register(
                                        email = email,
                                        password = password,
                                        firstName = firstName,
                                        lastName = lastName,
                                        country = Locale.getDefault().country
                                    )
                                }
                            }
                            authSessionStore.saveToken(session.token)
                            authToken = session.token
                            signedInName = session.user.name
                            signedInEmail = session.user.email
                            wishlistAppIds = session.user.favoriteAppIds.toSet()
                            wishlistError = null
                            authMode = null
                            restorePendingAppAfterAuth()
                        } finally {
                            authInProgress = false
                        }
                    },
                    onSwitchMode = { authMode = it }
                )
                error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Ошибка загрузки данных API\n$error", color = Color(0xFF333333), fontSize = 14.sp)
                }
                else -> Box(Modifier.fillMaxSize()) {
                    PullToRefreshBox(
                        isRefreshing = pullRefreshInProgress,
                        onRefresh = handlePullRefresh,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        if (showInstalledPackages) {
                            InstalledPackagesPage(
                                apiClient = apiClient,
                                storeApps = apps,
                                loadingCatalog = fullCatalogLoading,
                                installedAppsRefreshKey = installedAppsRefreshKey,
                                onAppClick = onAppClick
                            )
                        } else if (showWishlist) {
                            WishlistPage(
                                apps = wishlistApps,
                                loading = wishlistLoading,
                                error = wishlistError,
                                installedAppsRefreshKey = installedAppsRefreshKey,
                                activeInstallSession = installSession,
                                onRetry = {
                                    val token = authToken.orEmpty()
                                    if (token.isNotBlank()) {
                                        scope.launch { loadWishlistFromApi(token) }
                                    }
                                },
                                onAppClick = onAppClick
                            )
                        } else if (searchMode) {
                            SearchResultsPage(
                                query = searchQuery,
                                apiClient = apiClient,
                                catalogMode = catalogMode,
                                installedAppsRefreshKey = installedAppsRefreshKey,
                                activeInstallSession = installSession,
                                onAppClick = onAppClick
                            )
                        } else {
                            MainTabsPager(
                                current = tab,
                                onTabChange = {
                                    tab = it
                                    if (it != HomeTab.Categories) selectedCategory = null
                                },
                                apps = catalogApps,
                                homePayload = homePayload,
                                apiClient = apiClient,
                                catalogMode = catalogMode,
                                selectedCategory = selectedCategory,
                                installedAppsRefreshKey = installedAppsRefreshKey,
                                activeInstallSession = installSession,
                                onCategoryClick = { selectedCategory = it },
                                onAppClick = onAppClick
                            )
                        }
                    }

                    if (selectedApp != null) {
                        val detailsApp = selectedApp!!
                        AppDetailsPage(
                            app = detailsApp,
                            catalogApps = catalogApps,
                            apiClient = apiClient,
                            authToken = authToken,
                            loadingDetails = loadingDetails,
                            isAuthenticated = authToken.orEmpty().isNotBlank(),
                            unsupportedOnCurrentDeviceApi = detailsApp.id in unsupportedAppIdsForDeviceApi,
                            installedAppsRefreshKey = installedAppsRefreshKey,
                            installSession = installSession?.takeIf { it.packageId == detailsApp.id },
                            activeInstallSession = installSession,
                            wishlistSelected = detailsApp.id in wishlistAppIds,
                            onWishlistClick = { toggleWishlistForApp(detailsApp) },
                            onMarkUnsupportedForCurrentApi = {
                                reportUnsupportedAppForCurrentApi(detailsApp.id)
                            },
                            onStartInstall = { appToInstall ->
                                ensureNotificationPermission()
                                installCoordinator.start(appToInstall)
                            },
                            onCancelInstall = { installCoordinator.cancel() },
                            onDismissInstallError = { installCoordinator.dismissError() },
                            onRetryInstall = { appToInstall ->
                                ensureNotificationPermission()
                                installCoordinator.start(appToInstall)
                            },
                            onInstalledStateChanged = { installedAppsRefreshKey += 1 },
                            onRequireSignIn = { openAuthScreen(LegacyAuthMode.SignIn, detailsApp) },
                            onAppClick = onAppClick
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun InitialLoadingScreen() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Image(
                painter = painterResource(R.mipmap.ic_menu_play),
                contentDescription = null,
                modifier = Modifier.size(88.dp)
            )
            Spacer(Modifier.height(24.dp))
            LegacyPlayLoadingSpinner(size = 30.dp)
        }
    }
}

@Composable
private fun MainTabsPager(
    current: HomeTab,
    onTabChange: (HomeTab) -> Unit,
    apps: List<StoreApp>,
    homePayload: HomePayload?,
    apiClient: PlayApiClient,
    catalogMode: CatalogMode,
    selectedCategory: String?,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    onCategoryClick: (String) -> Unit,
    onAppClick: (StoreApp) -> Unit
) {
    val tabs = HomeTab.entries
    val scope = rememberCoroutineScope()
    val pagerState = rememberPagerState(
        initialPage = tabs.indexOf(current).coerceAtLeast(0),
        pageCount = { tabs.size }
    )

    LaunchedEffect(current) {
        val target = tabs.indexOf(current).coerceAtLeast(0)
        if (pagerState.currentPage != target) {
            pagerState.animateScrollToPage(target)
        }
    }

    LaunchedEffect(pagerState.settledPage) {
        val selected = tabs[pagerState.settledPage]
        if (selected != current) onTabChange(selected)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopTabs(
            current = current,
            onSelect = { targetTab ->
                val index = tabs.indexOf(targetTab).coerceAtLeast(0)
                scope.launch {
                    pagerState.animateScrollToPage(index)
                }
            }
        )

        HorizontalPager(
            state = pagerState,
            beyondViewportPageCount = tabs.lastIndex,
            key = { page -> tabs[page].name },
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) { page ->
            MainContent(
                tab = tabs[page],
                apps = apps,
                homePayload = homePayload,
                apiClient = apiClient,
                catalogMode = catalogMode,
                selectedCategory = selectedCategory,
                installedAppsRefreshKey = installedAppsRefreshKey,
                activeInstallSession = activeInstallSession,
                onCategoryClick = onCategoryClick,
                onAppClick = onAppClick
            )
        }
    }
}

private enum class LegacyAuthMode { SignIn, Register }

@Composable
private fun LegacyLeftDrawer(
    signedInName: String?,
    signedInEmail: String?,
    onItemClick: (DrawerSection) -> Unit,
    onSignInClick: () -> Unit,
    onRegisterClick: () -> Unit,
    onLogoutClick: () -> Unit
) {
    val menuItems = buildList {
        add(Triple(DrawerSection.Home, R.string.drawer_home, R.mipmap.ic_menu_play))
        add(Triple(DrawerSection.MyApps, R.string.my_downloads_menu, R.drawable.ic_menu_market_myapps))
        add(Triple(DrawerSection.Games, R.string.games_corpus_title, R.drawable.ic_menu_games_dark))
        add(Triple(DrawerSection.Categories, R.string.category_tab_title, R.drawable.ic_menu_shop_holo_dark))
        add(Triple(DrawerSection.Settings, R.string.settings, R.drawable.ic_menu_settings_gear))
        if (!signedInEmail.isNullOrBlank()) {
            add(Triple(DrawerSection.Editors, R.string.menu_my_wishlist, R.drawable.ic_menu_market_wishlist))
        }
    }

    ModalDrawerSheet(
        drawerContainerColor = Color(0xFFF5F5F5),
        drawerShape = RoundedCornerShape(0.dp),
        windowInsets = WindowInsets(0, 0, 0, 0),
        modifier = Modifier.width(284.dp).statusBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp)
                .background(Color(0xFF97B52C))
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Image(painterResource(R.mipmap.ic_menu_play_store), null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.launcher_name), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
        LegacyDrawerAccountPanel(
            signedInName = signedInName,
            signedInEmail = signedInEmail,
            onSignInClick = onSignInClick,
            onRegisterClick = onRegisterClick,
            onLogoutClick = onLogoutClick
        )
        HorizontalDivider(color = Color(0x12000000))
        menuItems.forEach { (section, title, iconRes) ->
            val iconDescription = when (section) {
                DrawerSection.Settings -> stringResource(R.string.drawer_settings_icon)
                else -> null
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .background(Color(0xFFF5F5F5))
                    .clickable { onItemClick(section) }
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Image(
                    painter = painterResource(iconRes),
                    contentDescription = iconDescription,
                    modifier = Modifier.size(20.dp),
                    colorFilter = if (section == DrawerSection.MyApps || section == DrawerSection.Categories) {
                        androidx.compose.ui.graphics.ColorFilter.tint(Color(0xFF4A4A4A))
                    } else {
                        null
                    }
                )
                Spacer(Modifier.width(14.dp))
                Text(stringResource(title), color = Color(0xFF3F3F3F), fontSize = 15.sp)
            }
            HorizontalDivider(color = Color(0x12000000))
        }
    }
}

@Composable
private fun LegacyDrawerAccountPanel(
    signedInName: String?,
    signedInEmail: String?,
    onSignInClick: () -> Unit,
    onRegisterClick: () -> Unit,
    onLogoutClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFF5F5F5))
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (signedInEmail.isNullOrBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .border(1.dp, Color(0x18000000))
                    .padding(horizontal = 10.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Image(
                    painter = painterResource(R.drawable.ic_google_default_user_avatar),
                    contentDescription = stringResource(R.string.drawer_user_avatar),
                    modifier = Modifier.size(24.dp)
                )
                Spacer(Modifier.width(10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = tr("Аккаунт Google", "Google account"),
                        color = Color(0xFF9A9A9A),
                        fontSize = 11.sp
                    )
                    Text(
                        text = tr("Гость", "Guest"),
                        color = Color(0xFF404040),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Text(
                text = stringResource(R.string.account_required_external),
                color = Color(0xFF6C6C6C),
                fontSize = 12.sp,
                lineHeight = 17.sp
            )
        }
        if (!signedInEmail.isNullOrBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .border(1.dp, Color(0x18000000))
                    .padding(horizontal = 10.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Image(
                    painter = painterResource(R.drawable.ic_google_default_user_avatar),
                    contentDescription = stringResource(R.string.drawer_user_avatar),
                    modifier = Modifier.size(24.dp)
                )
                Spacer(Modifier.width(10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = stringResource(R.string.auth_signed_in_as),
                        color = Color(0xFF9A9A9A),
                        fontSize = 11.sp
                    )
                    Text(
                        text = signedInName?.takeIf { it.isNotBlank() } ?: signedInEmail,
                        color = Color(0xFF404040),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (!signedInName.isNullOrBlank()) {
                        Text(
                            text = signedInEmail,
                            color = Color(0xFF737373),
                            fontSize = 12.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
        if (signedInEmail.isNullOrBlank()) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LegacyDrawerAuthButton(
                    label = stringResource(R.string.no_recommendation_account),
                    filled = true,
                    modifier = Modifier.weight(1f),
                    onClick = onSignInClick
                )
                LegacyDrawerAuthButton(
                    label = stringResource(R.string.auth_create_account_action),
                    filled = false,
                    modifier = Modifier.weight(1f),
                    onClick = onRegisterClick
                )
            }
        } else {
            LegacyDrawerAuthButton(
                label = stringResource(R.string.auth_sign_out),
                filled = false,
                modifier = Modifier.fillMaxWidth(),
                onClick = onLogoutClick
            )
        }
    }
}

@Composable
private fun LegacyDrawerAuthButton(
    label: String,
    filled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .height(38.dp)
            .background(if (filled) Color(0xFF97B52C) else Color.White)
            .border(1.dp, if (filled) Color(0xFF97B52C) else Color(0x26000000))
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label.uppercase(Locale.getDefault()),
            color = if (filled) Color.White else Color(0xFF4A4A4A),
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1
        )
    }
}

@Composable
private fun LegacyAuthPage(
    mode: LegacyAuthMode,
    signedInName: String?,
    signedInEmail: String?,
    loading: Boolean,
    onCancel: () -> Unit,
    onSubmit: suspend (
        mode: LegacyAuthMode,
        firstName: String,
        lastName: String,
        email: String,
        password: String
    ) -> Unit,
    onSwitchMode: (LegacyAuthMode) -> Unit
) {
    val scope = rememberCoroutineScope()
    val initialName = signedInName.orEmpty().trim()
    val initialFirstName = initialName.substringBefore(' ', missingDelimiterValue = initialName)
    val initialLastName = initialName.substringAfter(' ', missingDelimiterValue = "")
    var firstName by rememberSaveable(mode, signedInName) { mutableStateOf(initialFirstName) }
    var lastName by rememberSaveable(mode, signedInName) { mutableStateOf(initialLastName) }
    var email by rememberSaveable(mode, signedInEmail) { mutableStateOf(signedInEmail.orEmpty()) }
    var password by rememberSaveable(mode) { mutableStateOf("") }
    var confirmPassword by rememberSaveable(mode) { mutableStateOf("") }
    var validationMessage by remember(mode) { mutableStateOf<String?>(null) }
    val isSignIn = mode == LegacyAuthMode.SignIn
    val title = if (isSignIn) {
        stringResource(R.string.select_account)
    } else {
        stringResource(R.string.auth_register_title)
    }
    val subtitle = if (isSignIn) {
        stringResource(R.string.account_required_external)
    } else {
        stringResource(R.string.auth_register_subtitle)
    }
    val primaryActionLabel = if (isSignIn) {
        stringResource(R.string.no_recommendation_account)
    } else {
        stringResource(R.string.auth_create_account_action)
    }
    val switchPrompt = if (isSignIn) {
        stringResource(R.string.auth_need_google_account)
    } else {
        stringResource(R.string.auth_have_google_account)
    }
    val switchAction = if (isSignIn) {
        stringResource(R.string.auth_create_account_action)
    } else {
        stringResource(R.string.no_recommendation_account)
    }
    val invalidEmailMessage = stringResource(R.string.invalid_email)
    val emptyPasswordMessage = stringResource(R.string.enter_a_password)
    val fillRequiredMessage = stringResource(R.string.auth_fill_required)
    val passwordMismatchMessage = stringResource(R.string.auth_password_mismatch)
    val canSubmit = if (isSignIn) {
        email.trim().isNotBlank() && password.isNotBlank()
    } else {
        firstName.trim().isNotBlank() &&
            lastName.trim().isNotBlank() &&
            email.trim().isNotBlank() &&
            password.isNotBlank() &&
            confirmPassword.isNotBlank() &&
            password == confirmPassword
    } && !loading

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            item {
                Text(
                    text = title,
                    color = Color(0xFF303030),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Normal
                )
            }
            item {
                Text(
                    text = subtitle,
                    color = Color(0xFF999999),
                    fontSize = 14.sp,
                    lineHeight = 18.sp
                )
            }
            if (!signedInEmail.isNullOrBlank() && isSignIn) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFFF4F4F4))
                            .border(1.dp, Color(0x15000000))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.auth_signed_in_as),
                            color = Color(0xFF8F8F8F),
                            fontSize = 11.sp
                        )
                        Text(
                            text = signedInName?.takeIf { it.isNotBlank() } ?: signedInEmail,
                            color = Color(0xFF404040),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium
                        )
                        if (!signedInName.isNullOrBlank()) {
                            Text(
                                text = signedInEmail,
                                color = Color(0xFF767676),
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
            if (!isSignIn) {
                item {
                    LegacyAuthInput(
                        value = firstName,
                        onValueChange = {
                            firstName = it
                            validationMessage = null
                        },
                        hint = stringResource(R.string.first_name),
                        keyboardType = KeyboardType.Text
                    )
                }
                item {
                    LegacyAuthInput(
                        value = lastName,
                        onValueChange = {
                            lastName = it
                            validationMessage = null
                        },
                        hint = stringResource(R.string.last_name),
                        keyboardType = KeyboardType.Text
                    )
                }
            }
            item {
                LegacyAuthInput(
                    value = email,
                    onValueChange = {
                        email = it
                        validationMessage = null
                    },
                    hint = stringResource(R.string.email_address),
                    keyboardType = KeyboardType.Email
                )
            }
            item {
                LegacyAuthInput(
                    value = password,
                    onValueChange = {
                        password = it
                        validationMessage = null
                    },
                    hint = stringResource(R.string.google_password_hint),
                    keyboardType = KeyboardType.Password,
                    isPassword = true
                )
            }
            if (!isSignIn) {
                item {
                    LegacyAuthInput(
                        value = confirmPassword,
                        onValueChange = {
                            confirmPassword = it
                            validationMessage = null
                        },
                        hint = stringResource(R.string.auth_confirm_password),
                        keyboardType = KeyboardType.Password,
                        isPassword = true
                    )
                }
            }
            if (!validationMessage.isNullOrBlank()) {
                item {
                    Text(
                        text = validationMessage!!,
                        color = Color(0xFFC14F42),
                        fontSize = 12.sp
                    )
                }
            }
            if (!isSignIn && confirmPassword.isNotBlank() && password != confirmPassword) {
                item {
                    Text(
                        text = passwordMismatchMessage,
                        color = Color(0xFFC14F42),
                        fontSize = 12.sp
                    )
                }
            }
            if (isSignIn) {
                item {
                    Text(
                        text = stringResource(R.string.forgot_your_password),
                        color = Color(0xFF3B78B6),
                        fontSize = 14.sp
                    )
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = switchPrompt,
                        color = Color(0xFF8D8D8D),
                        fontSize = 13.sp
                    )
                    Text(
                        text = switchAction,
                        color = Color(0xFF3B78B6),
                        fontSize = 14.sp,
                        modifier = Modifier.clickable {
                            if (loading) return@clickable
                            validationMessage = null
                            onSwitchMode(if (isSignIn) LegacyAuthMode.Register else LegacyAuthMode.SignIn)
                        }
                    )
                }
            }
        }
        LegacyAuthButtonBar(
            positiveLabel = primaryActionLabel,
            negativeLabel = stringResource(R.string.cancel),
            positiveEnabled = canSubmit,
            onPositiveClick = {
                val trimmedEmail = email.trim()
                val isEmailValid = trimmedEmail.contains('@') && trimmedEmail.contains('.')
                validationMessage = when {
                    !isEmailValid -> invalidEmailMessage
                    password.isBlank() -> emptyPasswordMessage
                    !isSignIn && (firstName.isBlank() || lastName.isBlank() || confirmPassword.isBlank()) -> fillRequiredMessage
                    !isSignIn && password != confirmPassword -> passwordMismatchMessage
                    else -> null
                }
                if (validationMessage == null) {
                    scope.launch {
                        val failure = runCatching {
                            onSubmit(
                                mode,
                                firstName.trim(),
                                lastName.trim(),
                                trimmedEmail,
                                password
                            )
                        }.exceptionOrNull()
                        validationMessage = failure?.message
                    }
                }
            },
            onNegativeClick = {
                if (!loading) onCancel()
            }
        )
    }
}

@Composable
private fun LegacyAuthInput(
    value: String,
    onValueChange: (String) -> Unit,
    hint: String,
    keyboardType: KeyboardType,
    isPassword: Boolean = false
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .border(1.dp, Color(0x26000000))
            .padding(horizontal = 12.dp, vertical = 12.dp)
    ) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(
                color = Color(0xFF343434),
                fontSize = 18.sp
            ),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.None,
                autoCorrectEnabled = false,
                keyboardType = keyboardType,
                imeAction = ImeAction.Next
            ),
            visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { inner ->
                if (value.isBlank()) {
                    Text(
                        text = hint,
                        color = Color(0xFF9B9B9B),
                        fontSize = 18.sp
                    )
                }
                inner()
            }
        )
    }
}

@Composable
private fun LegacyAuthButtonBar(
    positiveLabel: String,
    negativeLabel: String,
    positiveEnabled: Boolean,
    onPositiveClick: () -> Unit,
    onNegativeClick: () -> Unit
) {
    HorizontalDivider(color = Color(0x16000000))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFF1F1F1))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        LegacyAuthButtonBarButton(
            label = positiveLabel,
            filled = true,
            enabled = positiveEnabled,
            modifier = Modifier.weight(1f),
            onClick = onPositiveClick
        )
        LegacyAuthButtonBarButton(
            label = negativeLabel,
            filled = false,
            enabled = true,
            modifier = Modifier.weight(1f),
            onClick = onNegativeClick
        )
    }
}

@Composable
private fun LegacyAuthButtonBarButton(
    label: String,
    filled: Boolean,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .height(42.dp)
            .background(
                when {
                    filled && enabled -> Color(0xFF97B52C)
                    filled -> Color(0xFFD0D0D0)
                    else -> Color.White
                }
            )
            .border(1.dp, if (filled) Color(0x26000000) else Color(0x30000000))
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label.uppercase(Locale.getDefault()),
            color = if (filled && enabled) Color.White else Color(0xFF4A4A4A),
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1
        )
    }
}

@Composable
private fun LegacyTopBar(
    title: String,
    showBack: Boolean,
    appPageMode: Boolean,
    showAppHeaderActions: Boolean,
    searchMode: Boolean,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    onSearchClick: () -> Unit,
    wishlistSelected: Boolean,
    onWishlistClick: () -> Unit,
    onShareClick: () -> Unit,
    onLeftClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .height(50.dp)
            .background(Color(0xFF97B52C))
            .padding(end = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier
                .fillMaxHeight()
                .clickable { onLeftClick() }
                .padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (appPageMode || showBack) {
                Image(
                    painter = painterResource(R.drawable.ic_arrow_back_modern),
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
            } else {
                Image(
                    painter = painterResource(R.drawable.ic_menu_hamburger),
                    contentDescription = stringResource(R.string.drawer_home),
                    modifier = Modifier.size(18.dp)
                )
            }
            Spacer(Modifier.width(6.dp))
            Image(painterResource(R.mipmap.ic_menu_play_store), null, modifier = Modifier.size(20.dp))
        }
        if (searchMode) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(34.dp)
                    .background(Color.White, RoundedCornerShape(1.dp))
                    .padding(horizontal = 8.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                BasicTextField(
                    value = searchQuery,
                    onValueChange = onSearchQueryChange,
                    singleLine = true,
                    textStyle = TextStyle(color = Color(0xFF333333), fontSize = 14.sp),
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Sentences,
                        autoCorrectEnabled = false,
                        keyboardType = KeyboardType.Text,
                        imeAction = ImeAction.Search
                    ),
                    keyboardActions = KeyboardActions(onSearch = {}),
                    modifier = Modifier.fillMaxWidth(),
                    decorationBox = { inner ->
                        if (searchQuery.isBlank()) Text(stringResource(R.string.search_apps_hint), color = Color(0xFF9E9E9E), fontSize = 14.sp)
                        inner()
                    }
                )
            }
        } else {
            Text(
                title,
                color = Color.White,
                fontSize = 15.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.weight(1f))
        }
        if (searchMode) {
            Spacer(Modifier.width(8.dp))
            Text(
                text = if (searchQuery.isBlank()) "\u2715" else "\u232b",
                color = Color.White,
                fontSize = 16.sp,
                modifier = Modifier.clickable {
                    if (searchQuery.isBlank()) onLeftClick() else onSearchQueryChange("")
                }
            )
        } else if (showAppHeaderActions) {
            LegacyTopBarActionButton(
                iconRes = if (wishlistSelected) R.drawable.ic_menu_wish_on_dark else R.drawable.ic_menu_wish_off_dark,
                onClick = onWishlistClick
            )
            LegacyTopBarActionButton(
                iconRes = R.drawable.ic_menu_share_holo_dark,
                onClick = onShareClick
            )
        } else {
            Image(
                painter = painterResource(R.drawable.ic_menu_search_holo_dark),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxHeight()
                    .padding(horizontal = 10.dp, vertical = 14.dp)
                    .clickable { onSearchClick() }
            )
        }
    }
}

@Composable
private fun LegacyTopBarActionButton(iconRes: Int, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxHeight()
            .clickable { onClick() }
            .padding(horizontal = 10.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(22.dp)
        )
    }
}

@Composable
private fun TopTabs(current: HomeTab, onSelect: (HomeTab) -> Unit) {
    val listState = rememberLazyListState()
    val currentIndex = HomeTab.entries.indexOf(current).coerceAtLeast(0)

    LaunchedEffect(currentIndex) {
        listState.animateScrollToItem(currentIndex)
    }

    LazyRow(
        state = listState,
        modifier = Modifier.fillMaxWidth().height(44.dp).background(Color.White)
    ) {
        items(HomeTab.entries) { item ->
            val selected = item == current
            Column(
                modifier = Modifier.width(128.dp).fillMaxHeight().clickable { onSelect(item) },
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(
                        stringResource(item.titleRes),
                        color = if (selected) Color(0xFF333333) else Color(0xFF808080),
                        fontSize = 10.sp,
                        maxLines = 1
                    )
                }
                Box(modifier = Modifier.fillMaxWidth().height(3.dp).background(if (selected) Color(0xFFD3DA33) else Color.Transparent))
            }
        }
    }
    HorizontalDivider(color = Color(0x26000000))
}

@Composable
private fun MainContent(
    tab: HomeTab,
    apps: List<StoreApp>,
    homePayload: HomePayload?,
    apiClient: PlayApiClient,
    catalogMode: CatalogMode,
    selectedCategory: String?,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    onCategoryClick: (String) -> Unit,
    onAppClick: (StoreApp) -> Unit
) {
    when (tab) {
        HomeTab.Home -> LegacyHomePage(
            homePayload = homePayload,
            fallbackApps = apps,
            installedAppsRefreshKey = installedAppsRefreshKey,
            activeInstallSession = activeInstallSession,
            onAppClick = onAppClick
        )
        HomeTab.Categories -> {
            if (selectedCategory == null) {
                CategoriesPage(apps, onCategoryClick)
            } else {
                CategoryAppsPage(
                    category = selectedCategory,
                    apps = apps.filter { it.category.equals(selectedCategory, ignoreCase = true) },
                    installedAppsRefreshKey = installedAppsRefreshKey,
                    activeInstallSession = activeInstallSession,
                    onAppClick = onAppClick
                )
            }
        }
        HomeTab.TopPaid -> PagedChartPage(
            title = localizeSectionTitle("Top Paid"),
            chart = "top_paid",
            apiClient = apiClient,
            catalogMode = catalogMode,
            installedAppsRefreshKey = installedAppsRefreshKey,
            activeInstallSession = activeInstallSession,
            onAppClick = onAppClick,
            style = ChartCardStyle.GrossingBlend,
            showHeader = false
        )
        HomeTab.TopFree -> PagedChartPage(
            title = localizeSectionTitle("Top Free"),
            chart = "top_free",
            apiClient = apiClient,
            catalogMode = catalogMode,
            installedAppsRefreshKey = installedAppsRefreshKey,
            activeInstallSession = activeInstallSession,
            onAppClick = onAppClick,
            style = ChartCardStyle.GrossingBlend,
            showHeader = false
        )
        HomeTab.TopGrossing -> PagedChartPage(
            title = localizeSectionTitle("Top Grossing"),
            chart = "top_grossing",
            apiClient = apiClient,
            catalogMode = catalogMode,
            installedAppsRefreshKey = installedAppsRefreshKey,
            activeInstallSession = activeInstallSession,
            onAppClick = onAppClick,
            style = ChartCardStyle.GrossingBlend,
            showHeader = false
        )
        HomeTab.TopNewPaid -> PagedChartPage(
            title = localizeSectionTitle("Top New Paid"),
            chart = "top_new_paid",
            apiClient = apiClient,
            catalogMode = catalogMode,
            installedAppsRefreshKey = installedAppsRefreshKey,
            activeInstallSession = activeInstallSession,
            onAppClick = onAppClick,
            style = ChartCardStyle.GrossingBlend,
            showHeader = false
        )
        HomeTab.TopNewFree -> PagedChartPage(
            title = localizeSectionTitle("Top New Free"),
            chart = "top_new_free",
            apiClient = apiClient,
            catalogMode = catalogMode,
            installedAppsRefreshKey = installedAppsRefreshKey,
            activeInstallSession = activeInstallSession,
            onAppClick = onAppClick,
            style = ChartCardStyle.GrossingBlend,
            showHeader = false
        )
    }
}

private data class InstalledPackageEntry(
    val packageName: String,
    val displayName: String,
    val app: StoreApp?
)

@Composable
private fun InstalledPackagesPage(
    apiClient: PlayApiClient,
    storeApps: List<StoreApp>,
    loadingCatalog: Boolean,
    installedAppsRefreshKey: Int,
    onAppClick: (StoreApp) -> Unit
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val packageManager = context.packageManager
    val packages = remember(storeApps, context, installedAppsRefreshKey) {
        val appsById = storeApps.associateBy { it.id.trim().lowercase(Locale.ROOT) }
        runCatching {
            packageManager.getInstalledPackages(0)
                .asSequence()
                .mapNotNull { pkg ->
                    val packageName = pkg.packageName?.trim().orEmpty()
                    if (packageName.isBlank()) return@mapNotNull null
                    if (packageManager.getLaunchIntentForPackage(packageName) == null) return@mapNotNull null
                    val label = runCatching {
                        val appInfo = packageManager.getApplicationInfo(packageName, 0)
                        packageManager.getApplicationLabel(appInfo).toString().trim()
                    }.getOrDefault("")
                    InstalledPackageEntry(
                        packageName = packageName,
                        displayName = label.ifBlank { packageName },
                        app = appsById[packageName.lowercase(Locale.ROOT)]
                    )
                }
                .sortedWith(
                    compareBy<InstalledPackageEntry>(
                        { it.displayName.lowercase(Locale.getDefault()) },
                        { it.packageName.lowercase(Locale.getDefault()) }
                    )
                )
                .toList()
        }.getOrDefault(emptyList())
    }
    var apiResolvedApps by remember { mutableStateOf<Map<String, StoreApp?>>(emptyMap()) }

    LaunchedEffect(packages) {
        val missingPackageNames = packages
            .asSequence()
            .filter { it.app == null }
            .map { it.packageName }
            .filter { !apiResolvedApps.containsKey(it) }
            .toList()
        for (packageName in missingPackageNames) {
            val resolved = runCatching {
                withContext(Dispatchers.IO) { apiClient.readById(packageName) }
            }.getOrNull()
            apiResolvedApps = apiResolvedApps + (packageName to resolved)
        }
    }

    if (packages.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = stringResource(R.string.empty_myapps_description_installed),
                color = Color(0xFF6A6A6A),
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 20.dp)
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 8.dp, top = 8.dp, end = 8.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        if (loadingCatalog) {
            item(key = "catalog_loading_hint") {
                Text(
                    text = tr("Синхронизация каталога…", "Syncing catalog…"),
                    color = Color(0xFF7C7C7C),
                    fontSize = 12.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .padding(horizontal = 10.dp, vertical = 8.dp)
                )
            }
        }
        items(packages, key = { it.packageName }) { item ->
            val resolvedApp = item.app ?: apiResolvedApps[item.packageName]
            InstalledPackageListItem(
                item = item,
                apiApp = resolvedApp,
                onClick = {
                    val matched = resolvedApp
                    if (matched != null) {
                        onAppClick(matched)
                    }
                }
            )
        }
    }
}

@Composable
private fun InstalledPackageListItem(
    item: InstalledPackageEntry,
    apiApp: StoreApp?,
    onClick: (() -> Unit)?
) {
    val baseModifier = Modifier
        .fillMaxWidth()
        .heightIn(min = 74.dp)
        .background(Color.White)
        .padding(horizontal = 10.dp, vertical = 8.dp)
    Row(
        modifier = if (onClick != null) baseModifier.clickable { onClick() } else baseModifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (apiApp != null) {
            AppIconImage(apiApp.iconUrl, 48.dp, cornerRadius = 9.dp)
        } else {
            val context = LocalContext.current
            val packageManager = context.packageManager
            val packageIcon = remember(item.packageName) {
                runCatching { packageManager.getApplicationIcon(item.packageName) }.getOrNull()
            }
            if (packageIcon != null) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(Color.White),
                    contentAlignment = Alignment.Center
                ) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { ctx ->
                            ImageView(ctx).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
                        },
                        update = { view -> view.setImageDrawable(packageIcon) }
                    )
                }
            } else {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(Color(0xFFE0E0E0), RoundedCornerShape(9.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Image(
                        painter = painterResource(R.mipmap.ic_menu_play_store),
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 10.dp, end = 8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = item.displayName,
                color = Color(0xFF2F2F2F),
                fontSize = 15.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = item.packageName,
                color = Color(0xFF808080),
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Text(
            text = stringResource(R.string.installed_list_state).uppercase(Locale.getDefault()),
            color = Color(0xFF96B62A),
            fontSize = 10.sp,
            maxLines = 1
        )
    }
    HorizontalDivider(color = Color(0x12000000), modifier = Modifier.padding(start = 68.dp))
}

@Composable
private fun WishlistPage(
    apps: List<StoreApp>,
    loading: Boolean,
    error: String?,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    onRetry: () -> Unit,
    onAppClick: (StoreApp) -> Unit
) {
    if (loading && apps.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            LegacyPlayLoadingSpinner(size = 22.dp)
        }
        return
    }

    if (error != null && apps.isEmpty()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = tr("Не удалось загрузить список желаний", "Failed to load wishlist"),
                color = Color(0xFF4F4F4F),
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = error,
                color = Color(0xFF8A8A8A),
                fontSize = 12.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = tr("Повторить", "Retry"),
                color = Color(0xFF3B78B6),
                fontSize = 14.sp,
                modifier = Modifier.clickable { onRetry() }
            )
        }
        return
    }

    if (apps.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = tr(
                    "В списке желаний пока нет приложений.",
                    "There are no items in your wishlist."
                ),
                color = Color(0xFF6A6A6A),
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 20.dp)
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 8.dp, top = 8.dp, end = 8.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        items(apps, key = { it.id }) { app ->
            CompactListItem(
                app = app,
                installedAppsRefreshKey = installedAppsRefreshKey,
                activeInstallSession = activeInstallSession
            ) { onAppClick(app) }
        }
        if (loading) {
            item(key = "wishlist_loading") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    LegacyPlayLoadingSpinner(size = 18.dp)
                }
            }
        }
        if (error != null) {
            item(key = "wishlist_error_hint") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = tr("Ошибка синхронизации", "Sync error"),
                        color = Color(0xFF8A8A8A),
                        fontSize = 12.sp,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = tr("Повторить", "Retry"),
                        color = Color(0xFF3B78B6),
                        fontSize = 12.sp,
                        modifier = Modifier.clickable { onRetry() }
                    )
                }
            }
        }
    }
}

private enum class ChartCardStyle { Classic, GrossingBlend }
@Composable
private fun LegacyHomePage(
    homePayload: HomePayload?,
    fallbackApps: List<StoreApp>,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    onAppClick: (StoreApp) -> Unit
) {
    val heroBanners = homePayload?.heroBanners.orEmpty()
    val sections = homePayload?.sections.orEmpty()
    val firstSection = sections.getOrNull(0)
    val secondSection = sections.getOrNull(1)
    val first = firstSection?.items?.take(18).orEmpty().ifEmpty { fallbackApps.take(18) }
    val second = secondSection?.items?.take(18).orEmpty().ifEmpty { fallbackApps.drop(18).take(18).ifEmpty { first } }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 8.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (heroBanners.isNotEmpty()) {
            item { PlayPromotionsSwiper(heroBanners = heroBanners, onAppClick = onAppClick) }
        }
        item {
            Row(
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SmallCategoryCard(stringResource(R.string.home_games), R.mipmap.ic_menu_apps, Modifier.weight(1f))
                SmallCategoryCard(stringResource(R.string.home_editors_choice), R.drawable.ic_menu_market_wishlist, Modifier.weight(1f))
            }
        }
        item { SectionRow(localizeSectionTitle(firstSection?.title ?: stringResource(R.string.home_our_favorites))) }
        item { HorizontalAppsRow(first, installedAppsRefreshKey, activeInstallSession, onAppClick) }
        item { SectionRow(localizeSectionTitle(secondSection?.title ?: stringResource(R.string.home_recommended))) }
        item { HorizontalAppsRow(second, installedAppsRefreshKey, activeInstallSession, onAppClick) }
    }
}

@Composable
private fun PlayPromotionsSwiper(heroBanners: List<HomeBanner>, onAppClick: (StoreApp) -> Unit) {
    val pagerState = rememberPagerState(
        initialPage = 0,
        pageCount = { heroBanners.size }
    )

    LaunchedEffect(heroBanners.size) {
        if (heroBanners.size <= 1) return@LaunchedEffect
        while (true) {
            delay(4500)
            val nextPage = (pagerState.currentPage + 1) % heroBanners.size
            pagerState.animateScrollToPage(nextPage)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 6.dp)
            .padding(horizontal = 8.dp)
            .background(Color.White)
            .padding(top = 8.dp, bottom = 10.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "АКЦИИ PLAY STORE",
                color = Color(0xFF3F3F3F),
                fontSize = 16.sp,
                fontWeight = FontWeight.Light
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = tr("Архивные промо", "Promo archive"),
                color = Color(0xFF8A8A8A),
                fontSize = 11.sp
            )
        }

        HorizontalPager(
            state = pagerState,
            key = { page -> heroBanners[page].id },
            modifier = Modifier
                .fillMaxWidth()
                .height(152.dp)
        ) { page ->
            Box(modifier = Modifier.padding(horizontal = 8.dp)) {
                HeroBannerCard(
                    banner = heroBanners[page],
                    onClick = { onAppClick(heroBanners[page].app) }
                )
            }
        }

        if (heroBanners.size > 1) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.Center
            ) {
                heroBanners.forEachIndexed { index, _ ->
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 3.dp)
                            .size(width = if (index == pagerState.currentPage) 14.dp else 6.dp, height = 6.dp)
                            .background(
                                color = if (index == pagerState.currentPage) Color(0xFFB2CB39) else Color(0x33000000),
                                shape = RoundedCornerShape(99.dp)
                            )
                    )
                }
            }
        }
    }
}

@Composable
private fun HeroBannerCard(banner: HomeBanner, onClick: () -> Unit) {
    val bannerImageUrl = banner.app.trailerImageUrl
        .ifBlank { banner.imageUrl }
        .ifBlank { banner.app.iconUrl }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(152.dp)
            .background(Color.White)
            .border(1.dp, Color(0x12000000))
            .clickable { onClick() }
    ) {
        AsyncImage(
            model = bannerImageUrl,
            contentDescription = banner.title,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
            placeholder = painterResource(R.mipmap.ic_menu_play_store),
            error = painterResource(R.mipmap.ic_menu_play_store),
            fallback = painterResource(R.mipmap.ic_menu_play_store)
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Color(0xB0000000))
                .padding(horizontal = 10.dp, vertical = 8.dp)
        ) {
            Column {
                Text(banner.title, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(banner.app.publisher, color = Color(0xFFE0E0E0), fontSize = 11.sp, maxLines = 1)
                Text("Акция Play Store", color = Color(0xFFBFD76A), fontSize = 10.sp, maxLines = 1)
            }
        }
    }
}

@Composable
private fun CategoriesPage(apps: List<StoreApp>, onCategoryClick: (String) -> Unit) {
    val categories = apps.map { it.category.trim() }.filter { it.isNotBlank() }.distinct().take(24)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        itemsIndexed(categories.chunked(2)) { _, row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { title ->
                    SmallCategoryCard(
                        text = categoryLabelRu(title),
                        iconRes = R.mipmap.ic_menu_apps,
                        modifier = Modifier.weight(1f).clickable { onCategoryClick(title) }
                    )
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun CategoryAppsPage(
    category: String,
    apps: List<StoreApp>,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    onAppClick: (StoreApp) -> Unit
) {
    val prepared = remember(apps) {
        apps.sortedWith(compareByDescending<StoreApp> { it.installsEstimate }.thenByDescending { it.reviews })
    }
    if (prepared.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Нет приложений в категории ${categoryLabelRu(category)}", color = Color(0xFF777777), fontSize = 14.sp)
        }
        return
    }
    TopListPage(
        title = categoryLabelRu(category),
        apps = prepared,
        installedAppsRefreshKey = installedAppsRefreshKey,
        activeInstallSession = activeInstallSession,
        onAppClick = onAppClick
    )
}

@Composable
private fun TopListPage(
    title: String,
    apps: List<StoreApp>,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    onAppClick: (StoreApp) -> Unit
) {
    val batchSize = 20
    val skeletonCount = 4
    val scope = rememberCoroutineScope()
    var visibleCount by rememberSaveable(title) { mutableStateOf(0) }
    var loadingMore by rememberSaveable(title) { mutableStateOf(false) }

    LaunchedEffect(apps.size) {
        if (visibleCount <= 0 && apps.isNotEmpty()) {
            visibleCount = min(batchSize, apps.size)
        }
        if (visibleCount > apps.size) {
            visibleCount = apps.size
        }
        if (apps.isEmpty()) {
            visibleCount = 0
            loadingMore = false
        }
    }

    val loadMore: () -> Unit = {
        if (!loadingMore && visibleCount < apps.size) {
            loadingMore = true
            scope.launch {
                delay(220)
                visibleCount = min(visibleCount + batchSize, apps.size)
                loadingMore = false
            }
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        item { SectionRow(title, showMore = false) }
        items(apps.take(visibleCount), key = { it.id }) { app ->
            CompactListItem(app, installedAppsRefreshKey, activeInstallSession) { onAppClick(app) }
        }
        if (loadingMore) {
            items(skeletonCount) { CompactListItemSkeleton() }
        }
        if (!loadingMore && visibleCount < apps.size) {
            item(key = "top-list-load-more-trigger") {
                LoadMoreTrigger(onLoadMore = loadMore)
            }
        }
    }
}

@Composable
private fun PagedChartPage(
    title: String,
    chart: String,
    apiClient: PlayApiClient,
    catalogMode: CatalogMode,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    onAppClick: (StoreApp) -> Unit,
    style: ChartCardStyle = ChartCardStyle.Classic,
    showHeader: Boolean = true
) {
    val mode = when (catalogMode) {
        CatalogMode.Apps -> "apps"
        CatalogMode.Games -> "games"
    }
    var items by remember(chart, mode) { mutableStateOf<List<StoreApp>>(emptyList()) }
    var hasMore by remember(chart, mode) { mutableStateOf(true) }
    var loading by remember(chart, mode) { mutableStateOf(true) }
    var loadingMore by remember(chart, mode) { mutableStateOf(false) }
    var error by remember(chart, mode) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun loadPage(reset: Boolean) {
        if ((loading || loadingMore) && !reset) return
        if (!reset && !hasMore) return
        if (reset) {
            loading = true
            error = null
        } else {
            loadingMore = true
        }
        val offset = if (reset) 0 else items.size
        scope.launch {
            val page = runCatching {
                withContext(Dispatchers.IO) {
                    apiClient.readChartPage(offset = offset, limit = 20, mode = mode, chart = chart)
                }
            }
            page.onSuccess { result ->
                items = if (reset) result.items else items + result.items
                hasMore = result.hasMore
                error = null
            }.onFailure {
                error = it.message
            }
            loading = false
            loadingMore = false
        }
    }

    LaunchedEffect(chart, mode) {
        loadPage(reset = true)
    }

    when {
        loading && items.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            LegacyPlayLoadingSpinner(size = 30.dp)
        }
        error != null && items.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё\n$error", color = Color(0xFF555555), fontSize = 14.sp)
        }
        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = 8.dp,
                top = if (showHeader) 0.dp else 8.dp,
                end = 8.dp,
                bottom = 8.dp
            ),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            if (showHeader) {
                item { PlayChartHeader(title) }
            }
            items(items, key = { it.id }) { app ->
                PlayChartListItem(
                    app = app,
                    installedAppsRefreshKey = installedAppsRefreshKey,
                    activeInstallSession = activeInstallSession,
                    style = style
                ) { onAppClick(app) }
            }
            if (loadingMore) {
                items(4) { PlayChartListItemSkeleton() }
            }
            if (!loadingMore && hasMore) {
                item(key = "paged-chart-load-more-$chart") {
                    LoadMoreTrigger(onLoadMore = { loadPage(reset = false) })
                }
            }
        }
    }
}

@Composable
private fun PlayChartHeader(title: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 14.dp, end = 14.dp, top = 10.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = title,
                color = Color(0xFF404040),
                fontSize = 19.sp,
                fontWeight = FontWeight.Light,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(Color(0xFFB2CB39))
        )
    }
}

@Composable
private fun PlayChartListItem(
    app: StoreApp,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    style: ChartCardStyle = ChartCardStyle.Classic,
    onClick: () -> Unit
) {
    val chartPriceColor = Color(0xFF86A81F)
    val chartTitleColor = Color(0xFF2F2F2F)
    val chartSubtitleColor = Color(0xFF8B8B8B)
    val chartRatingColor = Color(0xFF7D7D7D)
    val chartCountColor = Color(0xFFA0A0A0)
    val isInstalledOnDevice = rememberAppInstalledState(app.id, installedAppsRefreshKey)
    val statusUi = appCardStatusUi(app, isInstalledOnDevice, activeInstallSession)
    val interactionSource = remember { MutableInteractionSource() }
    val hovered by interactionSource.collectIsHoveredAsState()
    val pressed by interactionSource.collectIsPressedAsState()
    val grossingTopBg = if (hovered || pressed) Color(0xFFC7C7C7) else Color.Transparent

    if (style == ChartCardStyle.GrossingBlend) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(80.dp)
                .background(Color.White)
                .clickable(interactionSource = interactionSource, indication = null) { onClick() }
                .hoverable(interactionSource = interactionSource)
                .padding(end = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .background(grossingTopBg)
                    .padding(4.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White),
                    contentAlignment = Alignment.Center
                ) {
                    AppIconImage(app.iconUrl, 64.dp, cornerRadius = 12.dp)
                }
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 8.dp, end = 8.dp)
            ) {
                Text(
                    text = app.name,
                    color = chartTitleColor,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = app.publisher,
                    color = chartSubtitleColor,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(5.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LegacyStarText(
                        rating = app.ratingValue.takeIf { it > 0f } ?: derivedAverageRating(app.reviews)
                    )
                    if (app.reviews > 0) {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = app.reviews.toString(),
                            color = chartCountColor,
                            fontSize = 10.sp,
                            maxLines = 1
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    Text(
                        text = statusUi.label,
                        color = chartPriceColor,
                        fontSize = if (statusUi.compact) 10.sp else 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
        HorizontalDivider(color = Color(0x14000000), modifier = Modifier.padding(start = 88.dp))
        return
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 88.dp)
            .background(Color.White)
            .clickable { onClick() }
            .padding(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .padding(4.dp),
            contentAlignment = Alignment.Center
        ) {
            AppIconImage(app.iconUrl, 64.dp, cornerRadius = 10.dp)
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 8.dp, end = 8.dp)
        ) {
            Text(
                text = app.name,
                color = chartTitleColor,
                fontSize = 17.sp,
                fontWeight = FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = app.publisher,
                color = chartSubtitleColor,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(5.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                LegacyStarText(rating = ratingForCard(app))
                if (app.reviews > 0) {
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = app.reviews.toString(),
                        color = chartCountColor,
                        fontSize = 10.sp,
                        maxLines = 1
                    )
                }
            }
        }
            Text(
                text = statusUi.label,
                color = chartPriceColor,
                fontSize = if (statusUi.compact) 10.sp else 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
    }
    HorizontalDivider(color = Color(0x14000000), modifier = Modifier.padding(start = 88.dp))
}

@Composable
private fun PlayChartListItemSkeleton() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 88.dp)
            .background(Color.White)
            .padding(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .padding(8.dp)
                .background(Color(0xFFD8D8D8), RoundedCornerShape(10.dp))
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 8.dp, end = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Box(Modifier.fillMaxWidth(0.72f).height(15.dp).background(Color(0xFFE3E3E3), RoundedCornerShape(2.dp)))
            Box(Modifier.fillMaxWidth(0.48f).height(11.dp).background(Color(0xFFEAEAEA), RoundedCornerShape(2.dp)))
            Box(Modifier.fillMaxWidth(0.34f).height(10.dp).background(Color(0xFFF0F0F0), RoundedCornerShape(2.dp)))
        }
        Box(Modifier.width(42.dp).height(12.dp).background(Color(0xFFE6E6E6), RoundedCornerShape(2.dp)))
    }
    HorizontalDivider(color = Color(0x14000000), modifier = Modifier.padding(start = 88.dp))
}

@Composable
private fun SearchResultsPage(
    query: String,
    apiClient: PlayApiClient,
    catalogMode: CatalogMode,
    installedAppsRefreshKey: Int,
    activeInstallSession: InstallSessionState?,
    onAppClick: (StoreApp) -> Unit
) {
    val normalized = query.trim()
    var results by remember(normalized, catalogMode) { mutableStateOf<List<StoreApp>>(emptyList()) }
    var loading by remember(normalized, catalogMode) { mutableStateOf(false) }
    var error by remember(normalized, catalogMode) { mutableStateOf<String?>(null) }

    LaunchedEffect(normalized, catalogMode) {
        if (normalized.isBlank()) {
            results = emptyList()
            loading = false
            error = null
            return@LaunchedEffect
        }

        loading = true
        error = null
        val mode = when (catalogMode) {
            CatalogMode.Apps -> "apps"
            CatalogMode.Games -> "games"
        }
        runCatching {
            withContext(Dispatchers.IO) {
                apiClient.searchSummariesPaged(
                    query = normalized,
                    mode = mode,
                    maxResults = 120
                )
            }
        }.onSuccess {
            results = it
        }.onFailure {
            results = emptyList()
            error = it.message
        }
        loading = false
    }

    when {
        normalized.isBlank() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Введите текст для поиска", color = Color(0xFF777777), fontSize = 14.sp)
        }
        loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            LegacyPlayLoadingSpinner(size = 28.dp)
        }
        error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Ошибка поиска\n$error", color = Color(0xFF777777), fontSize = 14.sp)
        }
        results.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Ничего не найдено", color = Color(0xFF777777), fontSize = 14.sp)
        }
        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 8.dp, top = 8.dp, end = 8.dp, bottom = 8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            items(results, key = { it.id }) { app ->
                PlayChartListItem(
                    app = app,
                    installedAppsRefreshKey = installedAppsRefreshKey,
                    activeInstallSession = activeInstallSession,
                    style = ChartCardStyle.GrossingBlend
                ) { onAppClick(app) }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun PlayMarketPreview() {
    PlayMarketTheme { PlayMarketScreen() }
}
