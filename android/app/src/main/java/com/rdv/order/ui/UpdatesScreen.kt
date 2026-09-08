package com.rdv.order.ui

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.rdv.order.BuildConfig
import com.rdv.order.RdvApplication

@Composable fun UpdatesScreen(vm: RdvViewModel) {
    val app = LocalContext.current.applicationContext as RdvApplication
    val update by app.updates.state.collectAsStateWithLifecycle()
    val latest = update.latestRelease
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        RdvCard(Modifier.fillMaxWidth()) {
            Text("RDV Order")
            Text(vm.either("当前版本", "Current version") + " · v${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            Text(when {
                BuildConfig.DEBUG -> vm.either("内部测试版本", "Internal test build")
                update.checking -> vm.either("正在检查更新…", "Checking for updates…")
                update.checkFailed || latest == null -> vm.either("暂时无法确认是否为最新版本", "Unable to confirm update status")
                latest.versionCode > BuildConfig.VERSION_CODE -> vm.either("有新版本可用", "Update available")
                latest.versionCode == BuildConfig.VERSION_CODE -> vm.either("已是最新版本", "You're up to date")
                else -> vm.either("当前版本高于公开发布版本", "Installed version is newer than the public release")
            })
            latest?.let {
                Text(vm.either("最新发布版本", "Latest published version") + " · v${it.version} (${it.versionCode})")
                Text(vm.either(it.notes.zh, it.notes.en), color = RdvColors.Secondary)
            }
            if (!BuildConfig.DEBUG) {
                RdvButton(vm.either("检查更新", "Check for updates"), { app.updates.start(manual = true) },
                    Modifier.fillMaxWidth(), enabled = !update.checking)
            }
        }
    }
}
