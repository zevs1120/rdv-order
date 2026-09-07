package com.rdv.order

import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rdv.order.ui.*
import com.rdv.order.update.UpdateGate

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as RdvApplication
        setContent {
          UpdateGate(app) {
            var configured by remember { mutableStateOf(app.endpoint.isNotBlank()) }
            if (!configured) ConnectionSetup(app) { configured = true }
            else {
                val model: RdvViewModel = viewModel(factory = object : ViewModelProvider.Factory {
                    @Suppress("UNCHECKED_CAST")
                    override fun <T : ViewModel> create(modelClass: Class<T>): T = RdvViewModel(app.repository, app.strings, app.store) as T
                })
                val connectivity = remember { getSystemService(ConnectivityManager::class.java) }
                fun isOnline(): Boolean = connectivity.getNetworkCapabilities(connectivity.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
                var online by remember { mutableStateOf(isOnline()) }
                DisposableEffect(Unit) {
                    val callback = object : ConnectivityManager.NetworkCallback() {
                        override fun onAvailable(network: Network) { runOnUiThread { online = isOnline() } }
                        override fun onLost(network: Network) { runOnUiThread { online = isOnline() } }
                        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) { runOnUiThread { online = isOnline() } }
                    }
                    connectivity.registerDefaultNetworkCallback(callback)
                    onDispose { connectivity.unregisterNetworkCallback(callback) }
                }
                RdvRoot(model, online)
            }
          }
        }
    }
}

@Composable private fun ConnectionSetup(app: RdvApplication, complete: () -> Unit) {
    var address by rememberSaveable { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    RdvTheme {
        Surface(Modifier.fillMaxSize(), color = RdvColors.Background) {
            Column(Modifier.safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("RDV Order", style = MaterialTheme.typography.titleLarge)
                if (BuildConfig.DEBUG) {
                    Text("配置门店连接 / Store connection")
                    RdvField("门店网址 / Store URL", address, { address = it })
                    RdvButton("继续 / Continue", {
                        try { app.configureInternalEndpoint(address.trim()); complete() } catch (e: Exception) { error = e.message.orEmpty() }
                    }, enabled = address.isNotBlank())
                    Text("内部测试版。请使用测试环境，营业前需完成门店验收。\nInternal test build. Use a test environment until store acceptance is complete.")
                } else Text("尚未配置门店连接，请联系管理员。\nStore connection is not configured. Contact your administrator.")
                ErrorPanel(error) { error = "" }
            }
        }
    }
}
