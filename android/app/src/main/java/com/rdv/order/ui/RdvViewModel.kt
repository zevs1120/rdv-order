package com.rdv.order.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rdv.order.data.*
import com.rdv.order.domain.*
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.*

enum class Screen { LOGIN, TABLES, ORDER, MORE, ORDERS, INCOME, FEES, HOT, DEVICES, RBAC, MENU, SUMMARY, UPDATES }
data class UiState(
    val ready: Boolean = false,
    val lang: String = Strings.systemLanguage(),
    val role: String = "",
    val screen: Screen = Screen.LOGIN,
    val busy: Boolean = false,
    val loading: Boolean = false,
    val error: String = "",
    val message: String = "",
    val tables: List<TableInfo> = emptyList(),
    val draft: Draft? = null,
    val menu: MenuResponse? = null,
    val bill: Bill? = null,
    val sheet: String = "",
    val noteItem: MenuItem? = null,
    val noteChoices: Map<String, String> = emptyMap(),
    val editingChoices: Boolean = false,
    val orderReturnToTable: Boolean = false,
    val checkoutQuote: JsonObject? = null,
    val selectMode: Boolean = false,
    val selectedTables: List<String> = emptyList(),
    val management: JsonObject = JsonObject(emptyMap()),
    val filters: Map<String, String> = emptyMap(),
)

