package com.rdv.order.data

import java.io.IOException
import java.util.Base64
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

private class MemoryStore : KeyValueStore {
    val values = mutableMapOf<String, String>()
    var failWrites = false
    override fun get(key: String) = values[key]
    override fun put(key: String, value: String) { if (failWrites) throw IOException("storage full"); values[key] = value }
    override fun remove(key: String) { values.remove(key) }
}
private data class Recorded(val path: String, val method: String, val body: JsonElement?, val key: String?, val query: Map<String, String>, val timeoutMs: Long, val retries: Int)
private class RecordingTransport : Transport {
    val calls = mutableListOf<Recorded>()
    var handler: (Recorded) -> String = { "{}" }
    override suspend fun request(path: String, method: String, body: JsonElement?, query: Map<String, String>, idempotencyKey: String?, timeoutMs: Long, retries: Int, authenticated: Boolean): ApiResponse {
        val call = Recorded(path, method, body, idempotencyKey, query, timeoutMs, retries); calls.add(call)
        val text = if (path == "/api/login") {
            val user = body!!.jsonObject.text("username")
            val claims = Base64.getUrlEncoder().withoutPadding().encodeToString("{\"userId\":\"$user\"}".toByteArray())
            "{\"token\":\"header.$claims.signature\",\"role\":\"waiter\"}"
        } else handler(call)
        return ApiResponse(text, "application/json", null)
    }
}

