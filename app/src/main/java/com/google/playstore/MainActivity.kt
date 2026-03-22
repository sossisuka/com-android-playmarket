package com.google.playstore

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.google.playstore.ui.PlayMarketScreen
import com.google.playstore.ui.theme.PlayMarketTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { PlayMarketTheme { PlayMarketScreen() } }
    }
}
