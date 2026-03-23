package com.google.playstore.model

import androidx.annotation.StringRes
import androidx.compose.ui.graphics.Color
import com.google.playstore.R
import java.util.Locale

enum class HomeTab(@StringRes val titleRes: Int) {
    Categories(R.string.tab_categories),
    Home(R.string.tab_home),
    TopGrossing(R.string.tab_top_grossing),
    TopNewPaid(R.string.tab_top_new_paid),
    TopNewFree(R.string.tab_top_new_free),
    TopPaid(R.string.tab_top_paid),
    TopFree(R.string.tab_top_free)
}

enum class CatalogMode { Apps, Games }

enum class DrawerSection { Home, MyApps, Games, Categories, Editors, Settings }

data class HomeBanner(
    val id: String,
    val title: String,
    val imageUrl: String,
    val app: StoreApp
)

data class HomeFeedSection(
    val key: String,
    val title: String,
    val items: List<StoreApp>
)

data class HomePayload(
    val heroBanners: List<HomeBanner>,
    val sections: List<HomeFeedSection>
)

data class StoreApp(
    val id: String,
    val name: String,
    val subtitle: String,
    val publisher: String,
    val category: String,
    val priceRaw: String,
    val installsRaw: String,
    val iconUrl: String,
    val trailerImageUrl: String,
    val trailerUrl: String,
    val screenshots: List<String>,
    val reviews: Long,
    val thumbnailColor: Color,
    val ratingValue: Float = 0f,
    val ratingCountText: String = "",
    val updatedAt: String = "",
    val sizeLabel: String = "",
    val version: String = "",
    val requiresAndroid: String = "",
    val contentRating: String = "",
    val descriptionBlocks: List<String> = emptyList(),
    val whatsNew: List<String> = emptyList(),
    val similarAppIds: List<String> = emptyList(),
    val moreFromDeveloperIds: List<String> = emptyList()
) {
    val isFree: Boolean
        get() {
            val p = priceRaw.lowercase()
            return p.contains("free") || p.contains("бесплат") || p == "0" || p == "0.0"
        }

    val priceLabel: String
        get() {
            if (isFree) return tr("БЕСПЛАТНО", "FREE")
            val raw = priceRaw.trim()
            return when {
                raw.startsWith("USD ", ignoreCase = true) -> "$" + raw.substring(4).trim()
                raw.equals("USD", ignoreCase = true) -> "$"
                else -> raw.ifBlank { tr("ПЛАТНО", "PAID") }
            }
        }

    val installsEstimate: Long
        get() = parseInstallsEstimate(installsRaw)
}

data class ApiPage<T>(
    val items: List<T>,
    val hasMore: Boolean
)

data class AuthUser(
    val id: String,
    val email: String,
    val firstName: String,
    val lastName: String,
    val name: String,
    val country: String,
    val createdAt: String,
    val favoriteAppIds: List<String> = emptyList(),
    val libraryAppIds: List<String> = emptyList()
)

data class AuthSession(
    val token: String,
    val user: AuthUser
)

fun tr(ru: String, en: String): String {
    return if (Locale.getDefault().language.lowercase().startsWith("ru")) ru else en
}

private fun parseInstallsEstimate(raw: String): Long {
    if (raw.isBlank()) return 0L
    val nums = Regex("""\d[\d,\s.]*""")
        .findAll(raw)
        .map { it.value.replace(Regex("""[^\d]"""), "") }
        .mapNotNull { it.toLongOrNull() }
        .toList()
    return nums.maxOrNull() ?: 0L
}