class RdvRepositoryTest {
    @Test fun `kitchen notice reads only this tables kitchen tickets without printing`() = runBlocking {
        val api = RecordingTransport()
        val repo = RdvRepository(api, MemoryStore(), { "https://fixture.invalid" })
        api.handler = { call ->
            assertEquals("GET", call.method)
            assertEquals("04", call.query["tableNo"])
            """{"jobs":[
                {"id":"unsent","tableNo":"04","kind":"order","status":"queued","mac":"fixture"},
                {"id":"uncertain","tableNo":"04","kind":"order","status":"unknown","mac":"fixture"},
                {"id":"bill","tableNo":"04","kind":"receipt","status":"queued","mac":"fixture"},
                {"id":"other","tableNo":"05","kind":"order","status":"queued","mac":"fixture"},
                {"id":"sent","tableNo":"04","kind":"order","status":"accepted","mac":"fixture"}
            ]}"""
        }
        assertEquals(listOf("unsent", "uncertain"), repo.kitchenTickets("04").map { it.id })
        assertEquals(1, api.calls.size)
    }
    @Test fun `unsent kitchen can recover after restart using saved ticket without another order`() = runBlocking {
        val api = RecordingTransport(); val store = MemoryStore(); var connected = false; var sends = 0
        var claimed = false
        val printing = LocalPrinting(api, LocalConnector {
            if (!connected) throw IOException("no connection")
            object : LocalConnection {
                override fun send(bytes: ByteArray): Boolean { sends++; return true }
                override fun close() {}
            }
        })
        val repo = RdvRepository(api, store, { "https://fixture.invalid" }, localPrinting = printing)
        repo.login("staff", "test")
        val saved = """{"id":"original-ticket","status":"queued","mac":"fixture","tableNo":"01","kind":"order"}"""
        api.handler = { call -> when {
            call.path == "/api/orders" -> """{"orderId":"saved-order","localPrint":$saved}"""
            call.method == "GET" -> """{"jobs":[$saved]}"""
            call.body!!.jsonObject.text("action") == "report" -> "{}"
            claimed -> """{"granted":false,"status":"accepted"}"""
            else -> { claimed = true; """{"granted":true,"token":"claim","content":"VEVTVA=="}""" }
        } }
        assertEquals("NOT_SENT", repo.submit(draft).localOutcome)
        val restored = RdvRepository(api, store, { "https://fixture.invalid" }, localPrinting = printing)
        restored.restoreSession()
        val ticket = restored.kitchenTickets("01").single()
        connected = true
        assertEquals(LocalPrintResult.SENT, restored.retryKitchenTicket(ticket))
        assertEquals(LocalPrintResult.SENT, restored.retryKitchenTicket(ticket))
        assertEquals(1, sends)
        assertEquals(1, api.calls.count { it.path == "/api/orders" })
        assertTrue(api.calls.filter { it.body?.jsonObject?.text("action") == "claim" }
            .all { it.body!!.jsonObject.text("id") == "original-ticket" })
    }
    @Test fun `lost local order response recovers ticket and sends without repeating order`() = runBlocking {
        val api = RecordingTransport(); val store = MemoryStore(); var sends = 0
        val printing = LocalPrinting(api, LocalConnector { object : LocalConnection {
            override fun send(bytes: ByteArray): Boolean { sends++; return true }
            override fun close() {}
        } })
        val repo = RdvRepository(api, store, { "https://fixture.invalid" }, localPrinting = printing)
        repo.login("staff", "test")
        api.handler = { call -> when (call.path) {
            "/api/orders" -> throw IOException("lost after commit")
            "/api/orders/request-status" -> """{"found":true,"orderId":"saved","localPrint":{"id":"job","status":"queued","mac":"fixture"}}"""
            else -> """{"granted":true,"token":"claim","content":"VEVTVA=="}"""
        } }
        assertEquals("SENT", repo.submit(draft).localOutcome)
        assertEquals(1, sends)
        assertEquals(1, api.calls.count { it.path == "/api/orders" })
        assertTrue(repo.loadDraft(TableInfo("01", guestCount = 2, openedAt = draft.openedAt)).lines.isEmpty())
    }
    @Test fun `disconnected local bill retries original ticket after reconnect`() = runBlocking {
        val api = RecordingTransport(); val store = MemoryStore(); var connected = false; var sends = 0
        val printing = LocalPrinting(api, LocalConnector {
            if (!connected) throw IOException("no LAN")
            object : LocalConnection {
                override fun send(bytes: ByteArray): Boolean { sends++; return true }
                override fun close() {}
            }
        })
        val repo = RdvRepository(api, store, { "https://fixture.invalid" }, localPrinting = printing)
        repo.login("staff", "test")
        api.handler = { call -> if (call.path == "/api/print/local") """{"granted":true,"token":"claim","content":"VEVTVA=="}"""
            else """{"found":true,"ok":true,"queued":true,"localPrint":{"id":"same-job","status":"queued","mac":"fixture"}}""" }
        assertEquals(BillPrintResult.NOT_SENT, repo.printBill("01", "session"))
        connected = true
        assertEquals(BillPrintResult.QUEUED, repo.printBill("01", "session"))
        assertEquals(1, sends)
        assertEquals(1, api.calls.count { it.path == "/api/tables/print-bill" })
    }
    @Test fun `bill printing preserves one intent across lost response and process restart`() = runBlocking {
        val api = RecordingTransport(); val store = MemoryStore()
        var next = 0
        val repository = RdvRepository(api, store, { "https://fixture.invalid" }, newKey = { "print-${++next}" })
        repository.login("staff", "test")
        api.handler = { call ->
            if (call.path == "/api/tables/print-bill") throw IOException("response lost")
            "{\"found\":false}"
        }
        assertEquals(BillPrintResult.PENDING, repository.printBill("06", "session-a"))
        val restored = RdvRepository(api, store, { "https://fixture.invalid" }, newKey = { "print-${++next}" })
        restored.restoreSession()
        api.handler = { call ->
            if (call.path == "/api/print/status") "{\"found\":false}"
            else "{\"ok\":true,\"queued\":true,\"jobId\":\"job-1\"}"
        }
        assertEquals(BillPrintResult.QUEUED, restored.printBill("06", "session-a"))
        val writes = api.calls.filter { it.path == "/api/tables/print-bill" }
        assertEquals(2, writes.size)
        assertEquals("print-1", writes[0].key)
        assertEquals(writes[0].key, writes[1].key)
        assertEquals(8_000L, writes[1].timeoutMs)
        assertEquals(0, writes[1].retries)
        assertEquals(BillPrintResult.QUEUED, restored.printBill("06", "session-a"))
        assertEquals("print-2", api.calls.last { it.path == "/api/tables/print-bill" }.key)
    }

