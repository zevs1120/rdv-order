package com.rdv.order

import android.app.Application
import com.rdv.order.data.*
import com.rdv.order.ui.Strings

class RdvApplication : Application() {
    val store by lazy { SecureStore(this) }
    val strings by lazy { Strings(this) }
    var endpoint: String = BuildConfig.API_BASE_URL
        private set
    val repository: RdvRepository by lazy {
        val api = ApiClient({ endpoint }, { if (this::repositoryReady.isInitialized) repositoryReady.session?.token.orEmpty() else "" })
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
