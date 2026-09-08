package com.rdv.order.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable fun RdvRoot(vm: RdvViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val subpage = state.screen !in setOf(Screen.LOGIN, Screen.TABLES)
    BackHandler(enabled = subpage || state.sheet.isNotEmpty() || state.busy) { vm.back() }
    val linearSettings = state.screen !in setOf(Screen.LOGIN, Screen.TABLES, Screen.ORDER)
    RdvTheme(linearSettings = linearSettings, flatOrdering = state.screen == Screen.ORDER) {
        Scaffold(containerColor = RdvColors.Background,
            topBar = {
                Surface(color = Color.White, shadowElevation = if (linearSettings) 0.dp else 1.dp) {
                    BoxWithConstraints(Modifier.statusBarsPadding().fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 4.dp), contentAlignment = Alignment.Center) {
                        if (state.screen == Screen.TABLES) {
                            TablesToolbar(vm, state)
                        } else {
                        val title = when (state.screen) {
                            Screen.LOGIN -> ""
                            Screen.TABLES -> vm.text("tables.title")
                            Screen.ORDER -> vm.either("桌号", "Table") + " ${state.draft?.tableNo.orEmpty()} · ${state.draft?.guests ?: 0} " + vm.either("人", "Guests")
                            Screen.MORE -> vm.text("nav.settings")
                            Screen.SUMMARY -> vm.either("汇总", "Summary")
                            else -> vm.text("manage.${state.screen.name.lowercase()}")
                        }
                        val hasRefresh = state.screen in setOf(Screen.TABLES, Screen.ORDERS, Screen.FEES, Screen.DEVICES, Screen.RBAC, Screen.MENU)
                        val sideWidth = 8.dp + 44.dp * (1 + (if (hasRefresh) 1 else 0) + (if (state.screen in setOf(Screen.TABLES, Screen.ORDER)) 1 else 0))
                        Text(title, Modifier.width((maxWidth - sideWidth * 2).coerceAtLeast(64.dp)), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        if (subpage) RdvToolbarButton(onClick = vm::back, modifier = Modifier.size(44.dp), enabled = !state.busy) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, vm.text("common.back"))
                        }
                        Spacer(Modifier.weight(1f))
                        if (state.screen in setOf(Screen.TABLES, Screen.ORDERS, Screen.FEES, Screen.DEVICES, Screen.RBAC, Screen.MENU)) {
                            RdvToolbarButton(onClick = vm::refresh, modifier = Modifier.size(44.dp), enabled = !state.busy && !state.loading) { Icon(Icons.Outlined.Refresh, vm.text("common.refresh")) }
                        }
                        if (state.screen == Screen.ORDER) RdvToolbarButton(onClick = { vm.sheet("actions") }, modifier = Modifier.size(44.dp), enabled = !state.busy) { Icon(Icons.Outlined.MoreVert, vm.either("操作", "Actions")) }
                        RdvToolbarButton(onClick = vm::toggleLanguage, modifier = Modifier.size(44.dp)) { Icon(Icons.Outlined.Language, if (state.lang == "zh") "Switch to English" else "切换到中文") }

                        }
                        }
                    }
                }
            }) { padding ->
            Box(Modifier.fillMaxSize().padding(padding).imePadding()) {
            Column(Modifier.fillMaxSize().padding(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (state.busy || !state.ready) LinearProgressIndicator(Modifier.fillMaxWidth(), color = RdvColors.Brand)
                ErrorPanel(state.error, vm::dismissError, vm.text("common.close"))
                Box(Modifier.weight(1f)) {
                    when (state.screen) {
                        Screen.LOGIN -> LoginScreen(vm, state)
                        Screen.TABLES -> TablesScreen(vm, state)
                        Screen.ORDER -> OrderScreen(vm, state)
                        Screen.MORE -> MoreScreen(vm, state)
                        Screen.UPDATES -> UpdatesScreen(vm)
                        else -> ManagementScreen(vm, state)
                    }
                }
            }
            if (state.screen in setOf(Screen.TABLES, Screen.ORDER)) {
                DraggableSettingsFab(vm.text("nav.settings"), state.lang, !state.busy) { vm.navigate(Screen.MORE) }
            }
            }
        }
        if (state.message.isNotEmpty()) AlertDialog(onDismissRequest = vm::dismissMessage,
            text = { Text(state.message) }, confirmButton = { RdvTextButton(onClick = vm::dismissMessage) { Text(vm.text("common.done")) } })
    }
}

@Composable private fun TablesToolbar(vm: RdvViewModel, state: UiState) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(vm.text("tables.title"), modifier = Modifier.weight(1f), fontSize = 16.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            RdvToolbarButton(onClick = vm::refresh, modifier = Modifier.size(48.dp), enabled = !state.busy && !state.loading) {
                Icon(Icons.Outlined.Refresh, vm.text("common.refresh"))
            }
            RdvToolbarButton(onClick = vm::toggleSelect, modifier = Modifier.size(48.dp).semantics { selected = state.selectMode }, enabled = !state.busy) {
                Icon(if (state.selectMode) Icons.Outlined.Check else Icons.Outlined.GridView,
                    if (state.selectMode) vm.text("common.done") else vm.either("拼桌选择", "Multi-select"),
                    tint = if (state.selectMode) RdvColors.Brand else RdvColors.Text)
            }
            RdvToolbarButton(onClick = vm::toggleLanguage, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Outlined.Language, if (state.lang == "zh") "Switch to English" else "切换到中文")
            }
        }
    }
}