    @Test fun `first submission timeout resolves saved order by read without replay`() = runBlocking {
        val api = RecordingTransport(); val store = MemoryStore()
        val repo = RdvRepository(api, store, { "https://fixture.invalid" }, newKey = { "original-key" })
        repo.login("staff", "test")
        api.handler = {
            if (it.path == "/api/orders") throw java.io.InterruptedIOException("timeout after commit")
            assertEquals("/api/orders/request-status", it.path)
            assertEquals("original-key", it.query["key"])
            "{\"found\":true,\"orderId\":\"saved\"}"
        }
        assertEquals("saved", repo.submit(draft).orderId)
        assertEquals(1, api.calls.count { it.path == "/api/orders" })
        assertTrue(repo.loadDraft(TableInfo("01", guestCount = 2, openedAt = draft.openedAt)).lines.isEmpty())
    }
    @Test fun `unconfirmed timeout keeps basket and key and never automatically resubmits`() = runBlocking {
        val api = RecordingTransport(); val store = MemoryStore()
        val repo = RdvRepository(api, store, { "https://fixture.invalid" }, newKey = { "original-key" })
        repo.login("staff", "test")
        api.handler = { if (it.path == "/api/orders") throw java.io.InterruptedIOException("timeout") else "{\"found\":false}" }
        assertTrue(runCatching { repo.submit(draft) }.exceptionOrNull() is java.io.InterruptedIOException)
        assertEquals(1, api.calls.count { it.path == "/api/orders" })
        assertEquals(draft.lines, repo.loadDraft(TableInfo("01", guestCount = 2, openedAt = draft.openedAt)).lines)
    }
    @Test fun `rejected order does not perform timeout recovery`() = runBlocking {
        val api = RecordingTransport(); val repo = RdvRepository(api, MemoryStore(), { "https://fixture.invalid" })
        repo.login("staff", "test"); api.handler = { throw ApiException(400, "invalid dish") }
        assertTrue(runCatching { repo.submit(draft) }.exceptionOrNull() is ApiException)
        assertFalse(api.calls.any { it.path.endsWith("request-status") })
    }

