package com.rdv.order

import android.app.Application
import com.rdv.order.data.*
import com.rdv.order.ui.Strings
import com.rdv.order.update.*
import java.io.File
import kotlinx.coroutines.*

class RdvApplication : Application() {
    val updateClient by lazy {
        UpdateClient(File(cacheDir, "updates"), installedApk = { File(applicationInfo.sourceDir) },
            installedVersionCode = BuildConfig.VERSION_CODE) { file, release -> verifyUpdatePackage(this, file, release) }
    }
    val updates by lazy {
        val preferences = getSharedPreferences("rdv_updates", MODE_PRIVATE)
        UpdateController(BuildConfig.VERSION_CODE, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
            latest = updateClient::latest, download = updateClient::download,
            readKnown = { preferences.getString("required", null) },
            saveKnown = { value -> preferences.edit().putString("required", value).apply() })
    }
    val store by lazy { SecureStore(this) }
    val strings by lazy { Strings(this) }
    var endpoint: String = BuildConfig.API_BASE_URL
        private set
    private val connectionScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val api: ApiClient by lazy {
        ApiClient({ endpoint }, { if (this::repositoryReady.isInitialized) repositoryReady.session?.token.orEmpty() else "" },
            connection = { connection })
    }
    val connection: ConnectionMonitor by lazy { ConnectionMonitor(connectionScope) { api.checkConnectivity() } }
    val repository: RdvRepository by lazy {
        RdvRepository(api, store, { endpoint }).also { repositoryReady = it }
    }
    private lateinit var repositoryReady: RdvRepository
    override fun onCreate() {
        super.onCreate()
        // Internal test APK only; production origin is pinned at build time.
        if (BuildConfig.DEBUG && endpoint.isBlank()) endpoint = getSharedPreferences("rdv_setup", MODE_PRIVATE).getString("endpoint", "").orEmpty()
    }
    @android.annotation.SuppressLint("UseKtx") // Require a successful durable commit before leaving setup.
    fun configureInternalEndpoint(value: String) {
        check(BuildConfig.DEBUG)
        endpoint = ApiClient.validateOrigin(value)
        check(getSharedPreferences("rdv_setup", MODE_PRIVATE).edit().putString("endpoint", endpoint).commit())
    }
}
