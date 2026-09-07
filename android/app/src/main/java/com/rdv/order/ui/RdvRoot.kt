package com.rdv.order.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable fun RdvRoot(vm: RdvViewModel, online: Boolean = true) {
    val state by vm.state.collectAsStateWithLifecycle()
    val subpage = state.screen !in setOf(Screen.LOGIN, Screen.TABLES, Screen.MORE)
    BackHandler(enabled = subpage || state.sheet.isNotEmpty() || state.busy) { vm.back() }
    RdvTheme {
        Scaffold(containerColor = RdvColors.Background,
            topBar = {
                Surface(color = Color.White, shadowElevation = 1.dp) {
                    BoxWithConstraints(Modifier.statusBarsPadding().fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 4.dp), contentAlignment = Alignment.Center) {
                        val title = when (state.screen) {
                            Screen.LOGIN -> ""
                            Screen.TABLES -> vm.text("tables.title")
                            Screen.ORDER -> vm.either("桌号", "Table") + " ${state.draft?.tableNo.orEmpty()} · ${state.draft?.guests ?: 0} " + vm.either("人", "Guests")
                            Screen.MORE -> vm.text("nav.manage")
                            Screen.SUMMARY -> vm.either("汇总", "Summary")
                            else -> vm.text("manage.${state.screen.name.lowercase()}")
                        }
                        val hasRefresh = state.screen in setOf(Screen.TABLES, Screen.ORDERS, Screen.FEES, Screen.DEVICES, Screen.RBAC, Screen.MENU)
                        val sideWidth = 16.dp + 44.dp * (1 + (if (hasRefresh) 1 else 0) + (if (state.screen in setOf(Screen.TABLES, Screen.ORDER)) 1 else 0))
                        Text(title, Modifier.width((maxWidth - sideWidth * 2).coerceAtLeast(64.dp)), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        if (subpage) IconButton(onClick = vm::back, modifier = Modifier.size(44.dp), enabled = !state.busy) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, vm.text("common.back"))
                        }
                        Spacer(Modifier.weight(1f))
                        if (state.screen in setOf(Screen.TABLES, Screen.ORDERS, Screen.FEES, Screen.DEVICES, Screen.RBAC, Screen.MENU)) {
                            IconButton(onClick = vm::refresh, modifier = Modifier.size(44.dp), enabled = !state.busy && !state.loading) { Icon(Icons.Outlined.Refresh, vm.text("common.refresh")) }
                        }
                        if (state.screen == Screen.TABLES) IconButton(onClick = vm::toggleSelect, modifier = Modifier.size(44.dp), enabled = !state.busy) {
                            Icon(if (state.selectMode) Icons.Outlined.Check else Icons.Outlined.GridView, vm.either("拼桌选择", "Multi-select"))
                        }
                        if (state.screen == Screen.ORDER) IconButton(onClick = { vm.sheet("actions") }, modifier = Modifier.size(44.dp), enabled = !state.busy) { Icon(Icons.Outlined.MoreVert, vm.either("操作", "Actions")) }
                        IconButton(onClick = vm::toggleLanguage, modifier = Modifier.size(44.dp)) { Icon(Icons.Outlined.Language, if (state.lang == "zh") "Switch to English" else "切换到中文") }
                        Box(Modifier.padding(end = 8.dp).size(8.dp).background(if (online) RdvColors.Success else RdvColors.Danger, CircleShape)
                            .semantics { contentDescription = vm.text(if (online) "network.online" else "network.offline") })
                        }
                    }
                }
            },
            bottomBar = {
                if (state.screen != Screen.LOGIN) Surface(color = Color.White, shadowElevation = 2.dp) {
                    Row(Modifier.navigationBarsPadding().fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        val tables = state.screen in setOf(Screen.TABLES, Screen.ORDER)
                        RdvButton(vm.text("nav.tables"), { vm.navigate(Screen.TABLES) }, Modifier.weight(1f), secondary = !tables, enabled = !state.busy)
                        RdvButton(vm.text("nav.more"), { vm.navigate(Screen.MORE) }, Modifier.weight(1f), secondary = tables, enabled = !state.busy)
                    }
                }
            }) { padding ->
            Column(Modifier.fillMaxSize().padding(padding).imePadding().padding(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (state.busy || !state.ready) LinearProgressIndicator(Modifier.fillMaxWidth(), color = RdvColors.Brand)
                ErrorPanel(state.error, vm::dismissError)
                Box(Modifier.weight(1f)) {
                    when (state.screen) {
                        Screen.LOGIN -> LoginScreen(vm, state)
                        Screen.TABLES -> TablesScreen(vm, state)
                        Screen.ORDER -> OrderScreen(vm, state)
                        Screen.MORE -> MoreScreen(vm, state)
                        else -> ManagementScreen(vm, state)
                    }
                }
            }
        }
        if (state.message.isNotEmpty()) AlertDialog(onDismissRequest = vm::dismissMessage,
            text = { Text(state.message) }, confirmButton = { TextButton(onClick = vm::dismissMessage) { Text(vm.text("common.done")) } })
    }
}
