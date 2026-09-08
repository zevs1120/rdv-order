package com.rdv.order.ui

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import com.rdv.order.data.*
import com.rdv.order.domain.*
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToLong

@OptIn(ExperimentalLayoutApi::class)
@Composable fun OrderScreen(vm: RdvViewModel, state: UiState) {
    val draft = state.draft ?: return
    val menu = state.menu
    val uncategorized = vm.text("order.uncategorized")
    val index = remember(menu, uncategorized) { MenuIndex(menu, uncategorized) }
    val selection = remember(index, draft.keyword, draft.category) { index.select(draft.keyword, draft.category) }
    val categories = selection.categories
    val selected = selection.selected
    val visible = selection.items
    val quantities = remember(draft.lines) { draft.lines.associate { it.item.id to it.qty } }
    var confirm by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(selected) { if (selected != draft.category && !state.busy) vm.category(selected) }
    BoxWithConstraints(Modifier.fillMaxSize()) {
    val shortViewport = maxHeight < 420.dp
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f).testTag("order-content-scroll").then(if (shortViewport) Modifier.verticalScroll(rememberScrollState()) else Modifier)) {
        Column(Modifier.fillMaxWidth().then(if (shortViewport) Modifier.height(440.dp) else Modifier.weight(1f)), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        RdvCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${vm.either("桌号", "Table")} ${draft.tableNo}", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Text("${draft.guests} ${vm.either("人", "Guests")}", color = RdvColors.Brand)
            }
            RdvField(vm.text("order.searchPlaceholder"), draft.keyword, vm::keyword, Modifier.testTag("menu-search"), enabled = !state.busy)
        }
        Surface(color = RdvColors.OrderSection, shape = RectangleShape) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                menu?.majorCategories.orEmpty().forEach { category ->
                    RdvChip(if (state.lang == "zh") category.zh else category.en, draft.shift == category.key, { vm.selectShift(category.key) }, enabled = !state.busy)
                }
            }
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Surface(Modifier.width(94.dp).fillMaxHeight(), shape = RectangleShape, color = RdvColors.OrderSection) {
                LazyColumn(Modifier.padding(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(categories, key = { it }) { category ->
                        val categorySelected = selected == category
                        Surface(onClick = { vm.category(category) }, enabled = !state.busy,
                            color = if (selected == category) Color.White else Color.Transparent,
                            shape = RectangleShape, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                                .semantics { this.selected = categorySelected }) {
                            Box(Modifier.drawBehind {
                                if (selected == category) drawLine(RdvColors.Brand, Offset(1.5.dp.toPx(), 0f),
                                    Offset(1.5.dp.toPx(), size.height), 3.dp.toPx())
                            }.padding(8.dp), contentAlignment = Alignment.CenterStart) {
                                Text(vm.strings.category(state.lang, category), fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                                    fontWeight = if (selected == category) FontWeight.SemiBold else FontWeight.Normal,
                                    color = if (selected == category) RdvColors.Brand else RdvColors.Text)
                            }
                        }
                    }
                }
            }
            Surface(Modifier.weight(1f).fillMaxHeight(), shape = RectangleShape, color = RdvColors.OrderCanvas) {
                Column(Modifier.padding(8.dp)) {
                    if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                    if (visible.isEmpty() && !state.loading) Text(vm.text(if (categories.isEmpty()) "order.menuEmpty" else "order.categoryEmpty"), Modifier.padding(12.dp))
                    key(draft.shift, selected, draft.keyword.trim().lowercase()) {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(visible, key = { it.id }) { item ->
                                val qty = quantities[item.id] ?: 0
                                RdvCard(Modifier.fillMaxWidth().testTag("dish-${item.id}")) {
                                    Row {
                                        Text(vm.localized(item.name) + if (item.itemType == "set") vm.either("（套餐）", " (Set)") else "",
                                            Modifier.weight(1f), fontSize = 17.sp, lineHeight = 21.sp, fontWeight = FontWeight.Bold)
                                        if (qty > 0) Text(Seafood.quantity(item.name, qty, state.lang), color = RdvColors.Brand, fontSize = 12.sp)
                                    }
                                    Text(vm.localized(item.category ?: item.description.orEmpty()), color = RdvColors.Secondary, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        val unit = Seafood.config(item.name)?.unit
                                        Text("₱${item.price}" + if (unit == null) "" else "/${if (unit == "pcs" && state.lang == "zh") "只" else unit}",
                                            Modifier.align(Alignment.CenterVertically), fontSize = if (unit == null) 28.sp else 21.sp, fontWeight = FontWeight.Bold)
                                        FilledIconButton(onClick = { vm.add(item) }, enabled = !state.busy,
                                            modifier = Modifier.size(48.dp).testTag("add-${item.id}"), shape = CircleShape,
                                            colors = IconButtonDefaults.filledIconButtonColors(containerColor = RdvColors.Brand, contentColor = Color.White)) {
                                            Icon(Icons.Outlined.Add, vm.either("添加", "Add") + " " + vm.localized(item.name), Modifier.size(24.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            RdvButton("${vm.text("order.currentOrder")} · ${draft.lines.size} · ₱${OrderRules.total(draft.lines)}", { vm.sheet("cart") }, Modifier.weight(1f), secondary = true, enabled = !state.busy)
            RdvButton(vm.text(if (state.busy) "order.submitting" else "order.submit"), vm::submit,
                Modifier.widthIn(max = 140.dp).testTag("submit"), enabled = draft.lines.isNotEmpty(), loading = state.busy)
        }
    }
    }
    when (state.sheet) {
        "actions" -> RdvSheet(vm.either("操作", "Actions"), { vm.sheet("") }, state.busy) {
            RdvButton(vm.text("order.ordered"), vm::showBill, Modifier.fillMaxWidth(), secondary = true)
            RdvButton(vm.text("order.addDish"), { vm.sheet("custom") }, Modifier.fillMaxWidth(), secondary = true)
            RdvButton(vm.text("orders.title"), {
                vm.navigate(Screen.ORDERS)
                val range = DateRules.preset("today", LocalDate.now(), ZoneId.systemDefault())
                vm.filters(mapOf("tableNo" to draft.tableNo, "from" to range.from.toString(), "to" to range.to.toString()))
            }, Modifier.fillMaxWidth(), secondary = true)
            if ('+' in draft.tableNo) RdvButton(vm.text("order.unmerge"), { confirm = "unmerge" }, Modifier.fillMaxWidth(), secondary = true)
            RdvButton(vm.text("order.checkout"), { confirm = "checkout" }, Modifier.fillMaxWidth(), secondary = true)
            RdvButton(vm.text("order.closeTable"), { confirm = "close" }, Modifier.fillMaxWidth(), secondary = true, danger = true)
        }
        "cart" -> RdvSheet(vm.text("order.currentOrder"), { vm.sheet("") }, state.busy, footer = {
            Text("${vm.text("order.total")}: ₱${OrderRules.total(draft.lines)}", Modifier.weight(1f), fontWeight = FontWeight.Bold)
            RdvButton(vm.text("order.submit"), vm::submit, enabled = draft.lines.isNotEmpty(), loading = state.busy)
        }) {
            if (draft.lines.isEmpty()) Text(vm.text("order.currentOrderEmpty"))
            draft.lines.forEach { line ->
                RdvCard(Modifier.fillMaxWidth()) {
                    Text(vm.localized(line.item.name), fontSize = 16.sp)
                    Text("₱${line.item.price} · ${vm.either("数量", "Qty")} ${Seafood.quantity(line.item.name, line.qty, state.lang)}", color = RdvColors.Secondary)
                    if (!line.note.isNullOrBlank()) Text("${vm.text("order.noteLabel")}: ${line.note}", color = RdvColors.Secondary)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Stepper(line.qty, { vm.quantity(line.item, it) }, label = Seafood.quantity(line.item.name, line.qty, state.lang), enabled = !state.busy, lang = state.lang)
                        RdvButton(vm.text("order.noteAction"), { vm.note(line.item) }, secondary = true, enabled = !state.busy)
                        RdvButton(vm.either("移除", "Remove"), { vm.quantity(line.item, 0) }, secondary = true, danger = true, enabled = !state.busy)
                    }
                }
            }
            ErrorPanel(state.error, vm::dismissError, vm.text("common.close"))
        }
        "note" -> state.noteItem?.let { NoteSheet(vm, state, it) }
        "custom" -> CustomDishSheet(vm, state)
        "bill" -> BillSheet(vm, state) { confirm = "checkout" }
    }
    if (confirm.isNotEmpty()) AlertDialog(onDismissRequest = { if (!state.busy) confirm = "" },
        text = { Text(when (confirm) {
            "checkout" -> vm.either("确认结账并关台吗？", "Confirm checkout and close table?")
            "unmerge" -> vm.either("确认取消拼桌吗？", "Confirm unmerge table?")
            else -> vm.either("确认关台吗？", "Confirm close table?")
        } + "\n${vm.either("桌号", "Table")}: ${draft.tableNo}") },
        confirmButton = { TextButton(onClick = { val operation = confirm; confirm = ""; when (operation) { "checkout" -> vm.checkout(); "unmerge" -> vm.unmerge(); else -> vm.closeTable() } }, enabled = !state.busy) { Text(vm.text("common.done")) } },
        dismissButton = { TextButton(onClick = { confirm = "" }, enabled = !state.busy) { Text(vm.text("common.cancel")) } })
}

@OptIn(ExperimentalLayoutApi::class)
@Composable private fun NoteSheet(vm: RdvViewModel, state: UiState, item: MenuItem) {
    val existing = state.draft?.lines?.find { it.item.id == item.id }
    val config = Seafood.config(item.name)
    val parsed = if (config != null) Seafood.parse(existing?.note, config) else "" to ""
    var qty by rememberSaveable(item.id) { mutableIntStateOf((existing?.qty ?: 1).coerceAtLeast(1)) }
    var method by rememberSaveable(item.id) { mutableStateOf(parsed.first) }
    var extra by rememberSaveable(item.id) { mutableStateOf(parsed.second) }
    var mode by rememberSaveable(item.id) { mutableStateOf("no") }
    fun save(close: Boolean) {
        if (config != null) vm.quantity(item, qty, Seafood.note(config, method, extra, state.lang))
        else if (extra.isNotBlank()) { vm.quantity(item, existing?.qty ?: 1, OrderRules.addNote(existing?.note, mode, extra)); extra = "" }
        if (close) vm.sheet("")
    }
    RdvSheet(vm.localized(item.name), { save(true) }, state.busy, footer = {
        RdvButton(if (config != null) vm.either("移除", "Remove") else vm.text("order.noteClear"), {
            if (config != null) { vm.quantity(item, 0); vm.sheet("") } else { vm.quantity(item, existing?.qty ?: 1, null); extra = "" }
        }, secondary = true, enabled = !state.busy)
        RdvButton(if (config != null) vm.either("应用", "Apply") else vm.text("order.noteAdd"), { save(config != null) }, enabled = !state.busy)
    }) {
        if (config != null) {
            Text(vm.either("单价按 ${config.unit} 计", "Price is per ${config.unit}"), color = RdvColors.Secondary)
            Stepper(qty, { qty = it }, label = Seafood.quantity(item.name, qty, state.lang), min = 1, max = 200, lang = state.lang)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                config.methods.forEach { m -> RdvChip(if (state.lang == "zh") m.zh else m.en, method == m.key, { method = m.key }) }
            }
        } else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("more", "no").forEach { m -> RdvChip(m, mode == m, { mode = m }) }
        }
        RdvField(vm.text("order.noteInputPlaceholder"), extra, { extra = it.take(if (config != null) 90 else 60) }, Modifier.testTag("note-input"))
        Text("${vm.text("order.noteLabel")}: " + if (config != null) Seafood.note(config, method, extra, state.lang) else existing?.note.orEmpty().ifBlank { "-" })
    }
}

@Composable private fun CustomDishSheet(vm: RdvViewModel, state: UiState) {
    var name by rememberSaveable { mutableStateOf("") }; var price by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf("") }; var description by rememberSaveable { mutableStateOf("") }
    var mode by rememberSaveable { mutableStateOf("temporary") }
    RdvSheet(vm.text("order.addDishTitle"), { vm.sheet("") }, state.busy, footer = {
        RdvButton(vm.text("common.cancel"), { vm.sheet("") }, secondary = true, enabled = !state.busy)
        RdvButton(vm.text("order.addDishCreate"), {
            val number = price.toDoubleOrNull()
            if (name.isBlank() || number == null || !number.isFinite() || number <= 0) vm.error(vm.text("order.addDishRequireNamePrice"))
            else vm.customDish(jsonBody("name" to name.trim(), "price" to number.roundToLong(), "category" to category.trim().ifEmpty { null },
                "description" to description.trim().ifEmpty { null }, "shift" to state.draft!!.shift, "mode" to mode))
        }, loading = state.busy)
    }) {
        RdvChip(vm.text("order.addDishTemp"), mode == "temporary", { mode = "temporary" })
        RdvChip(vm.text("order.addDishPermanent"), mode == "permanent", { mode = "permanent" }, enabled = state.role == "manager")
        RdvField(vm.text("order.addDishName"), name, { name = it }, enabled = !state.busy)
        RdvField(vm.text("order.addDishPrice"), price, { price = it }, numeric = true, enabled = !state.busy)
        RdvField(vm.text("order.addDishCategory"), category, { category = it }, enabled = !state.busy)
        RdvField(vm.text("order.addDishDesc"), description, { description = it }, enabled = !state.busy)
        ErrorPanel(state.error, vm::dismissError, vm.text("common.close"))
    }
}

@Composable private fun BillSheet(vm: RdvViewModel, state: UiState, checkout: () -> Unit) {
    var returning by remember { mutableStateOf<Pair<String, BillItem>?>(null) }
    var qty by rememberSaveable { mutableStateOf("1") }
    val bill = state.bill
    RdvSheet(vm.text("order.billTitle"), { vm.sheet("") }, state.busy, footer = {
        RdvButton(vm.text("order.printReceipt"), vm::printBill, Modifier.weight(1f), secondary = true, enabled = !state.loading && (bill?.items?.isNotEmpty() == true), loading = state.busy)
        RdvButton("${vm.text("order.checkout")} + ${vm.text("order.closeTable")}", checkout, Modifier.weight(1f), enabled = !state.busy)
    }) {
        if (state.loading) CircularProgressIndicator(Modifier.size(24.dp))
        if (bill == null || bill.items.isEmpty()) Text(vm.text("order.billEmpty"))
        bill?.items?.forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("${vm.localized(item.name)} · ${Seafood.quantity(item.name, item.qty, state.lang)}")
                    if (!item.note.isNullOrBlank()) Text(item.note, color = RdvColors.Secondary)
                }
                Text("₱${item.amount}", fontWeight = FontWeight.Bold)
            }
        }
        Text("${vm.text("order.billQty")}: ${bill?.totalQty ?: 0}", fontWeight = FontWeight.Bold)
        Text("${vm.text("order.billAmount")}: ₱${bill?.totalAmount ?: 0}", fontWeight = FontWeight.Bold)
        Text(vm.either("订单明细（退菜）", "Order Details (Return Dish)"), fontWeight = FontWeight.Bold)
        bill?.orders?.forEach { order ->
            RdvCard(Modifier.fillMaxWidth()) {
                Text("#${order.id.take(8)} · ${order.status} · ₱${order.totalAmount}", fontWeight = FontWeight.Bold)
                order.items.forEach { item ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${vm.localized(item.name)} · ${Seafood.quantity(item.name, item.qty, state.lang)}")
                            if (!item.note.isNullOrBlank()) Text(item.note, color = RdvColors.Secondary)
                            Text("₱${item.amount}")
                        }
                        if (order.cancelledAt == null && order.status in setOf("submitted", "preparing", "served"))
                            RdvButton(vm.text("orders.returnDish"), { returning = order.id to item; qty = "1" }, secondary = true, enabled = !state.busy)
                    }
                }
                order.charges.forEach { Text("${it.type}: ₱${it.amount}") }
            }
        }
        ErrorPanel(state.error, vm::dismissError, vm.text("common.close"))
    }
    returning?.let { (order, item) ->
        AlertDialog(onDismissRequest = { returning = null }, title = { Text(vm.text("orders.returnDish")) },
            text = { RdvField(vm.either("${vm.localized(item.name)} 退菜数量（最多 ${item.qty}）", "Return qty for ${vm.localized(item.name)} (max ${item.qty})"), qty, { qty = it }, numeric = true) },
            confirmButton = { TextButton(onClick = { val count = qty.toIntOrNull(); if (count != null && count in 1..item.qty) { vm.returnItem(order, item, count); returning = null } else vm.error(vm.either("退菜数量无效", "Invalid return quantity")) }) { Text(vm.text("common.done")) } },
            dismissButton = { TextButton(onClick = { returning = null }) { Text(vm.text("common.cancel")) } })
    }
}
