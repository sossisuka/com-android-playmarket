package com.google.playstore.data

import android.content.Context

class AuthSessionStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun readToken(): String {
        return prefs.getString(KEY_TOKEN, "").orEmpty()
    }

    fun saveToken(token: String) {
        prefs.edit().putString(KEY_TOKEN, token).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_TOKEN).apply()
    }

    private companion object {
        const val PREFS_NAME = "playmarket_auth"
        const val KEY_TOKEN = "auth_token"
    }
}
