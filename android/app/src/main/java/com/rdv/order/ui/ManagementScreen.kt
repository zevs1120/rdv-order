package com.rdv.order.ui

import android.app.DatePickerDialog
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import com.rdv.order.data.*
import com.rdv.order.domain.*
import java.io.File
import java.time.*
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

@Composable fun ManagementScreen(vm: RdvViewModel, state: UiState) {
    key(state.screen) {
        when (state.screen) {
            Screen.ORDERS, Screen.INCOME, Screen.HOT, Screen.SUMMARY -> ReportScreen(vm, state)
            Screen.FEES -> FeesScreen(vm, state)
            Screen.DEVICES -> DevicesScreen(vm, state)
            Screen.RBAC -> PermissionsScreen(vm, state)
            Screen.MENU -> MenuAdminScreen(vm, state)
            else -> Unit
        }
    }
}

@Composable fun ChoiceField(label: String, value: String, choices: List<Pair<String, String>>, onChange: (String) -> Unit, enabled: Boolean = true) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text(label, color = RdvColors.Secondary, fontSize = 12.sp)
        Box {
            RdvButton(choices.find { it.first == value }?.second ?: value, { expanded = true }, Modifier.fillMaxWidth(), secondary = true, enabled = enabled)
            DropdownMenu(expanded, { expanded = false }, modifier = Modifier.heightIn(max = 360.dp)) {
                choices.forEach { (key, text) -> DropdownMenuItem(text = { Text(text) }, onClick = { onChange(key); expanded = false }) }
            }
        }
    }
}
@Composable private fun DayField(label: String, value: String, onChange: (String) -> Unit, enabled: Boolean) {
    val context = LocalContext.current
    RdvButton("$label: $value", {
        val date = runCatching { LocalDate.parse(value) }.getOrDefault(LocalDate.now())
        DatePickerDialog(context, { _, y, m, d -> onChange(LocalDate.of(y, m + 1, d).toString()) }, date.year, date.monthValue - 1, date.dayOfMonth).show()
    }, Modifier.fillMaxWidth(), secondary = true, enabled = enabled)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable private fun ReportScreen(vm: RdvViewModel, state: UiState) {
    var preset by rememberSaveable { mutableStateOf("today") }
    var from by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var to by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    val table = state.filters["tableNo"].orEmpty()
    var export by rememberSaveable { mutableStateOf(false) }
    val data = state.management
    val isOrders = state.screen == Screen.ORDERS
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (!state.orderReturnToTable) RdvCard(Modifier.fillMaxWidth()) {
            ReportDatePresets(vm, preset, !state.busy) { key ->
                preset = key
                val range = DateRules.preset(key, LocalDate.now(), ZoneId.systemDefault())
                from = range.from.atZone(ZoneId.systemDefault()).toLocalDate().toString()
                to = range.to.atZone(ZoneId.systemDefault()).toLocalDate().toString()
                vm.filters(mapOf("from" to range.from.toString(), "to" to range.to.toString()) +
                    if (isOrders && table.isNotBlank()) mapOf("tableNo" to table) else emptyMap())
            }
            DayField(vm.either("开始", "From"), from, { from = it }, !state.busy)
            DayField(vm.either("结束", "To"), to, { to = it }, !state.busy)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                RdvButton(vm.text("income.custom"), {
                    try {
                        val range = DateRules.custom(LocalDate.parse(from), LocalDate.parse(to), ZoneId.systemDefault())
                        vm.filters(mapOf("from" to range.from.toString(), "to" to range.to.toString()) +
                            if (isOrders && table.isNotBlank()) mapOf("tableNo" to table) else emptyMap())
                        preset = ""
                    } catch (_: Exception) { vm.error(vm.either("时间范围无效", "Invalid time range")) }
                }, enabled = !state.busy)
                if (state.screen == Screen.INCOME) RdvButton(vm.text("income.export"), { export = true }, secondary = true, enabled = !state.busy)
            }
            if (isOrders && table.isNotBlank()) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("${vm.either("桌号", "Table")} $table")
                RdvButton(vm.either("全部订单", "All orders"), { vm.filters(state.filters - "tableNo") }, secondary = true, enabled = !state.busy)
            }
        }
        if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        when (state.screen) {
            Screen.ORDERS -> {
                val orders = remember(data) { data.rows("orders") }
                val amount = remember(orders) { orders.sumOf { it.number("amount").toLong() } }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatCard(vm.text("orders.totalCount"), orders.size.toString(), Modifier.weight(1f))
                    StatCard(vm.text("orders.totalRevenue"), "₱$amount", Modifier.weight(1f))
                }
                if (orders.isEmpty() && !state.loading) Text(vm.text("orders.empty"))
                orders.forEach { order -> key(order.text("id")) { OrderManagementCard(vm, state, order) } }
            }
            Screen.HOT -> {
                val items = remember(data) { data.rows("hotItems") }
                if (items.isEmpty() && !state.loading) Text(vm.either("当前时段暂无数据", "No data for this period"))
                items.forEachIndexed { index, item -> RdvCard(Modifier.fillMaxWidth()) {
                    Text("${index + 1}. ${vm.localized(item.text("name"))}", fontWeight = FontWeight.SemiBold)
                    Text(Seafood.quantity(item.text("name"), item.number("qty").toInt(), state.lang))
                } }
            }
            else -> {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatCard(vm.text("income.orderCount"), data.number("orderCount").toLong().toString(), Modifier.weight(1f))
                    StatCard(vm.text("income.total"), "₱${data.number("totalAmount").toLong()}", Modifier.weight(1f))
                }
                val rows = remember(data, state.screen) { data.rows(if (state.screen == Screen.SUMMARY) "items" else "byDay") }
                if (rows.isEmpty() && !state.loading) Text(vm.either("当前时段暂无收入数据", "No revenue data for this period"))
                rows.forEach { row -> RdvCard(Modifier.fillMaxWidth()) {
                    Text(if (state.screen == Screen.SUMMARY) vm.localized(row.text("name")) else remember(row) { dayLabel(row.text("day")) })
                    Text(if (state.screen == Screen.SUMMARY) "${row.number("qty").toInt()}" else "${vm.either("订单", "Orders")} ${row.number("order_count").toInt()} · ₱${row.number("amount").toLong()}")
                } }
            }
        }
    }
    if (export) ExportSheet(vm, state) { export = false }
}

