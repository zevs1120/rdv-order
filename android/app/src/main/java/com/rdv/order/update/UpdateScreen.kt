package com.rdv.order.update

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.rdv.order.BuildConfig
import com.rdv.order.RdvApplication
import com.rdv.order.ui.*
import kotlinx.coroutines.*

@Composable fun UpdateGate(app: RdvApplication, content: @Composable () -> Unit) {
    // Internal fixtures never contact production distribution or install a production package.
    if (BuildConfig.DEBUG) { content(); return }
    val controller = remember { app.updates }
    val state by controller.state.collectAsStateWithLifecycle()
    LaunchedEffect(controller) { controller.start() }
    if (!state.checking && state.release == null) { content(); return }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var language by rememberSaveable { mutableStateOf(Strings.systemLanguage()) }
    LaunchedEffect(Unit) {
        val saved = withContext(Dispatchers.IO) { runCatching { app.store.get("language") }.getOrNull() }
        if (saved in setOf("zh", "en")) language = saved!!
    }
    val installer = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { /* Cancellation keeps the gate closed. */ }
    var installing by remember { mutableStateOf(false) }
    fun install() {
        val file = state.apk ?: return
        val release = state.release ?: return
        if (installing) return
        installing = true
        scope.launch {
            try {
                withContext(Dispatchers.IO) { app.updateClient.verify(file, release) }
                installer.launch(updateInstallIntent(context, file))
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                controller.installFailed()
            } finally { installing = false }
        }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (context.packageManager.canRequestPackageInstalls()) install()
    }
    fun requestInstall() {
        try {
            if (context.packageManager.canRequestPackageInstalls()) install()
            else permission.launch(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
        } catch (_: Exception) { controller.installFailed() }
    }
    // Download completion opens the installer once. Returning/cancelling requires an explicit retry.
    var offeredPath by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(state.apk) {
        if (state.apk == null) offeredPath = null
        else if (offeredPath != state.apk!!.path) { offeredPath = state.apk!!.path; requestInstall() }
    }
    UpdateScreen(state, language, installing, onLanguage = { language = if (language == "zh") "en" else "zh" },
        onUpdate = { if (state.apk == null) controller.download() else requestInstall() })
}

@Composable fun UpdateScreen(state: UpdateState, language: String, installing: Boolean = false, onLanguage: () -> Unit, onUpdate: () -> Unit) {
    fun text(zh: String, en: String) = if (language == "zh") zh else en
    BackHandler { /* No path into ordering until this confirmed update is installed. */ }
    RdvTheme {
        Surface(Modifier.fillMaxSize(), color = RdvColors.Background) {
            Column(Modifier.safeDrawingPadding().verticalScroll(rememberScrollState()).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onLanguage) { Text(if (language == "zh") "English" else "中文") }
                }
                Text("RDV Order", style = MaterialTheme.typography.titleLarge)
                if (state.checking) {
                    CircularProgressIndicator(Modifier.size(28.dp))
                    Text(text("正在检查更新…", "Checking for updates…"))
                } else {
                    Text(text("更新后继续使用", "Update to continue"), style = MaterialTheme.typography.titleMedium)
                    Text("v${state.release?.version}", color = RdvColors.Secondary)
                    if (state.downloading) {
                        LinearProgressIndicator(progress = { state.progress / 100f }, modifier = Modifier.fillMaxWidth())
                        Text(text("正在下载 ${state.progress}%", "Downloading ${state.progress}%"))
                    }
                    if (state.failed) Text(text("更新未完成，请检查网络和可用空间后重试。", "Update incomplete. Check your connection and free space, then retry."), color = RdvColors.Danger)
                    if (state.apk != null) Text(text("请在系统页面允许安装并确认更新。取消后可再次安装。", "Allow installation and confirm the update on the system screen. If cancelled, tap Install again."))
                    RdvButton(text(if (state.apk == null) "下载更新" else "安装更新", if (state.apk == null) "Download update" else "Install update"), onUpdate,
                        Modifier.fillMaxWidth().testTag("update-action"), enabled = !state.downloading && !installing)
                }
            }
        }
    }
}
