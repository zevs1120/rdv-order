package com.rdv.order.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import com.rdv.order.data.*
import kotlinx.serialization.json.*
import kotlin.math.roundToLong

@OptIn(ExperimentalLayoutApi::class)
@Composable fun MenuAdminScreen(vm: RdvViewModel, state: UiState) {
    val data = state.management
    val baseItems = data.rows("items")
    val majors = (data["majorData"] as? JsonObject)?.rows("majorCategories").orEmpty()
    val subs = (data["subData"] as? JsonObject)?.rows("subcategories").orEmpty()
    val groups = vm.strings.adminDefaults.rows("groups").map { it.text("value") to it.text(if (state.lang == "zh") "labelZh" else "labelEn") }
    var edits by remember { mutableStateOf<Map<String, JsonObject>>(emptyMap()) }
    var createOpen by rememberSaveable { mutableStateOf(false) }
    var allOpen by rememberSaveable { mutableStateOf(true) }
    var subOpen by rememberSaveable { mutableStateOf(true) }
    var search by rememberSaveable { mutableStateOf("") }
    var shift by rememberSaveable { mutableStateOf("beverage") }
    var sheet by rememberSaveable { mutableStateOf("") }
    var deleting by remember { mutableStateOf<Pair<String, String>?>(null) }
    var allergenItem by remember { mutableStateOf<JsonObject?>(null) }
    var allergens by rememberSaveable { mutableStateOf("") }
    val items = baseItems.map { edits[it.text("id")] ?: it }
    val filtered = items.filter { search.isBlank() || it.text("name").contains(search, true) || vm.localized(it.text("name")).contains(search, true) }
    fun edit(item: JsonObject, key: String, value: JsonElement) { edits = edits + (item.text("id") to JsonObject(item + (key to value))) }
    LaunchedEffect(majors) { if (majors.isNotEmpty() && majors.none { it.text("key") == shift }) shift = majors.first().text("key") }
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                RdvCard(Modifier.fillMaxWidth()) {
                    PanelHeading(vm.text("admin.newItem"), createOpen, { createOpen = !createOpen }, vm)
                    if (createOpen) NewMenuItemForm(vm, state, groups, majors, subs, baseItems)
                }
            }
            item {
                RdvCard(Modifier.fillMaxWidth()) {
                    PanelHeading(vm.text("admin.subcategories"), subOpen, { subOpen = !subOpen }, vm)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        RdvButton(vm.text("admin.addMajorCategory"), { sheet = "major" }, secondary = true, enabled = !state.busy)
                        RdvButton(vm.text("admin.addSubcategory"), { sheet = "sub" }, secondary = true, enabled = !state.busy && majors.isNotEmpty())
                    }
                    if (subOpen) {
                        ChoiceField(vm.either("主目录", "Main category"), shift, majors.map { it.text("key") to it.text(if (state.lang == "zh") "label_zh" else "label_en") }, { shift = it }, !state.busy)
                        val major = majors.find { it.text("key") == shift }
                        if (major != null) RdvButton(vm.either("删除主目录", "Delete main category"), {
                            deleting = "/api/admin/menu-categories/$shift" to vm.text("admin.majorCategoryDeleteConfirm")
                        }, secondary = true, danger = true, enabled = !state.busy && majors.size > 1)
                        subs.filter { it.text("shift_key") == shift }.forEach { sub ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(vm.localized(sub.text("name")), Modifier.weight(1f))
                                RdvButton(vm.text("common.delete"), { deleting = "/api/admin/menu-subcategories/${sub.text("id")}" to vm.text("admin.subcategoryDeleteConfirm") }, secondary = true, danger = true, enabled = !state.busy)
                            }
                        }
                    }
                }
            }
            item { RdvCard(Modifier.fillMaxWidth()) {
                PanelHeading(vm.text("admin.allItems"), allOpen, { allOpen = !allOpen }, vm)
                RdvField(vm.text("common.search"), search, { search = it })
            } }
            if (allOpen) items(filtered, key = { it.text("id") }) { item ->
                RdvCard(Modifier.fillMaxWidth()) {
                    RdvField(vm.text("admin.name", "Name"), item.text("name"), { edit(item, "name", JsonPrimitive(it)) }, enabled = !state.busy)
                    if (vm.localized(item.text("name")) != item.text("name")) Text(vm.localized(item.text("name")), color = RdvColors.Secondary)
                    RdvField(vm.text("admin.price"), item.number("price").toLong().toString(), { edit(item, "price", JsonPrimitive(it.toLongOrNull() ?: 0)) }, numeric = true, enabled = !state.busy)
                    val currentAllergens = (item["allergens"] as? JsonArray)?.map { it.jsonPrimitive.content }.orEmpty()
                    if (currentAllergens.isNotEmpty()) Text("${vm.either("过敏原", "Allergens")}: ${currentAllergens.joinToString(", ")}", color = RdvColors.Secondary)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        RdvButton(vm.either("过敏原", "Allergens"), { allergenItem = item; allergens = currentAllergens.joinToString(", ") }, secondary = true, enabled = !state.busy)
                        RdvButton(vm.text("common.delete"), { deleting = "/api/admin/menu-items/${item.text("id")}" to vm.either("确认删除此菜品？", "Delete this dish?") }, secondary = true, danger = true, enabled = !state.busy)
                    }
                }
            }
        }
        RdvButton(vm.text("common.save"), {
            val changed = edits.values.toList()
            vm.action {
                for (item in changed) {
                    vm.repository.requestObject("/api/admin/menu-items/${item.text("id")}", "PATCH", jsonBody("name" to item.text("name"), "price" to item.number("price").toLong(), "allergens" to (item["allergens"] ?: JsonArray(emptyList())), "isActive" to true), timeoutMs = 7_000)
                }
                // Keep all entered values visible if a later request fails. PATCH retries set the same values.
                edits = edits - changed.map { it.text("id") }.toSet()
                vm.loadManagement()
            }
        }, Modifier.fillMaxWidth(), enabled = edits.isNotEmpty() && !state.loading, loading = state.busy)
    }
    deleting?.let { (path, message) -> ConfirmAction(message, vm, { deleting = null }) {
        vm.action {
            vm.repository.requestObject(path, "DELETE", timeoutMs = 7_000)
            if (path.startsWith("/api/admin/menu-items/")) edits = edits - path.substringAfterLast('/')
            vm.loadManagement()
        }
        deleting = null
    } }
    allergenItem?.let { item -> AlertDialog(onDismissRequest = { allergenItem = null },
        title = { Text(vm.either("过敏原（逗号分隔）", "Allergens (comma separated)")) },
        text = { RdvField(vm.either("过敏原", "Allergens"), allergens, { allergens = it }) },
        confirmButton = { TextButton(onClick = { edit(item, "allergens", JsonArray(allergens.split(',').map { it.trim() }.filter { it.isNotBlank() }.map(::JsonPrimitive))); allergenItem = null }) { Text(vm.text("common.done")) } },
        dismissButton = { TextButton(onClick = { allergenItem = null }) { Text(vm.text("common.cancel")) } }) }
    if (sheet.isNotEmpty()) CategoryEditor(vm, state, sheet, shift, majors, subs, groups, { shift = it }) { sheet = "" }
}

