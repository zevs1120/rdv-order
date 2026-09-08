package com.rdv.order.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.rdv.order.data.ConnectionMonitor

@Composable fun ConnectionRecovery(vm: RdvViewModel, monitor: ConnectionMonitor) {
    val connection by monitor.state.collectAsStateWithLifecycle()
    val ui by vm.state.collectAsStateWithLifecycle()
    var consumed by remember(vm) { mutableLongStateOf(0L) }
    LaunchedEffect(connection.refreshGeneration, ui.ready, ui.busy, ui.loading, ui.sheet, ui.screen) {
        if (connection.refreshGeneration > consumed && ui.ready && !ui.busy && !ui.loading && ui.sheet.isEmpty()) {
            consumed = connection.refreshGeneration
            vm.restoreConnectionReads()
        }
    }
    if (connection.disconnected) RdvTheme {
        AlertDialog(onDismissRequest = {},
            title = { Text(vm.either("暂时无法连接", "Unable to connect")) },
            text = { Text(vm.either("正在自动尝试恢复连接。你也可以检查网络后点击重试。",
                "Trying to reconnect automatically. You can also check your network and retry.")) },
            confirmButton = {
                RdvButton(if (connection.checking) vm.either("正在重连…", "Reconnecting…") else vm.either("重试", "Retry"),
                    onClick = monitor::retry, enabled = !connection.checking)
            })
    }
}