private fun dayLabel(value: String) = runCatching { Instant.parse(value).atZone(ZoneId.systemDefault()).toLocalDate().toString() }.getOrDefault(value)
@Composable private fun StatCard(label: String, value: String, modifier: Modifier) { RdvCard(modifier) { Text(label, color = RdvColors.Secondary); Text(value, fontSize = 24.sp, fontWeight = FontWeight.Bold) } }

@OptIn(ExperimentalLayoutApi::class)
@Composable private fun OrderManagementCard(vm: RdvViewModel, state: UiState, order: JsonObject) {
    var expanded by rememberSaveable { mutableStateOf(state.orderReturnToTable) }
    var returning by remember { mutableStateOf<JsonObject?>(null) }
    var returnQty by rememberSaveable { mutableStateOf("1") }
    var operation by rememberSaveable { mutableStateOf("") }
    var reason by rememberSaveable { mutableStateOf("") }
    val id = order.text("id")
    val cancelled = order.text("cancelled_at").isNotEmpty()
    val createdLabel = remember(order) {
        runCatching { Instant.parse(order.text("created_at")).atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) }.getOrDefault(order.text("created_at"))
    }
    val actionHeight = with(androidx.compose.ui.platform.LocalDensity.current) { (24.sp.toDp() + 20.dp).coerceAtLeast(48.dp) }
    val actionModifier = Modifier.height(actionHeight)
    val status = vm.orderStatus(order.text("status"), cancelled)
    RdvCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("${vm.either("桌号", "Table")} ${order.text("table_no")} · #${id.take(8)}", fontWeight = FontWeight.Bold)
                Text("x${order.number("item_qty").toInt()} · $status · ₱${order.number("amount").toLong()}")
                Text(createdLabel, color = RdvColors.Secondary, fontSize = 12.sp)
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            RdvButton(vm.text(if (expanded) "orders.hideDetail" else "orders.detail"), { expanded = !expanded }, modifier = actionModifier, secondary = true)
            if (state.role == "manager") {
                if (!cancelled && order.text("status") == "submitted") {
                    RdvButton(vm.text("orders.cancel"), { operation = "cancel"; reason = "" }, modifier = actionModifier, secondary = true, enabled = !state.busy)
                    RdvButton(vm.text("orders.discount"), { vm.manageAction("/api/orders/$id/charges", body = jsonBody("type" to "discount")) }, modifier = actionModifier, secondary = true, enabled = !state.busy)
                    RdvButton(vm.text("orders.serviceFee"), { vm.manageAction("/api/orders/$id/charges", body = jsonBody("type" to "service_fee")) }, modifier = actionModifier, secondary = true, enabled = !state.busy)
                }
                if (order.text("status") == "closed" && order.number("amount") > 0) {
                    RdvButton(vm.text("orders.reverseCheckout"), { operation = "reverse"; reason = "" }, modifier = actionModifier, secondary = true, enabled = !state.busy)
                }
                RdvButton(vm.text("orders.delete"), { operation = "delete" }, modifier = actionModifier, secondary = true, danger = true, enabled = !state.busy)
            }
        }
        if (expanded) {
            order.rows("items").forEach { item ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${vm.localized(item.text("name"))} · ${Seafood.quantity(item.text("name"), item.number("qty").toInt(), state.lang)}")
                        if (item.text("note").isNotBlank()) Text(item.text("note"), color = RdvColors.Secondary)
                        Text("₱${item.number("unit_price").toLong()} · ₱${item.number("amount").toLong()}")
                    }
                    if (!cancelled && order.text("status") in setOf("submitted", "preparing", "served")) RdvButton(vm.text("orders.returnDish"), {
                        returning = item; returnQty = "1"
                    }, secondary = true, enabled = !state.busy)
                }
            }
        }
    }
    returning?.let { item ->
        val qty = returnQty.toIntOrNull()
        val max = item.number("qty").toInt()
        AlertDialog(onDismissRequest = { returning = null }, title = { Text(vm.text("orders.returnDish")) },
            text = { RdvField(vm.either("${vm.localized(item.text("name"))} 退菜数量（最多 $max）", "Return qty for ${vm.localized(item.text("name"))} (max $max)"), returnQty, { returnQty = it }, numeric = true) },
            confirmButton = { TextButton(enabled = !state.busy && qty != null && qty in 1..max, onClick = {
                vm.manageAction("/api/orders/$id/return-item", body = jsonBody("menuItemId" to item.text("menu_item_id"), "orderItemId" to item.text("order_item_id"), "qty" to qty, "reason" to "manual"))
                returning = null
            }) { Text(vm.either("确认退菜", "Confirm return")) } },
            dismissButton = { TextButton(onClick = { returning = null }) { Text(vm.text("common.cancel")) } })
    }
    if (operation.isNotBlank()) AlertDialog(onDismissRequest = { operation = "" },
        text = {
            if (operation == "delete") Text(vm.either("确认删除订单 ${id.take(8)} 吗？", "Delete order ${id.take(8)}?"))
            else RdvField(vm.text(if (operation == "cancel") "orders.cancelReasonPrompt" else "orders.reverseReasonPrompt"), reason, { reason = it })
        }, confirmButton = { RdvTextButton(onClick = {
            when (operation) {
                "delete" -> vm.manageAction("/api/orders/$id", "DELETE")
                "cancel" -> vm.manageAction("/api/orders/$id/cancel", body = jsonBody("reason" to reason))
                "reverse" -> vm.manageAction("/api/tables/reverse-checkout", body = jsonBody("tableNo" to order.text("table_no"), "reason" to reason))
            }
            operation = ""
        }, enabled = !state.busy && (operation == "delete" || reason.isNotBlank())) { Text(vm.text("common.done")) } },
        dismissButton = { RdvTextButton(onClick = { operation = "" }) { Text(vm.text("common.cancel")) } })
}