class RdvViewModel(val repository: RdvRepository, val strings: Strings, private val store: KeyValueStore) : ViewModel() {
    private val mutable = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = mutable.asStateFlow()
    private var persistJob: Job? = null
    private var persistError: Throwable? = null
    private var loadJob: Job? = null
    private var menuJob: Job? = null
    private var connectionReadJob: Job? = null
    private var readError: String? = null
    private var lastSubmitted = ""
    private var lastSubmittedAt = 0L
    private var epoch = 0
    private var expiringSession = false
    init {
        viewModelScope.launch {
            try {
                val language = withContext(Dispatchers.IO) { store.get("language") }
                if (language in setOf("zh", "en")) mutable.update { it.copy(lang = language!!) }
                val session = repository.restoreSession()
                mutable.update { it.copy(ready = true, role = session?.role.orEmpty()) }
                if (session != null) navigate(if (session.role == "manager") Screen.ORDERS else Screen.TABLES)
            } catch (e: Exception) { fail(e); mutable.update { it.copy(ready = true) } }
        }
    }
    fun text(key: String, fallback: String = key) = strings.text(state.value.lang, key, fallback)
    fun either(zh: String, en: String) = if (state.value.lang == "zh") zh else en
    fun localized(name: String) = strings.menu(state.value.lang, name)
    fun orderStatus(status: String, cancelled: Boolean = false): String = if (cancelled) either("已取消", "Cancelled") else when (status) {
        "draft" -> either("待下单", "Draft")
        "submitted" -> either("已提交", "Submitted")
        "preparing" -> either("制作中", "Preparing")
        "served" -> either("已上菜", "Served")
        "paid" -> either("已结账", "Paid")
        "closed" -> either("已关闭", "Closed")
        "cancelled" -> either("已取消", "Cancelled")
        "merged" -> either("已并入", "Merged")
        else -> either("未知状态", "Unknown status")
    }
    fun chargeLabel(type: String): String = when (type) {
        "discount" -> text("orders.discount")
        "service_fee" -> text("orders.serviceFee")
        "tax" -> either("税费", "Tax")
        else -> either("调整", "Adjustment")
    }
    fun dismissError() { mutable.update { it.copy(error = "") } }
    fun dismissMessage() { mutable.update { it.copy(message = "") } }
    fun message(value: String) { mutable.update { it.copy(message = value) } }
    fun error(value: String) { mutable.update { it.copy(error = value) } }
    private fun fail(error: Throwable) {
        if (error is CancellationException) throw error
        mutable.update { it.copy(error = strings.error(it.lang, error)) }
        if (error is ApiException && error.status == 401 && state.value.screen != Screen.LOGIN && !expiringSession) {
            expiringSession = true
            epoch++
            loadJob?.cancel(); menuJob?.cancel()
            mutable.update { it.copy(busy = true, loading = false) }
            viewModelScope.launch {
                var message = strings.error(state.value.lang, error)
                try { persistJob?.join(); repository.logout() }
                catch (e: Exception) { if (e is CancellationException) throw e; message = strings.error(state.value.lang, e) }
                finally {
                    mutable.update { UiState(ready = true, lang = it.lang, error = message) }
                    expiringSession = false
                }
            }
        }
    }
    fun toggleLanguage() {
        val next = if (state.value.lang == "zh") "en" else "zh"
        mutable.update { it.copy(lang = next) }
        viewModelScope.launch { try { withContext(Dispatchers.IO) { store.put("language", next) } } catch (e: Exception) { fail(e) } }
    }
    fun login(username: String, pin: String) = action {
        val session = repository.login(username, pin)
        lastSubmitted = ""; lastSubmittedAt = 0L
        mutable.update { it.copy(role = session.role) }
        navigate(if (session.role == "manager") Screen.ORDERS else Screen.TABLES)
    }
    fun logout() = action {
        persistJob?.join()
        repository.logout()
        epoch++
        loadJob?.cancel(); menuJob?.cancel()
        mutable.update { UiState(ready = true, lang = it.lang) }
    }
    fun navigate(screen: Screen) {
        if (expiringSession) return
        if (screen !in setOf(Screen.LOGIN, Screen.TABLES, Screen.ORDER, Screen.MORE, Screen.ORDERS, Screen.UPDATES) && !repository.isManager) return
        epoch++
        loadJob?.cancel(); menuJob?.cancel()
        mutable.update { it.copy(screen = screen, sheet = "", error = "", loading = false,
            management = JsonObject(emptyMap()), filters = emptyMap(), orderReturnToTable = false, selectMode = false, selectedTables = emptyList()) }
        refresh()
    }
    fun back() {
        if (state.value.busy) return
        if (state.value.sheet.isNotEmpty()) { sheet(""); return }
        if (state.value.screen == Screen.ORDERS && state.value.orderReturnToTable) {
            navigate(Screen.ORDER); showBill(); return
        }
        when (state.value.screen) {
            Screen.ORDER -> navigate(Screen.TABLES)
            Screen.MORE -> navigate(Screen.TABLES)
            Screen.LOGIN, Screen.TABLES -> Unit
            else -> navigate(Screen.MORE)
        }
    }
    fun refresh() {
        when (state.value.screen) {
            Screen.TABLES -> load { val tables = repository.tables(); mutable.update { it.copy(tables = tables) } }
            Screen.ORDER -> selectShift(state.value.draft?.shift ?: "lunch", forceRefresh = true)
            Screen.LOGIN, Screen.MORE, Screen.UPDATES -> Unit
            else -> loadManagement()
        }
    }
    // Recovery only reads the current screen. Never clears an uncertain write result or draft.
    fun restoreConnectionReads() {
        val before = state.value
        if (!before.ready || before.busy || before.loading || before.sheet.isNotEmpty() || expiringSession) return
        if (before.screen in setOf(Screen.LOGIN, Screen.MORE, Screen.UPDATES)) return
        // These screens edit their loaded data in place; do not replace an open editor.
        if (before.screen in setOf(Screen.FEES, Screen.MENU) && before.management.isNotEmpty()) return
        if (before.screen == Screen.ORDER && before.menu != null && repository.freshMenu(before.draft?.shift ?: "lunch") != null) return
        if (connectionReadJob?.isActive == true) return
        val currentEpoch = epoch
        connectionReadJob = viewModelScope.launch {
            try {
                val tables = if (before.screen == Screen.TABLES) repository.tables() else null
                val menu = if (before.screen == Screen.ORDER) repository.menu(before.draft?.shift ?: "lunch") else null
                val management = if (before.screen !in setOf(Screen.TABLES, Screen.ORDER)) readManagement(before) else null
                val current = state.value
                if (epoch != currentEpoch || current.busy || current.loading || current.screen != before.screen ||
                    current.filters != before.filters || current.draft?.shift != before.draft?.shift) return@launch
                if (before.screen in setOf(Screen.FEES, Screen.MENU) && current.management != before.management) return@launch
                mutable.update { it.copy(tables = tables ?: it.tables, menu = menu ?: it.menu,
                    management = management ?: it.management,
                    error = if (readError != null && it.error == readError) "" else it.error) }
                readError = null
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                // Keep the original operation error visible. The transport drives connection recovery.
                if (e is ApiException && e.status == 401 && epoch == currentEpoch) fail(e)
            }
        }
    }
    private fun load(block: suspend () -> Unit) {
        connectionReadJob?.cancel()
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            mutable.update { it.copy(loading = true, error = "") }
            try { block(); readError = null } catch (e: Exception) { fail(e); readError = state.value.error }
            finally { if (isActive) mutable.update { it.copy(loading = false) } }
        }
    }
    fun action(block: suspend () -> Unit) {
        if (state.value.busy || expiringSession) return
        connectionReadJob?.cancel()
        readError = null
        mutable.update { it.copy(busy = true, error = "") }
        viewModelScope.launch {
            try { block() } catch (e: Exception) { fail(e) }
            finally { mutable.update { it.copy(busy = expiringSession) } }
        }
    }
    fun toggleSelect() {
        if (state.value.busy) return
        mutable.update { it.copy(selectMode = !it.selectMode, selectedTables = emptyList()) }
    }
    fun selectTable(table: TableInfo) {
        mutable.update { s ->
            if (table.status != "idle") s else {
                val key = table.baseTables.firstOrNull() ?: table.tableNo
                val next = if (key in s.selectedTables) s.selectedTables - key else if (s.selectedTables.size < 2) s.selectedTables + key else s.selectedTables
                s.copy(selectedTables = next)
            }
        }
    }
    fun openTable(table: TableInfo, guests: Int) = action {
        val opened = repository.open(table.tableNo, guests)
        enterTableInternal(table.copy(status = "open", guestCount = opened.guestCount, openedAt = opened.openedAt))
    }
    fun mergeTables(guests: Int) = action {
        val selected = state.value.selectedTables
        require(selected.size == 2) { "请先选择两张桌子" }
        val session = repository.merge(selected[0], selected[1], guests)
        enterTableInternal(TableInfo(session.tableNo, selected, status = "open", guestCount = session.guestCount, openedAt = session.openedAt))
    }
    fun enterTable(table: TableInfo) = action { enterTableInternal(table) }
    private suspend fun enterTableInternal(table: TableInfo) {
        persistJob?.join()
        val draft = repository.loadDraft(table)
        persistError = null
        epoch++
        loadJob?.cancel()
        mutable.update { it.copy(screen = Screen.ORDER, draft = draft, menu = null, bill = null, error = "", sheet = "", selectMode = false, selectedTables = emptyList()) }
        selectShift(draft.shift)
    }
    fun editDraft(transform: (Draft) -> Draft) {
        if (state.value.busy) return
        val draft = state.value.draft ?: return
        val next = transform(draft)
        if (next == draft) return
        mutable.update { it.copy(draft = next) }
        val save = repository.prepareDraftSave(next)
        val previous = persistJob
        persistJob = viewModelScope.launch {
            previous?.join()
            try { save(); persistError = null } catch (e: Exception) { persistError = e; fail(e) }
        }
    }
    fun keyword(value: String) = editDraft { it.copy(keyword = value) }
    fun category(value: String) = editDraft { it.copy(category = value) }
    fun selectShift(shift: String, forceRefresh: Boolean = false) {
        connectionReadJob?.cancel()
        val current = state.value.draft ?: return
        if (current.shift != shift) editDraft { it.copy(shift = shift) }
        menuJob?.cancel()
        val currentEpoch = epoch
        if (!forceRefresh) repository.freshMenu(shift)?.let { menu ->
            mutable.update { it.copy(menu = menu, loading = false, error = "", draft = it.draft?.copy(shift = menu.shift)) }
            return
        }
        menuJob = viewModelScope.launch {
            mutable.update { it.copy(loading = true) }
            try {
                val cached = repository.cachedMenu(shift)
                if (epoch != currentEpoch) return@launch
                mutable.update { it.copy(menu = cached) }
                val menu = repository.menu(shift)
                if (epoch == currentEpoch) mutable.update { it.copy(menu = menu, draft = it.draft?.copy(shift = menu.shift)) }
            } catch (e: Exception) { if (epoch == currentEpoch) { fail(e); readError = state.value.error } }
            finally { if (isActive && epoch == currentEpoch) mutable.update { it.copy(loading = false) } }
        }
    }
    fun quantity(item: MenuItem, value: Int, note: String? = state.value.draft?.lines?.find { it.item.id == item.id && it.choices.isEmpty() }?.note,
        choices: Map<String, String> = emptyMap()) = editDraft { draft ->
        val line = CartLine(item, value.coerceAtLeast(0), note, choices)
        fun matches(other: CartLine) = other.item.id == item.id && other.choices == choices
        val exists = draft.lines.any(::matches)
        val lines = if (value <= 0) draft.lines.filterNot(::matches)
            else if (exists) draft.lines.map { if (matches(it)) line else it } else draft.lines + line
        draft.copy(lines = lines)
    }
    fun quantityLine(line: CartLine, value: Int) = quantity(line.item, value, line.note, line.choices)
    fun addConfigured(item: MenuItem, choices: Map<String, String>) {
        if (!MenuOptions.complete(item, choices)) return
        val current = state.value.draft?.lines?.find { it.item.id == item.id && it.choices == choices }
        quantity(item, (current?.qty ?: 0) + 1, current?.note, choices)
        sheet("")
    }
    fun editChoices(line: CartLine) { mutable.update { it.copy(noteItem = line.item, noteChoices = line.choices, editingChoices = true, sheet = "choices") } }
    fun saveChoices(item: MenuItem, choices: Map<String, String>) {
        if (!MenuOptions.complete(item, choices)) return
        val original = state.value.noteChoices
        try { editDraft { draft -> draft.copy(lines = OrderRules.editChoices(draft.lines, item.id, original, choices)) } }
        catch (e: IllegalArgumentException) { error(e.message.orEmpty()); return }
        mutable.update { it.copy(editingChoices = false, sheet = "cart") }
    }
    fun add(item: MenuItem) {
        if (item.optionGroups.isNotEmpty()) {
            mutable.update { it.copy(noteItem = item, noteChoices = emptyMap(), editingChoices = false, sheet = "choices") }
            return
        }
        val qty = state.value.draft?.lines?.find { it.item.id == item.id }?.qty ?: 0
        quantity(item, qty + 1)
        if (Seafood.config(item.name) != null) {
            mutable.update { it.copy(noteItem = item, sheet = "note") }
        }
    }
    fun note(item: MenuItem, choices: Map<String, String> = emptyMap()) { mutable.update { it.copy(noteItem = item, noteChoices = choices, sheet = "note") } }
    fun sheet(value: String) { if (!state.value.busy) mutable.update { it.copy(sheet = value) } }
    fun showBill() {
        mutable.update { it.copy(sheet = "bill") }
        load { val result = repository.bill(state.value.draft!!.tableNo); mutable.update { it.copy(bill = result) } }
    }
    fun showSessionOrders() {
        val bill = state.value.bill ?: return
        val sessionId = bill.sessionId ?: return
        navigate(Screen.ORDERS)
        mutable.update { it.copy(orderReturnToTable = true, filters = mapOf("sessionId" to sessionId, "tableNo" to bill.tableNo)) }
        loadManagement()
    }
    fun updateGuests(count: Int) = action {
        require(count in 1..20)
        val draft = state.value.draft ?: return@action
        repository.requestObject("/api/tables/guests", "PATCH", jsonBody("tableNo" to draft.tableNo, "guestCount" to count))
        val next = draft.copy(guests = count)
        persistJob?.join(); repository.saveDraft(next)
        mutable.update { it.copy(draft = next, bill = it.bill?.copy(guestCount = count), sheet = "") }
    }
    fun prepareCheckout() {
        if (state.value.draft?.lines?.isNotEmpty() == true) { sheet("draft-protection"); return }
        mutable.update { it.copy(checkoutQuote = null, sheet = "checkout") }
        load {
            val quote = repository.requestObject("/api/tables/checkout", query = mapOf("tableNo" to state.value.draft!!.tableNo))
            mutable.update { it.copy(checkoutQuote = quote) }
        }
    }
    fun submit() = action {
        persistJob?.join()
        persistError?.let { throw it }
        val draft = state.value.draft ?: return@action
        val signature = OrderRules.fingerprint(OrderRules.payload(draft))
        if (signature == lastSubmitted && System.currentTimeMillis() - lastSubmittedAt < 12_000) {
            message(text("order.duplicateBlocked")); return@action
        }
        repository.submit(draft)
        lastSubmitted = signature; lastSubmittedAt = System.currentTimeMillis()
        mutable.update { it.copy(draft = draft.copy(lines = emptyList()), bill = null, sheet = "bill") }
        // A bill-read failure must never resurrect a successfully submitted basket.
        try { val bill = repository.bill(draft.tableNo); mutable.update { it.copy(bill = bill) } } catch (e: Exception) { fail(e) }
    }
    fun checkout() = action {
        val draft = state.value.draft ?: return@action
        persistJob?.join()
        require(draft.lines.isEmpty()) { either("请先处理待下单菜品", "Please handle draft items first") }
        val quote = state.value.checkoutQuote ?: return@action
        val result = repository.checkout(draft.tableNo, quote.text("sessionId"), quote.number("totalAmount").toLong())
        repository.clearDraft(draft)
        mutable.update { it.copy(draft = draft.copy(lines = emptyList())) }
        message(either("结账完成\n订单数：${result.orderCount}\n总金额：₱${result.totalAmount}", "Checkout complete\nOrders: ${result.orderCount}\nTotal: ₱${result.totalAmount}"))
        navigate(Screen.TABLES)
    }
    fun closeTable() = action {
        val draft = state.value.draft ?: return@action
        require(draft.lines.isEmpty()) { either("请先处理待下单菜品", "Please handle draft items first") }
        persistJob?.join(); repository.close(draft.tableNo); repository.clearDraft(draft)
        navigate(Screen.TABLES)
    }
    fun unmerge() = action {
        val draft = state.value.draft ?: return@action
        val body = repository.unmerge(draft.tableNo)
        val tableNo = body.text("tableNo")
        enterTableInternal(TableInfo(tableNo, listOf(tableNo), status = "open", guestCount = body.number("guestCount").toInt()))
    }
    fun printBill() = action {
        repository.printBill(state.value.draft!!.tableNo)
        message(text("order.printReceiptSuccess"))
    }
    fun returnItem(order: String, item: BillItem, qty: Int) = action {
        require(qty in 1..item.qty) { "退菜数量无效" }
        repository.returnItem(order, item.menuItemId, qty, orderItemId = item.orderItemId)
        val bill = repository.bill(state.value.draft!!.tableNo)
        mutable.update { it.copy(bill = bill) }
    }
    fun customDish(body: JsonObject) = action {
        val item = repository.customDish(body)
        val current = state.value.draft!!
        val existing = current.lines.find { it.item.id == item.id }
        val lines = current.lines.filterNot { it.item.id == item.id } + CartLine(item, (existing?.qty ?: 0) + 1, existing?.note)
        val draft = current.copy(lines = lines, category = item.category.orEmpty())
        persistJob?.join(); repository.saveDraft(draft)
        mutable.update { it.copy(draft = draft, menu = it.menu?.copy(items = it.menu.items.filterNot { m -> m.id == item.id } + item), sheet = "") }
    }
    fun filters(values: Map<String, String>) { mutable.update { it.copy(filters = values) }; loadManagement() }
    fun updateManagement(data: JsonObject) { mutable.update { it.copy(management = data) } }
    fun loadManagement() {
        val snapshot = state.value
        load { val result = readManagement(snapshot); mutable.update { it.copy(management = result) } }
    }
    private suspend fun readManagement(snapshot: UiState): JsonObject {
        val screen = snapshot.screen
        val defaults = DateRules.preset("today", LocalDate.now(), ZoneId.systemDefault())
        val query = if (snapshot.filters.isEmpty()) mapOf("from" to defaults.from.toString(), "to" to defaults.to.toString()) else snapshot.filters
        val path = when (screen) {
            Screen.ORDERS -> "/api/manage/orders"
            Screen.INCOME -> "/api/manage/income"
            Screen.HOT -> "/api/manage/hot-items"
            Screen.FEES -> "/api/pricing/rules"
            Screen.DEVICES -> "/api/devices"
            Screen.RBAC -> "/api/admin/permissions"
            Screen.MENU -> "/api/admin/menu-items"
            Screen.SUMMARY -> "/api/summary"
            else -> return JsonObject(emptyMap())
        }
        val related = when (screen) {
            Screen.DEVICES -> mapOf("health" to "/api/print/health")
            Screen.MENU -> mapOf("majorData" to "/api/admin/menu-categories", "subData" to "/api/admin/menu-subcategories")
            else -> emptyMap()
        }
        return repository.management(path,
                query = if (screen in setOf(Screen.ORDERS, Screen.INCOME, Screen.HOT, Screen.SUMMARY)) query else emptyMap(), related = related)
    }
    fun manageAction(path: String, method: String = "POST", body: JsonElement? = null) = action {
        repository.requestObject(path, method, body, timeoutMs = 8_000)
        loadManagement()
    }
}
