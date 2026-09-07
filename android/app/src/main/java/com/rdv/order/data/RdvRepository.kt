package com.rdv.order.data

import com.rdv.order.domain.OrderRules
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

@Serializable data class Workspace(val draft: Draft, val pending: List<PendingSubmission> = emptyList())

class RdvRepository(val api: Transport, private val store: KeyValueStore, private val origin: () -> String,
    private val clock: () -> Long = System::currentTimeMillis, private val newKey: () -> String = { UUID.randomUUID().toString() }) {
    private val workspaceMutex = Mutex()
    var session: Session? = null
        private set
    val isManager get() = session?.role == "manager"
    private fun digest(raw: String) = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray())
        .joinToString("") { "%02x".format(it) }
    // These two verified origins serve the same hotel backend. Preserve the 0.1.1
    // storage namespace on upgrade; the HTTP transport still uses the new origin.
    private fun storageOrigin() = when (val value = origin()) {
        "https://order.resortdejavu.cn" -> "https://rdv-order-renfei-zhaos-projects.vercel.app"
        else -> value
    }
    private fun sessionKey() = "session:${digest(storageOrigin())}"
    private fun scope(): String {
        val token = session?.token ?: error("未登录")
        // This claim is used only for local storage namespacing. Authorization remains server-side.
        val userId = runCatching {
            RdvJson.parseToJsonElement(String(Base64.getUrlDecoder().decode(token.split('.')[1]))).jsonObject.text("userId")
        }.getOrDefault("").ifEmpty { digest(token) }
        return digest("${storageOrigin()}|$userId")
    }
    private fun workspaceKey(table: String) = "workspace:${scope()}:$table"
    suspend fun restoreSession(): Session? = withContext(Dispatchers.IO) {
        session = store.get(sessionKey())?.let { RdvJson.decodeFromString<Session>(it) }
        session
    }
    suspend fun login(username: String, pin: String): Session {
        val result = RdvJson.decodeFromString<Session>(api.request("/api/login", "POST", jsonBody("username" to username.trim(), "pin" to pin), authenticated = false).text)
        require(result.role in setOf("waiter", "manager") && result.token.isNotEmpty()) { "登录响应无效" }
        withContext(Dispatchers.IO) { store.put(sessionKey(), RdvJson.encodeToString(result)) }
        session = result
        return result
    }
    suspend fun logout() {
        withContext(Dispatchers.IO) { store.remove(sessionKey()) }
        session = null
    }
    suspend fun tables(): List<TableInfo> = RdvJson.decodeFromString<TablesResponse>(api.request("/api/tables", timeoutMs = 5_000).text).tables
    suspend fun open(table: String, guests: Int): OpenSession = RdvJson.decodeFromString<OpenResponse>(
        api.request("/api/tables", "POST", jsonBody("tableNo" to table, "guestCount" to guests), timeoutMs = 1_800).text).session
    suspend fun merge(primary: String, secondary: String, guests: Int): OpenSession = RdvJson.decodeFromString<OpenResponse>(
        api.request("/api/tables/merge", "POST", jsonBody("primaryTable" to primary, "secondaryTable" to secondary, "guestCount" to guests), timeoutMs = 7_000, retries = 1).text).session

    suspend fun cachedMenu(shift: String): MenuResponse? = withContext(Dispatchers.IO) {
        store.get("menu:${digest(storageOrigin())}:$shift")?.let { raw ->
            val cached = RdvJson.decodeFromString<CachedMenu>(raw)
            cached.response.takeIf { clock() - cached.savedAt in 0..14L * 24 * 60 * 60 * 1000 }
        }
    }
    suspend fun menu(shift: String): MenuResponse {
        val result = RdvJson.decodeFromString<MenuResponse>(api.request("/api/menu", query = mapOf("shift" to shift), authenticated = false, timeoutMs = 5_000).text)
        withContext(Dispatchers.IO) { store.put("menu:${digest(storageOrigin())}:$shift", RdvJson.encodeToString(CachedMenu(result, clock()))) }
        return result
    }
    private fun readWorkspace(default: Draft, storageKey: String = workspaceKey(default.tableNo)): Workspace = store.get(storageKey)
        ?.let { RdvJson.decodeFromString<Workspace>(it) } ?: Workspace(default)
    private fun writeWorkspace(value: Workspace, storageKey: String = workspaceKey(value.draft.tableNo)) = store.put(storageKey, RdvJson.encodeToString(value))

    suspend fun loadDraft(table: TableInfo): Draft = withContext(Dispatchers.IO) { workspaceMutex.withLock {
        val fresh = Draft(table.tableNo, table.openedAt, table.guestCount ?: 2)
        val saved = readWorkspace(fresh)
        // Do not carry a prior service's basket into a newly opened table.
        if (saved.draft.openedAt != null && table.openedAt != null && saved.draft.openedAt != table.openedAt) {
            writeWorkspace(Workspace(fresh, saved.pending))
            fresh
        } else saved.draft.copy(openedAt = table.openedAt ?: saved.draft.openedAt, guests = fresh.guests)
    } }
    fun prepareDraftSave(draft: Draft): suspend () -> Unit {
        // Capture ownership before this write joins the UI's save queue. A later login must not redirect it.
        val storageKey = workspaceKey(draft.tableNo)
        return { withContext(Dispatchers.IO) { workspaceMutex.withLock {
            val current = readWorkspace(draft, storageKey)
            writeWorkspace(current.copy(draft = draft.copy(updatedAt = clock())), storageKey)
        } } }
    }
    suspend fun saveDraft(draft: Draft) = prepareDraftSave(draft).invoke()
    suspend fun clearDraft(draft: Draft) = saveDraft(draft.copy(lines = emptyList()))

    suspend fun submit(draft: Draft): SubmissionResult {
        val payload = OrderRules.payload(draft)
        val fingerprint = OrderRules.fingerprint(payload)
        var reused = false
        val pending = withContext(Dispatchers.IO) { workspaceMutex.withLock {
            val current = readWorkspace(draft)
            val old = current.pending.find { it.openedAt == draft.openedAt && OrderRules.fingerprint(it.payload) == fingerprint }
            reused = old != null
            val chosen = old ?: PendingSubmission(newKey(), payload, clock(), draft.openedAt)
            // Persist the original payload and key before any network write.
            writeWorkspace(current.copy(draft = draft, pending = if (old == null) current.pending + chosen else current.pending))
            chosen
        } }
        val known = if (reused) {
            try {
                val status = RdvJson.decodeFromString<SubmissionStatus>(api.request("/api/orders/request-status", query = mapOf("key" to pending.key)).text)
                status.orderId?.takeIf { status.found }?.let { SubmissionResult(it, true) }
            } catch (error: ApiException) {
                // Existing deployments can be used before the additive status endpoint is deployed.
                if (error.status != 404) throw error
                null
            }
        } else null
        val result = known ?: RdvJson.decodeFromString<SubmissionResult>(api.request("/api/orders", "POST",
            RdvJson.encodeToJsonElement(pending.payload), idempotencyKey = pending.key, timeoutMs = 12_000, retries = 0).text)
        require(result.orderId.isNotBlank()) { "提交响应无效" }
        withContext(Dispatchers.IO) { workspaceMutex.withLock {
            val current = readWorkspace(draft)
            val sameDraft = current.draft.lines.isNotEmpty() && OrderRules.fingerprint(OrderRules.payload(current.draft)) == fingerprint
            writeWorkspace(current.copy(draft = if (sameDraft) current.draft.copy(lines = emptyList()) else current.draft,
                pending = current.pending.filterNot { it.key == pending.key }))
        } }
        return result
    }
    suspend fun bill(table: String): Bill = RdvJson.decodeFromString<Bill>(api.request("/api/tables/bill", query = mapOf("tableNo" to table), timeoutMs = 6_000).text)
    suspend fun printBill(table: String) { api.request("/api/tables/print-bill", "POST", jsonBody("tableNo" to table), timeoutMs = 1_800) }
    suspend fun checkout(table: String): CheckoutResult = RdvJson.decodeFromString<CheckoutResult>(api.request("/api/tables/checkout", "POST", jsonBody("tableNo" to table), timeoutMs = 8_000, retries = 1).text)
    suspend fun close(table: String) { api.request("/api/tables/close", "POST", jsonBody("tableNo" to table), timeoutMs = 7_000, retries = 1) }
    suspend fun unmerge(table: String): JsonObject = requestObject("/api/tables/unmerge", "POST", jsonBody("tableNo" to table), timeoutMs = 7_000, retries = 1)
    suspend fun returnItem(orderId: String, item: String, qty: Int, reason: String = "manual correction") {
        api.request("/api/orders/$orderId/return-item", "POST", jsonBody("menuItemId" to item, "qty" to qty, "reason" to reason), timeoutMs = 7_000)
    }
    suspend fun customDish(body: JsonObject): MenuItem = RdvJson.decodeFromJsonElement(
        requestObject("/api/menu/custom", "POST", body, timeoutMs = 7_000).getValue("item"))
    suspend fun requestObject(path: String, method: String = "GET", body: JsonElement? = null,
        query: Map<String, String> = emptyMap(), timeoutMs: Long = 6_000, retries: Int = if (method == "GET") 1 else 0): JsonObject =
        RdvJson.parseToJsonElement(api.request(path, method, body, query, timeoutMs = timeoutMs, retries = retries).text).jsonObject
}