@Composable private fun PanelHeading(title: String, expanded: Boolean, toggle: () -> Unit, vm: RdvViewModel) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), fontWeight = FontWeight.Bold)
        TextButton(onClick = toggle) { Text(vm.text(if (expanded) "common.collapse" else "common.expand")) }
    }
}

@Composable private fun NewMenuItemForm(vm: RdvViewModel, state: UiState, groups: List<Pair<String, String>>,
    majors: List<JsonObject>, subs: List<JsonObject>, items: List<JsonObject>) {
    var name by rememberSaveable { mutableStateOf("") }; var price by rememberSaveable { mutableStateOf("") }
    var group by rememberSaveable { mutableStateOf("lunch_dinner") }; var category by rememberSaveable { mutableStateOf("Filipino Food") }
    var type by rememberSaveable { mutableStateOf("single") }; var sort by rememberSaveable { mutableStateOf("0") }
    var allergens by rememberSaveable { mutableStateOf("") }
    fun defaults(key: String) = (vm.strings.adminDefaults["categories"]?.jsonObject?.get(key) as? JsonArray)?.map { it.jsonPrimitive.content }.orEmpty()
    val shifts = majors.filter { it.text("menu_group") == group }.map { it.text("key") }
    val categories = (defaults(group) + subs.filter { it.text("shift_key") in shifts }.map { it.text("name") } + items.filter { it.text("menu_group") == group }.map { it.text("category") }).filter { it.isNotEmpty() }.distinct()
    RdvField(vm.text("admin.name", "Name"), name, { name = it }, enabled = !state.busy)
    RdvField(vm.text("admin.price"), price, { price = it }, numeric = true, enabled = !state.busy)
    ChoiceField(vm.text("admin.group"), group, groups, { group = it; category = defaults(it).firstOrNull().orEmpty() }, !state.busy)
    ChoiceField(vm.text("admin.category"), category, categories.map { it to vm.localized(it) }, { category = it }, !state.busy)
    ChoiceField(vm.text("admin.type"), type, listOf("single" to "Single", "set" to "Set"), { type = it }, !state.busy)
    ChoiceField(vm.text("admin.sort"), sort, (vm.strings.adminDefaults["sort"] as JsonArray).map { it.jsonPrimitive.content.let { v -> v to v } }, { sort = it }, !state.busy)
    RdvField(vm.either("过敏原（逗号分隔）", "Allergens (comma separated)"), allergens, { allergens = it }, enabled = !state.busy)
    RdvButton(vm.text("admin.create"), {
        val amount = price.toDoubleOrNull()
        if (name.isBlank() || amount == null || !amount.isFinite() || amount <= 0) vm.error(vm.either("请填写菜名和有效价格", "Enter a dish name and valid price"))
        else vm.action {
            vm.repository.requestObject("/api/admin/menu-items", "POST", jsonBody("name" to name.trim(), "price" to amount.roundToLong(), "category" to category,
                "description" to null, "menuGroup" to group, "itemType" to type, "sortOrder" to sort.toInt(),
                "allergens" to JsonArray(allergens.split(',').map { it.trim() }.filter { it.isNotBlank() }.map(::JsonPrimitive))), timeoutMs = 7_000)
            name = ""; price = ""; allergens = ""; sort = "0"; type = "single"; category = defaults(group).firstOrNull().orEmpty()
            vm.loadManagement()
        }
    }, loading = state.busy)
    Text(vm.text("admin.allergenHint"), color = RdvColors.Secondary)
}

