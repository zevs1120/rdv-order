package com.rdv.order.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import com.rdv.order.data.*
import kotlinx.serialization.json.*

@Composable fun ConfirmAction(message: String, vm: RdvViewModel, dismiss: () -> Unit, confirm: () -> Unit) {
    AlertDialog(onDismissRequest = dismiss, text = { Text(message) },
        confirmButton = { RdvTextButton(onClick = confirm) { Text(vm.text("common.done")) } },
        dismissButton = { RdvTextButton(onClick = dismiss) { Text(vm.text("common.cancel")) } })
}

@Composable fun FeesScreen(vm: RdvViewModel, state: UiState) {
    val rules = state.management.rows("rules")
    var expanded by rememberSaveable { mutableStateOf(true) }
    var deleting by remember { mutableStateOf<JsonObject?>(null) }
    fun setRules(next: List<JsonObject>) = vm.updateManagement(JsonObject(state.management + ("rules" to JsonArray(next))))
    fun update(index: Int, key: String, value: JsonElement) = setRules(rules.mapIndexed { i, rule -> if (i == index) JsonObject(rule + (key to value)) else rule })
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        RdvCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(vm.text("fees.section"), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                RdvTextButton(onClick = { expanded = !expanded }) { Text(vm.text(if (expanded) "common.collapse" else "common.expand")) }
            }
            if (expanded) Text(vm.text("fees.hint"), color = RdvColors.Secondary)
        }
        if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (expanded) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("${vm.text("fees.activeCount")}: ${rules.count { it.flag("is_active") }}", Modifier.weight(1f))
                RdvButton(vm.text("fees.addRule"), {
                    setRules(rules + jsonBody("id" to "", "name" to "", "charge_type" to "service_fee", "mode" to "percent", "value" to 10, "is_active" to false,
                        "sort_order" to ((rules.maxOfOrNull { it.number("sort_order").toInt() } ?: 0) + 10)))
                }, secondary = true, enabled = !state.busy && !state.loading)
            }
            if (rules.isEmpty() && !state.loading) Text(vm.text("fees.empty"))
            rules.forEachIndexed { index, rule ->
                RdvCard(Modifier.fillMaxWidth()) {
                    RdvField(vm.text("fees.name"), rule.text("name"), { update(index, "name", JsonPrimitive(it)) }, enabled = !state.busy)
                    ChoiceField(vm.either("类型", "Type"), rule.text("charge_type"), listOf("service_fee" to vm.text("orders.serviceFee"), "discount" to vm.text("orders.discount"), "tax" to vm.either("税费", "Tax")), { update(index, "charge_type", JsonPrimitive(it)) }, !state.busy)
                    ChoiceField(vm.either("计费方式", "Mode"), rule.text("mode"), listOf("percent" to vm.text("fees.percent"), "amount" to vm.text("fees.amount")), { update(index, "mode", JsonPrimitive(it)) }, !state.busy)
                    RdvField(vm.either("数值", "Value"), rule.number("value").toInt().toString(), { update(index, "value", JsonPrimitive(it.filter(Char::isDigit).toIntOrNull() ?: 0)) }, numeric = true, enabled = !state.busy)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(vm.either("启用", "Enabled"), Modifier.weight(1f))
                        Switch(rule.flag("is_active"), { update(index, "is_active", JsonPrimitive(it)) }, enabled = !state.busy)
                        RdvButton(vm.text("common.delete"), {
                            if (rule.text("id").isBlank()) setRules(rules.filterIndexed { i, _ -> i != index }) else deleting = rule
                        }, secondary = true, danger = true, enabled = !state.busy)
                    }
                }
            }
            RdvButton(vm.text("common.save"), {
                val valid = rules.filter { it.text("name").isNotBlank() && it.number("value") > 0 && it.number("value") % 1 == 0.0 }
                    .map { rule -> JsonObject(rule.filterKeys { it != "id" || rule.text("id").isNotEmpty() } + ("name" to JsonPrimitive(rule.text("name").trim()))) }
                if (valid.isEmpty()) vm.error(vm.either("请至少填写一条有效费用规则", "Add at least one valid fee rule"))
                else vm.action {
                    vm.repository.requestObject("/api/pricing/rules", "PATCH", jsonBody("rules" to JsonArray(valid)), timeoutMs = 9_000)
                    vm.loadManagement()
                }
            }, Modifier.fillMaxWidth(), loading = state.busy, enabled = !state.loading)
        }
    }
    deleting?.let { rule -> ConfirmAction(vm.either("确认删除费用规则「${rule.text("name")}」吗？", "Delete fee rule \"${rule.text("name")}\"?"), vm, { deleting = null }) {
        vm.manageAction("/api/pricing/rules/${rule.text("id")}", "DELETE"); deleting = null
    } }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable fun DevicesScreen(vm: RdvViewModel, state: UiState) {
    val data = state.management
    val jobs = data.rows("jobs")
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        RdvCard(Modifier.fillMaxWidth()) {
            Text("RDV N260L", fontWeight = FontWeight.Bold)
            Text(vm.either("局域网打印 · 厨房联和账单", "Local printing · Kitchen tickets and bills"))
            Text(vm.either("手机需连接酒店内部 Wi-Fi", "Connect this phone to hotel Wi-Fi"), color = RdvColors.Secondary)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RdvButton(vm.either("测试打印", "Test print"), { vm.localPrinterAction(true) }, secondary = true, enabled = !state.busy)
                RdvButton(vm.text("devices.retryPrint"), { vm.localPrinterAction(false) }, secondary = true, enabled = !state.busy)
            }
        }
        Text(vm.either("待发送：", "Not sent: ") + jobs.count { it.text("status") == "queued" })
        jobs.forEach { job -> RdvCard(Modifier.fillMaxWidth()) {
            Text(vm.either("桌号 ", "Table ") + job.text("tableNo") + " · " +
                if (job.text("kind") == "receipt") vm.either("账单", "Bill") else vm.either("厨房联", "Kitchen ticket"))
            Text(if (job.text("status") == "queued") vm.either("未发送，可重试", "Not sent; safe to retry")
                else vm.either("结果未确认，请核对纸张，不会自动重打", "Unconfirmed; check the paper. No automatic resend."), color = RdvColors.Secondary)
        } }
    }
}

@Composable fun PermissionsScreen(vm: RdvViewModel, state: UiState) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        listOf("waiter", "manager").forEach { role ->
            RdvCard(Modifier.fillMaxWidth()) {
                Text(if (role == "waiter") vm.either("服务员", "Waiter") else vm.either("经理", "Manager"), fontWeight = FontWeight.Bold)
                state.management.rows("rows").filter { it.text("role") == role }.forEach { permission ->
                    val key = permission.text("permission")
                    val meta = vm.strings.permissions[key] as? JsonObject
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(meta?.text(state.lang)?.ifBlank { key } ?: key)
                            if (state.lang == "zh") Text(meta?.text("zhDesc").orEmpty(), color = RdvColors.Secondary, fontSize = 12.sp)
                        }
                        Switch(permission.flag("allowed"), { allowed -> vm.manageAction("/api/admin/permissions", "PATCH", jsonBody("role" to role, "permission" to key, "allowed" to allowed)) }, enabled = !state.busy)
                    }
                }
            }
        }
    }
}
