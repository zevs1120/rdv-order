package com.rdv.order.ui

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import com.rdv.order.data.TableInfo
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.delay

@Composable fun LoginScreen(vm: RdvViewModel, state: UiState) {
    var username by rememberSaveable { mutableStateOf("") }
    // Never save a PIN to saved-instance-state or persistent storage.
    var pin by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(vm.text("login.title"), style = MaterialTheme.typography.titleLarge)
        Text(vm.text("login.subtitle"), color = RdvColors.Secondary)
        RdvCard {
            RdvField(vm.text("login.username"), username, { username = it }, Modifier.testTag("username"), enabled = !state.busy)
            RdvField(vm.text("login.pin"), pin, { pin = it }, Modifier.testTag("pin"), password = true, enabled = !state.busy)
            RdvButton(vm.text(if (state.busy) "login.submitting" else "login.submit"), { vm.login(username, pin) }, Modifier.fillMaxWidth().testTag("login"),
                enabled = state.ready && username.isNotBlank() && pin.isNotEmpty(), loading = state.busy)
        }
        Text(vm.text("login.offlineNote"), color = RdvColors.Secondary)
    }
}

@Composable fun TablesScreen(vm: RdvViewModel, state: UiState) {
    var opening by remember { mutableStateOf<TableInfo?>(null) }
    var guests by rememberSaveable { mutableIntStateOf(2) }
    var mergeGuests by rememberSaveable { mutableIntStateOf(4) }
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) { while (true) { delay(60_000); now = Instant.now() } }
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        Row(Modifier.weight(1f).verticalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            (1..3).forEach { column ->
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.tables.filter { it.column == column }.forEach { table ->
                        val isOpen = table.status == "open"
                        val selected = (table.baseTables.firstOrNull() ?: table.tableNo) in state.selectedTables
                        val colors = if (isOpen) listOf(Color(0xFFB21E2F), Color(0xFF941725), Color(0xFF6F0F18))
                            else listOf(Color(0xFF2CB278), Color(0xFF1F9B66), Color(0xFF177A4F))
                        Surface(onClick = {
                            if (state.selectMode) vm.selectTable(table)
                            else if (isOpen) vm.enterTable(table) else { guests = 2; opening = table }
                        }, enabled = !state.busy, shape = RoundedCornerShape(14.dp), color = Color.Transparent,
                            border = if (selected) BorderStroke(3.dp, RdvColors.Text) else null,
                            modifier = Modifier.fillMaxWidth().testTag("table-${table.tableNo}")) {
                            Column(Modifier.background(Brush.linearGradient(colors)).heightIn(min = 108.dp).padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(table.tableNo, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color.White)
                                Text(if (isOpen) vm.either("服务中", "In Service") else vm.text("tables.idle"), fontSize = 12.sp, color = Color.White)
                                if (isOpen) {
                                    Text("${vm.either("人数", "Guests")}: ${table.guestCount ?: 1}", color = Color.White, fontSize = 12.sp)
                                    val minutes = runCatching { Duration.between(Instant.parse(table.openedAt), now).toMinutes().coerceAtLeast(0) }.getOrDefault(0)
                                    Text("${vm.either("时长", "Time")}: ${minutes}m", color = Color.White, fontSize = 12.sp)
                                    Text("${vm.either("账单", "Bill")}: ₱${table.currentAmount}", color = Color.White, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
        if (!state.loading && state.tables.isEmpty()) Text(vm.either("未找到桌台，请刷新后重试", "No table found. Please refresh and try again."))
        if (state.selectMode) RdvCard {
            Text("${vm.text("tables.selected")}: ${state.selectedTables.joinToString(" + ")}")
            Stepper(mergeGuests, { mergeGuests = it }, min = 1, max = 20, enabled = !state.busy)
            RdvButton(vm.text("tables.mergeConfirm"), { vm.mergeTables(mergeGuests) }, Modifier.fillMaxWidth(), enabled = state.selectedTables.size == 2, loading = state.busy)
        }
    }
    opening?.let { table ->
        RdvSheet(vm.either("开台", "Open Table") + " ${table.tableNo}", { opening = null }, state.busy,
            footer = {
                RdvButton(vm.text("common.cancel"), { opening = null }, Modifier.weight(1f), secondary = true, enabled = !state.busy)
                RdvButton(vm.text("tables.confirmOpen"), { vm.openTable(table, guests) }, Modifier.weight(1f), loading = state.busy)
            }) {
            Text(vm.text("tables.guestCount"))
            Stepper(guests, { guests = it }, min = 1, max = 20, enabled = !state.busy)
            ErrorPanel(state.error, vm::dismissError)
        }
    }
}

@Composable fun MoreScreen(vm: RdvViewModel, state: UiState) {
    val entries = buildList {
        add(Screen.ORDERS to "manage.orders")
        if (state.role == "manager") addAll(listOf(Screen.INCOME to "manage.income", Screen.FEES to "manage.fees", Screen.HOT to "manage.hot",
            Screen.DEVICES to "manage.devices", Screen.RBAC to "manage.rbac", Screen.MENU to "manage.menu"))
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        RdvCard {
            entries.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { (screen, key) -> RdvButton(vm.text(key), { vm.navigate(screen) }, Modifier.weight(1f).heightIn(min = 72.dp), secondary = true) }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
        Text(vm.either("点击模块进入对应的详细管理子页面。", "Tap one module to enter detailed management page."), color = RdvColors.Secondary)
    }
}