@Composable private fun CategoryEditor(vm: RdvViewModel, state: UiState, mode: String, shift: String, majors: List<JsonObject>, subs: List<JsonObject>,
    groups: List<Pair<String, String>>, onShift: (String) -> Unit, close: () -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }; var zh by rememberSaveable { mutableStateOf("") }
    var group by rememberSaveable { mutableStateOf("lunch_dinner") }
    val major = mode == "major"
    val duplicate = if (major) majors.any { it.text("label_en").trim().equals(name.trim(), true) }
        else subs.any { it.text("shift_key") == shift && it.text("name").trim().equals(name.trim(), true) }
    RdvSheet(vm.text(if (major) "admin.addMajorCategory" else "admin.addSubcategory"), close, state.busy, footer = {
        RdvButton(vm.text("common.cancel"), close, secondary = true, enabled = !state.busy)
        RdvButton(vm.text("admin.create"), {
            vm.action {
                if (major) {
                    val result = vm.repository.requestObject("/api/admin/menu-categories", "POST", jsonBody("labelEn" to name.trim(), "labelZh" to zh.trim(), "menuGroup" to group), timeoutMs = 7_000)
                    (result["majorCategory"] as? JsonObject)?.text("key")?.let(onShift)
                } else vm.repository.requestObject("/api/admin/menu-subcategories", "POST", jsonBody("shift" to shift, "name" to name.trim(), "displayNameZh" to zh.trim()), timeoutMs = 7_000)
                vm.loadManagement(); close()
            }
        }, enabled = name.isNotBlank() && (!major || zh.isNotBlank()) && !duplicate, loading = state.busy)
    }) {
        if (!major) ChoiceField(vm.text("admin.group"), shift, majors.map { it.text("key") to it.text(if (state.lang == "zh") "label_zh" else "label_en") }, onShift, !state.busy)
        RdvField(vm.text(if (major) "admin.majorCategoryNameEn" else "admin.subcategoryName"), name, { name = it }, enabled = !state.busy)
        RdvField(vm.text(if (major) "admin.majorCategoryNameZh" else "admin.subcategoryDisplayZh"), zh, { zh = it }, enabled = !state.busy)
        if (major) ChoiceField(vm.text("admin.group"), group, groups, { group = it }, !state.busy)
        if (duplicate) Text(vm.either("名称已存在", "Name already exists"), color = RdvColors.Danger)
        ErrorPanel(state.error, vm::dismissError)
    }
}