@Composable private fun ExportSheet(vm: RdvViewModel, state: UiState, onClose: () -> Unit) {
    val context = LocalContext.current
    var mode by rememberSaveable { mutableStateOf("single") }
    var start by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    var end by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    var pendingFile by rememberSaveable { mutableStateOf("") }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        val saved = pendingFile
        if (uri == null) { if (saved.isNotBlank()) File(saved).delete(); pendingFile = "" }
        else vm.action {
            withContext(Dispatchers.IO) {
                require(saved.isNotBlank() && File(saved).isFile) { "导出文件不可用，请重新导出" }
                context.contentResolver.openOutputStream(uri)?.use { output -> File(saved).inputStream().use { it.copyTo(output) } }
                    ?: error("无法保存导出文件")
                File(saved).delete()
            }
            pendingFile = ""
            vm.message(vm.text("income.exportReady"))
            onClose()
        }
    }
    val to = if (mode == "single") start else end
    val valid = runCatching { DateRules.months(start, to) }.isSuccess
    RdvSheet(vm.text("income.exportRange"), onClose, state.busy, footer = {
        RdvButton(vm.text("common.cancel"), onClose, secondary = true, enabled = !state.busy)
        RdvButton(vm.text("income.exportCsv"), {
            vm.action {
                DateRules.months(start, to)
                val response = vm.repository.api.request("/api/manage/income/export", query = mapOf("fromMonth" to start, "toMonth" to to,
                    "tzOffsetMin" to DateRules.exportOffsetMinutes(Instant.now(), ZoneId.systemDefault()).toString()), retries = 0)
                require(response.contentType?.contains("text/csv") == true) { "导出响应无效" }
                val filename = response.filename?.takeIf { Regex("[A-Za-z0-9_.-]+\\.csv").matches(it) }
                    ?: if (start == to) "RDV_Revenue_$start.csv" else "RDV_Revenue_${start}_to_$to.csv"
                val file = withContext(Dispatchers.IO) { File.createTempFile("rdv-export-", ".csv", context.cacheDir).apply { writeText(response.text, Charsets.UTF_8) } }
                pendingFile = file.absolutePath
                launcher.launch(filename)
            }
        }, enabled = valid && pendingFile.isEmpty(), loading = state.busy)
    }) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RdvChip(vm.text("income.exportSingleMonth"), mode == "single", { mode = "single" }, enabled = !state.busy)
            RdvChip(vm.text("income.exportMonthRange"), mode == "range", { mode = "range" }, enabled = !state.busy)
        }
        RdvField(vm.text(if (mode == "single") "income.exportMonth" else "income.exportStartMonth") + " (YYYY-MM)", start, { start = it }, enabled = !state.busy)
        if (mode == "range") RdvField(vm.text("income.exportEndMonth") + " (YYYY-MM)", end, { end = it }, enabled = !state.busy)
        if (!valid) Text(vm.either("请选择有效月份，结束月份不能早于开始月份", "Select valid months. End month must not be before start month."), color = RdvColors.Danger)
        ErrorPanel(state.error, vm::dismissError, vm.text("common.close"))
    }
}
