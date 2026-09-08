package com.rdv.order

import android.net.ConnectivityManager
import android.net.Network
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
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
                DisposableEffect(model) {
                    var lastNetwork: Network? = null
                    var lastCapabilities: Pair<Boolean, Boolean>? = null
                    val callback = object : ConnectivityManager.NetworkCallback() {
                        override fun onAvailable(network: Network) { runOnUiThread {
                            if (lastNetwork != network) {
                                lastNetwork = network; lastCapabilities = null
                                app.connection.networkChanged()
                            }
                        } }
                        override fun onLost(network: Network) { runOnUiThread {
                            if (lastNetwork == network) {
                                lastNetwork = null; lastCapabilities = null
                                app.connection.networkChanged()
                            }
                        } }
                        override fun onCapabilitiesChanged(network: Network, caps: android.net.NetworkCapabilities) {
                            val next = caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) to
                                caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                            runOnUiThread {
                                if (network == lastNetwork && lastCapabilities != next) {
                                    lastCapabilities = next
                                    app.connection.networkChanged()
                                }
                            }
                        }
                    }
                    val observer = LifecycleEventObserver { _, event ->
                        if (event == Lifecycle.Event.ON_START) app.connection.setForeground(true)
                        if (event == Lifecycle.Event.ON_STOP) app.connection.setForeground(false)
                    }
                    connectivity.registerDefaultNetworkCallback(callback)
                    lifecycle.addObserver(observer)
                    app.connection.setForeground(lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
                    onDispose {
                        connectivity.unregisterNetworkCallback(callback)
                        lifecycle.removeObserver(observer)
                        app.connection.setForeground(false)
                    }
                }
                RdvRoot(model)
                ConnectionRecovery(model, app.connection)
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
                ErrorPanel(error, { error = "" }, "关闭 / Close")
            }
        }
    }
}
