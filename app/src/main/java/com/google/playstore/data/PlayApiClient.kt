package com.google.playstore.data

import androidx.compose.ui.graphics.Color
import com.google.playstore.model.HomeBanner
import com.google.playstore.model.HomeFeedSection
import com.google.playstore.model.HomePayload
import com.google.playstore.model.ApiPage
import com.google.playstore.model.StoreApp
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.Charset
import java.text.SimpleDateFormat
import java.util.Locale
import kotlin.math.min
import org.json.JSONArray
import org.json.JSONObject

class PlayApiClient(private val baseUrl: String) {
    fun readInitialSummaries(limit: Int = 300): List<StoreApp> {
        return readSummariesPage(offset = 0, limit = limit, mode = "all").items
    }

    fun readAllSummariesPaged(pageLimit: Int = 1000): List<StoreApp> {
        val out = ArrayList<StoreApp>()
        var offset = 0
        var hasMore = true
        while (hasMore) {
            val page = readSummariesPage(offset = offset, limit = pageLimit, mode = "all")
            if (page.items.isEmpty()) break
            out.addAll(page.items)
            offset += page.items.size
            hasMore = page.hasMore
        }
        return out
    }

    fun readAllSummaries(): List<StoreApp> {
        val firstPage = readSummariesPage(offset = 0, limit = 20_000, mode = "all")
        if (!firstPage.hasMore) return firstPage.items

        val out = ArrayList<StoreApp>(firstPage.items)
        var offset = firstPage.items.size
        var hasMore = firstPage.hasMore
        while (hasMore && offset < 200_000) {
            val page = readSummariesPage(offset = offset, limit = 5_000, mode = "all")
            if (page.items.isEmpty()) break
            out.addAll(page.items)
            hasMore = page.hasMore
            offset += page.items.size
        }
        return out
    }

    fun searchSummariesPaged(query: String, mode: String, maxResults: Int = 120): List<StoreApp> {
        if (query.isBlank()) return emptyList()
        val out = ArrayList<StoreApp>()
        var offset = 0
        var hasMore = true
        while (hasMore && out.size < maxResults) {
            val remaining = (maxResults - out.size).coerceAtLeast(1)
            val page = readSummariesPage(
                offset = offset,
                limit = min(20, remaining),
                mode = mode,
                query = query
            )
            if (page.items.isEmpty()) break
            out.addAll(page.items)
            offset += page.items.size
            hasMore = page.hasMore
        }
        return out
    }

    fun readById(appId: String): StoreApp? {
        val json = getJson("/apps/${encodeUrlPart(appId)}")
        if (!json.has("app")) return null
        return mapJsonToStoreApp(json.optJSONObject("app") ?: return null, includeMedia = true)
    }

    fun readHome(mode: String): HomePayload {
        val json = getJson("/home?mode=${encodeUrlPart(mode)}")
        val bannersJson = json.optJSONArray("heroBanners") ?: JSONArray()
        val sectionsJson = json.optJSONArray("sections") ?: JSONArray()
        val banners = ArrayList<HomeBanner>(bannersJson.length())
        val sections = ArrayList<HomeFeedSection>(sectionsJson.length())

        for (i in 0 until bannersJson.length()) {
            val obj = bannersJson.optJSONObject(i) ?: continue
            val appJson = obj.optJSONObject("app") ?: continue
            banners.add(
                HomeBanner(
                    id = obj.optString("id"),
                    title = obj.optString("title"),
                    imageUrl = obj.optString("imageUrl"),
                    app = mapJsonToStoreApp(appJson, includeMedia = false)
                )
            )
        }

        for (i in 0 until sectionsJson.length()) {
            val obj = sectionsJson.optJSONObject(i) ?: continue
            val itemsJson = obj.optJSONArray("items") ?: JSONArray()
            val items = ArrayList<StoreApp>(itemsJson.length())
            for (j in 0 until itemsJson.length()) {
                val itemObj = itemsJson.optJSONObject(j) ?: continue
                items.add(mapJsonToStoreApp(itemObj, includeMedia = false))
            }
            sections.add(
                HomeFeedSection(
                    key = obj.optString("key"),
                    title = obj.optString("title"),
                    items = items
                )
            )
        }

        return HomePayload(heroBanners = banners, sections = sections)
    }

    fun readChartPage(offset: Int, limit: Int, mode: String, chart: String): ApiPage<StoreApp> {
        val query = "/apps?offset=$offset&limit=$limit&mode=${encodeUrlPart(mode)}&chart=${encodeUrlPart(chart)}"
        val json = getJson(query)
        val itemsJson = json.optJSONArray("items") ?: JSONArray()
        val items = ArrayList<StoreApp>(itemsJson.length())
        for (i in 0 until itemsJson.length()) {
            val obj = itemsJson.optJSONObject(i) ?: continue
            items.add(mapJsonToStoreApp(obj, includeMedia = false))
        }
        return ApiPage(items = items, hasMore = json.optBoolean("hasMore", false))
    }