    private val dish = MenuItem("dish-uuid", "Rice", 80)
    private val draft = Draft("01", "2026-09-07T00:00:00Z", lines = listOf(CartLine(dish, 2, "no onion")))
    @Test fun `hotel custom domain upgrade preserves session drafts and menu cache`() = runBlocking {
        val store = MemoryStore(); val oldApi = RecordingTransport(); val newApi = RecordingTransport()
        val old = RdvRepository(oldApi, store, { "https://rdv-order-renfei-zhaos-projects.vercel.app" })
        val session = old.login("staff-a", "test"); old.saveDraft(draft)
        oldApi.handler = { "{\"items\":[],\"shift\":\"lunch\"}" }; old.menu("lunch")
        val upgraded = RdvRepository(newApi, store, { "https://order.resortdejavu.cn" })
        assertEquals(session, upgraded.restoreSession())
        assertEquals(draft.lines, upgraded.loadDraft(TableInfo("01", guestCount = 2, openedAt = draft.openedAt)).lines)
        assertNotNull(upgraded.cachedMenu("lunch"))
        assertTrue(newApi.calls.isEmpty())
        upgraded.logout(); assertNull(old.restoreSession())
    }
    @Test fun `domain upgrade retains uncertain submission key and uses new transport for recovery`() = runBlocking {
        val store = MemoryStore(); val oldApi = RecordingTransport(); val newApi = RecordingTransport()
        val old = RdvRepository(oldApi, store, { "https://rdv-order-renfei-zhaos-projects.vercel.app" }, newKey = { "persisted-before-upgrade" })
        old.login("staff-a", "test"); oldApi.handler = { throw IOException("lost response") }
        assertTrue(runCatching { old.submit(draft) }.isFailure)
        val original = oldApi.calls.last { it.path == "/api/orders" }
        val upgraded = RdvRepository(newApi, store, { "https://order.resortdejavu.cn" }, newKey = { error("must retain key") })
        upgraded.restoreSession()
        newApi.handler = { if (it.path.endsWith("request-status")) "{\"found\":false}" else "{\"orderId\":\"saved\",\"deduped\":true}" }
        assertEquals("saved", upgraded.submit(draft).orderId)
        assertEquals(original.key, newApi.calls.last().key)
        assertEquals(original.body, newApi.calls.last().body)
        assertEquals(1, oldApi.calls.count { it.path == "/api/orders" })
    }
    @Test fun `custom domain alias does not share sessions or drafts with unrelated origins or users`() = runBlocking {
        val store = MemoryStore(); val api = RecordingTransport()
        val old = RdvRepository(api, store, { "https://rdv-order-renfei-zhaos-projects.vercel.app" })
        old.login("staff-a", "test"); old.saveDraft(draft)
        val other = RdvRepository(api, store, { "https://another.resortdejavu.cn" })
        assertNull(other.restoreSession()); other.login("staff-a", "test")
        assertTrue(other.loadDraft(TableInfo("01", guestCount = 2, openedAt = draft.openedAt)).lines.isEmpty())
        val upgraded = RdvRepository(api, store, { "https://order.resortdejavu.cn" })
        upgraded.login("staff-b", "test")
        assertTrue(upgraded.loadDraft(TableInfo("01", guestCount = 2, openedAt = draft.openedAt)).lines.isEmpty())
    }
    @Test fun `lost response retries with original persisted key and payload after repository recreation`() = runBlocking {
        val store = MemoryStore(); val transport = RecordingTransport()
        var created = 0
        val first = RdvRepository(transport, store, { "https://test.invalid" }, newKey = { "key-${++created}" })
        first.login("staff-a", "test")
        transport.handler = { throw IOException("response lost after save") }
        assertTrue(runCatching { first.submit(draft) }.isFailure)
        val original = transport.calls.last { it.path == "/api/orders" }
        assertEquals(1, created)
        val second = RdvRepository(transport, store, { "https://test.invalid" }, newKey = { "unexpected-key" })
        second.restoreSession()
        transport.handler = { if (it.path.endsWith("request-status")) "{\"found\":false}" else "{\"orderId\":\"saved\",\"deduped\":true}" }
        assertEquals("saved", second.submit(draft).orderId)
        val retried = transport.calls.last()
        assertEquals(original.key, retried.key)
        assertEquals(original.body, retried.body)
        assertTrue(second.loadDraft(TableInfo("01", status = "open", guestCount = 2, openedAt = draft.openedAt)).lines.isEmpty())
    }
    @Test fun `found status resolves a saved order without resubmission or another print job`() = runBlocking {
        val store = MemoryStore(); val transport = RecordingTransport(); val repo = RdvRepository(transport, store, { "https://test.invalid" })
        repo.login("staff", "test"); transport.handler = { throw IOException("lost") }
        runCatching { repo.submit(draft) }
        transport.handler = { assertTrue(it.path.endsWith("request-status")); "{\"found\":true,\"orderId\":\"saved\"}" }
        assertEquals("saved", repo.submit(draft).orderId)
        assertEquals(1, transport.calls.count { it.path == "/api/orders" })
    }
    @Test fun `missing recovery endpoint falls back to existing idempotent submission`() = runBlocking {
        val store = MemoryStore(); val transport = RecordingTransport(); val repo = RdvRepository(transport, store, { "https://test.invalid" })
        repo.login("staff", "test"); transport.handler = { throw IOException("lost") }
        runCatching { repo.submit(draft) }; val key = transport.calls.last { it.path == "/api/orders" }.key
        transport.handler = { if (it.path.endsWith("request-status")) throw ApiException(404, "not deployed") else "{\"orderId\":\"saved\"}" }
        repo.submit(draft)
        assertEquals(key, transport.calls.last().key)
    }
    @Test fun `storage failure prevents a request from being sent`() = runBlocking {
        val store = MemoryStore(); val transport = RecordingTransport(); val repo = RdvRepository(transport, store, { "https://test.invalid" })
        repo.login("staff", "test"); store.failWrites = true
        assertTrue(runCatching { repo.submit(draft) }.isFailure)
        assertFalse(transport.calls.any { it.path == "/api/orders" })
    }
    @Test fun `same table reopened for another service cannot reuse prior uncertain order identity`() = runBlocking {
        val store = MemoryStore(); val transport = RecordingTransport(); var counter = 0
        val repo = RdvRepository(transport, store, { "https://test.invalid" }, newKey = { "new-key-${++counter}" })
        repo.login("staff", "test"); transport.handler = { throw IOException("lost") }
        runCatching { repo.submit(draft) }
        val fresh = repo.loadDraft(TableInfo("01", status = "open", guestCount = 3, openedAt = "2026-09-07T08:00:00Z"))
        assertTrue(fresh.lines.isEmpty())
        transport.handler = { "{\"orderId\":\"second-service\"}" }
        repo.submit(fresh.copy(lines = draft.lines))
        assertEquals(2, counter)
        assertEquals("new-key-2", transport.calls.last().key)
    }
    @Test fun `drafts and uncertain submissions are isolated between accounts`() = runBlocking {
        val store = MemoryStore(); val transport = RecordingTransport(); val repo = RdvRepository(transport, store, { "https://test.invalid" })
        repo.login("staff-a", "test"); repo.saveDraft(draft); repo.logout(); repo.login("staff-b", "test")
        assertTrue(repo.loadDraft(TableInfo("01", guestCount = 2, openedAt = draft.openedAt)).lines.isEmpty())
        repo.logout(); repo.login("staff-a", "test")
        assertEquals(draft.lines, repo.loadDraft(TableInfo("01", guestCount = 2, openedAt = draft.openedAt)).lines)
    }
    @Test fun `menu cache has an expiry and does not turn into offline order acceptance`() = runBlocking {
        val store = MemoryStore(); val transport = RecordingTransport(); var now = 1L
        val repo = RdvRepository(transport, store, { "https://test.invalid" }, clock = { now })
        transport.handler = { "{\"items\":[],\"shift\":\"lunch\"}" }
        repo.menu("lunch"); assertNotNull(repo.cachedMenu("lunch"))
        now += 15L * 24 * 60 * 60 * 1000
        assertNull(repo.cachedMenu("lunch"))
    }
    @Test fun `queued draft writes keep their original account when a new user logs in`() = runBlocking {
        val store = MemoryStore(); val transport = RecordingTransport()
        val repo = RdvRepository(transport, store, { "https://test.invalid" })
        repo.login("staff-a", "test")
        val firstSave = repo.prepareDraftSave(draft)
        val edited = draft.copy(lines = listOf(CartLine(dish, 3, "no onion")))
        val secondSave = repo.prepareDraftSave(edited)
        repo.logout(); repo.login("staff-b", "test")
        firstSave(); secondSave()
        val table = TableInfo("01", guestCount = 2, openedAt = draft.openedAt)
        assertTrue(repo.loadDraft(table).lines.isEmpty())
        repo.logout(); repo.login("staff-a", "test")
        assertEquals(edited.lines, repo.loadDraft(table).lines)
    }
    @Test fun `malformed successful submit response does not clear the basket`() = runBlocking {
        val store = MemoryStore(); val transport = RecordingTransport(); val repo = RdvRepository(transport, store, { "https://test.invalid" })
        repo.login("staff", "test"); transport.handler = { "{}" }
        assertTrue(runCatching { repo.submit(draft) }.isFailure)
        assertEquals(draft.lines, repo.loadDraft(TableInfo("01", guestCount = 2, openedAt = draft.openedAt)).lines)
    }
}
