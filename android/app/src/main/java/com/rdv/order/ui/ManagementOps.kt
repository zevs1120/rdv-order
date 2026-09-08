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
    var clearing by remember { mutableStateOf(false) }
    val data = state.management
    val health = data["health"] as? JsonObject ?: JsonObject(emptyMap())
    val queue = data["printQueue"] as? JsonObject ?: JsonObject(emptyMap())
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        RdvCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(vm.text("devices.deployReadiness"), Modifier.weight(1f), fontWeight = FontWeight.Bold)
                RdvButton(vm.text("devices.retryPrint"), { vm.manageAction("/api/print/dispatch", body = jsonBody("limit" to 10)) }, enabled = !state.busy)
            }
            run {
                val provider = health["provider"] as? JsonObject
                val config = health["config"] as? JsonObject ?: JsonObject(emptyMap())
                val primary = config["primary"] as? JsonObject
                val fallback = config["fallback"] as? JsonObject
                val routes = health["routes"] as? JsonObject
                fun ready(value: Boolean, missing: Boolean = false) = vm.text(if (value) "devices.ready" else if (missing) "devices.notSet" else "devices.notReady")
                Text("${vm.text("devices.overall")}: ${ready(health.flag("ready"))}")
                Text("Primary: ${provider?.text("primary").orEmpty().ifBlank { "-" }} · ${ready(primary?.flag("ready") == true)}")
                Text("Fallback: ${provider?.text("fallback").orEmpty().ifBlank { "-" }} · ${ready(fallback?.flag("ready") == true, provider?.text("fallback").isNullOrBlank())}")
                Text("PRINT_WORKER_KEY: ${ready(config.flag("workerKeySet"), true)}")
                Text("DEVICE_HEARTBEAT_KEY: ${ready(config.flag("heartbeatKeySet"), true)}")
                listOf("barCategories" to "devices.routeBarCategories", "barKeywords" to "devices.routeBarKeywords").forEach { (key, label) ->
                    val values = (routes?.get(key) as? JsonArray)?.joinToString(", ") { it.jsonPrimitive.content }.orEmpty().ifBlank { "-" }
                    Text("${vm.text(label)}: $values", color = RdvColors.Secondary)
                }
                (health["warnings"] as? JsonArray)?.forEach { Text(it.jsonPrimitive.content, color = RdvColors.Danger) }
            }
        }
        RdvCard(Modifier.fillMaxWidth()) {
            Text("${vm.text("devices.pendingJobs")}: ${queue.number("pending").toInt()} · ${vm.text("devices.failedJobs")}: ${queue.number("failed").toInt()}")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("kitchen" to "devices.testKitchen", "bar" to "devices.testBar", "both" to "devices.testBoth").forEach { (target, label) ->
                    RdvButton(vm.text(label), { vm.manageAction("/api/print/self-test", body = jsonBody("target" to target)) }, secondary = true, enabled = !state.busy)
                }
                RdvButton(vm.text("devices.clearQueue"), { clearing = true }, secondary = true, danger = true, enabled = !state.busy)
            }
        }
        if (data.rows("alerts").isNotEmpty()) RdvCard(Modifier.fillMaxWidth()) {
            Text(vm.text("devices.alertTitle"), fontWeight = FontWeight.Bold)
            data.rows("alerts").forEach { Text(it.text("message"), color = RdvColors.Danger) }
            Text(vm.text("devices.alertHint"), color = RdvColors.Secondary)
        }
        data.rows("devices").forEach { device -> RdvCard(Modifier.fillMaxWidth()) {
            Text(device.text("label"), fontWeight = FontWeight.Bold)
            Text("${device.text("device_code")} · ${device.text("device_type")}" + if (device.flag("is_backup")) vm.either(" · 备用", " · Backup") else "")
            Text("${vm.either("故障次数", "Failures")}: ${device.number("fail_count").toInt()}")
            Text("${vm.either("上次在线", "Last seen")}: ${device.text("last_seen_at").ifBlank { "-" }}")
            if (device.text("last_error").isNotBlank()) Text(device.text("last_error"), color = RdvColors.Danger)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("online" to vm.text("network.online"), "offline" to vm.text("network.offline"), "degraded" to vm.either("异常", "Degraded")).forEach { (status, label) ->
                    RdvChip(label, device.text("status") == status, { vm.manageAction("/api/devices", "PATCH", jsonBody("deviceCode" to device.text("device_code"), "status" to status)) }, enabled = !state.busy)
                }
            }
        } }
    }
    if (clearing) ConfirmAction(vm.text("devices.clearQueueConfirm"), vm, { clearing = false }) { vm.manageAction("/api/print/queue", "DELETE"); clearing = false }
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