    private fun readSummariesPage(offset: Int, limit: Int, mode: String, query: String = ""): ApiPage<StoreApp> {
        val requestPath = buildString {
            append("/apps?offset=$offset&limit=$limit&mode=${encodeUrlPart(mode)}")
            if (query.isNotBlank()) append("&q=${encodeUrlPart(query)}")
        }
        val json = getJson(requestPath)
        val itemsJson = json.optJSONArray("items") ?: JSONArray()
        val items = ArrayList<StoreApp>(itemsJson.length())
        for (i in 0 until itemsJson.length()) {
            val obj = itemsJson.optJSONObject(i) ?: continue
            items.add(mapJsonToStoreApp(obj, includeMedia = false))
        }
        return ApiPage(items = items, hasMore = json.optBoolean("hasMore", false))
    }

    private fun getJson(pathWithQuery: String): JSONObject {
        val url = URL(baseUrl.trimEnd('/') + pathWithQuery)
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 15_000
            readTimeout = 60_000
            setRequestProperty("Accept", "application/json")
        }

        return try {
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (code !in 200..299) {
                error("API request failed ($code): $text")
            }
            JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }
}

private fun mapJsonToStoreApp(obj: JSONObject, includeMedia: Boolean): StoreApp {
    val id = obj.optString("id")
    val publisher = fixMojibake(obj.optString("publisher", "Unknown"))
    val subtitleRaw = localizeDatesInText(fixMojibake(obj.optString("subtitle", "")))
    val screenshots = if (includeMedia) obj.optJSONArray("screenshots").toStringList() else emptyList()

    return StoreApp(
        id = id,
        name = fixMojibake(obj.optString("name", "Unknown")),
        subtitle = if (subtitleRaw.isBlank()) publisher else subtitleRaw,
        publisher = publisher,
        category = obj.optString("category", ""),
        priceRaw = obj.optString("price", ""),
        installsRaw = obj.optString("installs", ""),
        iconUrl = obj.optString("icon", ""),
        trailerImageUrl = if (includeMedia) obj.optString("trailerImage", "") else "",
        trailerUrl = if (includeMedia) obj.optString("trailerUrl", "") else "",
        screenshots = screenshots,
        reviews = obj.optLong("reviews", 0L),
        thumbnailColor = parseHslColor(obj.optString("color", "")),
        ratingValue = obj.optDouble("ratingValue", 0.0).toFloat(),
        ratingCountText = fixMojibake(obj.optString("ratingCountText", "")),
        updatedAt = obj.optString("updatedAt", ""),
        sizeLabel = obj.optString("size", ""),
        version = obj.optString("version", ""),
        requiresAndroid = obj.optString("requiresAndroid", ""),
        contentRating = obj.optString("contentRating", ""),
        descriptionBlocks = if (includeMedia) obj.optJSONArray("description").toStringList().map(::fixMojibake) else emptyList(),
        whatsNew = if (includeMedia) obj.optJSONArray("whatsNew").toStringList().map(::fixMojibake) else emptyList(),
        similarAppIds = if (includeMedia) obj.optJSONArray("similarIds").toStringList() else emptyList(),
        moreFromDeveloperIds = if (includeMedia) obj.optJSONArray("moreFromDeveloperIds").toStringList() else emptyList()
    )
}

private fun JSONArray?.toStringList(): List<String> {
    if (this == null) return emptyList()
    val out = ArrayList<String>(length())
    for (i in 0 until length()) {
        val v = optString(i, "")
        if (v.isNotBlank()) out.add(v)
    }
    return out
}


private fun localizeDatesInText(text: String): String {
    if (text.isBlank()) return text
    val dateRegex = Regex("""\b(\d{4})-(\d{2})-(\d{2})\b""")
    val sourceFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }
    val targetFormat = SimpleDateFormat("d MMMM yyyy", Locale.getDefault())
    return dateRegex.replace(text) { match ->
        val raw = match.value
        runCatching { sourceFormat.parse(raw) }
            .getOrNull()
            ?.let { targetFormat.format(it) }
            ?: raw
    }
}

private fun parseHslColor(raw: String): Color {
    val match = Regex("""hsl\((\d+)\s+(\d+)%\s+(\d+)%\)""").find(raw) ?: return Color(0xFFE0E0E0)
    val h = match.groupValues[1].toFloat()
    val s = match.groupValues[2].toFloat() / 100f
    val l = match.groupValues[3].toFloat() / 100f
    val c = (1f - kotlin.math.abs(2f * l - 1f)) * s
    val x = c * (1f - kotlin.math.abs((h / 60f) % 2f - 1f))
    val m = l - c / 2f
    val (rf, gf, bf) = when {
        h < 60f -> Triple(c, x, 0f)
        h < 120f -> Triple(x, c, 0f)
        h < 180f -> Triple(0f, c, x)
        h < 240f -> Triple(0f, x, c)
        h < 300f -> Triple(x, 0f, c)
        else -> Triple(c, 0f, x)
    }
    return Color((rf + m).coerceIn(0f, 1f), (gf + m).coerceIn(0f, 1f), (bf + m).coerceIn(0f, 1f), 1f)
}

private fun encodeUrlPart(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())

private fun fixMojibake(value: String): String {
    if (value.isBlank()) return value
    val converted = runCatching { String(value.toByteArray(Charset.forName("windows-1251")), Charsets.UTF_8) }
        .getOrDefault(value)
    return if (cyrillicScore(converted) > cyrillicScore(value)) converted else value
}

private fun cyrillicScore(text: String): Int = text.count { it in '\u0400'..'\u04FF' }
