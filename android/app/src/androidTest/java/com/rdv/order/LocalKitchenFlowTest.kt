package com.rdv.order

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.rdv.order.data.*
import com.rdv.order.ui.*
import java.io.IOException
import java.util.Base64
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Isolated staff workflow. No hotel API, business records or printer traffic. */
@RunWith(AndroidJUnit4::class)
class LocalKitchenFlowTest {
    @get:Rule val compose = createComposeRule()

    @Test fun normalSubmitReconnectsAndUnsentKitchenRecoveryDoesNotCreateAnotherOrder() {
        val fixture = FixtureTransport()
        val jobs = linkedMapOf<String, JsonObject>()
        val sent = mutableListOf<String>()
        var failures = 1 // Missed discovery: the first normal order must still send.
        var closed = true
        val connector = LocalConnector {
            if (failures > 0) { failures--; throw IOException("Isolated missed discovery") }
            closed = false
            object : LocalConnection {
                override fun send(bytes: ByteArray): Boolean { sent += String(bytes); return true }
                override fun close() { closed = true }
            }
        }
        val transport = object : Transport {
            override suspend fun request(path: String, method: String, body: JsonElement?, query: Map<String, String>, idempotencyKey: String?, timeoutMs: Long, retries: Int, authenticated: Boolean): ApiResponse {
                fun response(value: JsonObject) = ApiResponse(value.toString(), "application/json", null)
                if (path == "/api/print/local") {
                    if (method == "GET") return response(buildJsonObject { put("jobs", JsonArray(jobs.values.filter { it.text("status") == "queued" })) })
                    val request = body!!.jsonObject
                    val id = request.text("id")
                    val job = jobs.getValue(id)
                    if (request.text("action") == "report") {
                        assertTrue("Printer must be released before HTTP reporting", closed)
                        jobs[id] = JsonObject(job + ("status" to JsonPrimitive(request.text("status"))))
                        return response(jsonBody("ok" to true))
                    }
                    if (job.text("status") != "queued") return response(jsonBody("granted" to false, "status" to job.text("status")))
                    jobs[id] = JsonObject(job + ("status" to JsonPrimitive("sending")))
                    return response(jsonBody("granted" to true, "token" to request.text("claimToken"), "content" to Base64.getEncoder().encodeToString(id.toByteArray())))
                }
                val result = fixture.request(path, method, body, query, idempotencyKey, timeoutMs, retries, authenticated)
                if (path !in setOf("/api/orders", "/api/tables/print-bill") || method != "POST") return result
                val id = if (path == "/api/orders") "kitchen-${jobs.size}" else "bill-${jobs.size}"
                val ticket = jsonBody("id" to id, "status" to "queued", "mac" to "00:21:40:ff:2b:95", "tableNo" to "01", "kind" to if (path == "/api/orders") "order" else "receipt")
                jobs[id] = ticket
                return response(JsonObject(RdvJson.parseToJsonElement(result.text).jsonObject + ("localPrint" to ticket)))
            }
        }
        val store = TestStore()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val repository = RdvRepository(transport, store, { "https://isolated-fixture.invalid" }, localPrinting = LocalPrinting(transport, connector))
        lateinit var vm: RdvViewModel
        compose.setContent {
            vm = androidx.compose.runtime.remember { RdvViewModel(repository, Strings(context), store) }
            RdvRoot(vm)
        }
        compose.waitUntil(10_000) { vm.state.value.ready }
        compose.onNodeWithTag("username").performTextInput("waiter")
        compose.onNodeWithTag("pin").performTextInput("fixture-pin")
        compose.onNodeWithTag("login").performScrollTo().performClick()
        compose.waitUntil(10_000) { !vm.state.value.loading && vm.state.value.screen == Screen.TABLES }
        compose.onNodeWithTag("table-01").performClick()
        compose.onNodeWithText("Confirm Open").performClick()
        compose.waitUntil(10_000) { vm.state.value.menu != null && !vm.state.value.loading && !vm.state.value.busy }
        compose.onNodeWithTag("add-${fixture.rice.id}").performScrollTo().performClick()
        compose.onNodeWithTag("submit").performClick()
        compose.waitUntil(10_000) { vm.state.value.bill != null && !vm.state.value.busy }
        assertEquals(listOf("kitchen-0"), sent)
        assertTrue(vm.state.value.kitchenTickets.isEmpty())
        compose.onAllNodesWithTag("kitchen-print-notice").assertCountEquals(0)

        // A later unsent ticket stays visible even when the bill refresh also fails.
        compose.runOnIdle { vm.sheet(""); failures = 2; fixture.billReadFailure = true }
        repeat(2) { compose.onNodeWithTag("add-${fixture.rice.id}").performScrollTo().performClick() }
        compose.onNodeWithTag("submit").performClick()
        compose.waitUntil(10_000) { !vm.state.value.busy && vm.state.value.kitchenTickets.size == 1 }
        compose.onAllNodesWithTag("kitchen-print-notice").onLast().assertIsDisplayed()
        assertEquals(1, sent.size)
        assertTrue(vm.state.value.draft!!.lines.isEmpty())
        compose.runOnIdle { fixture.billReadFailure = false; vm.showBill() }
        compose.waitUntil(10_000) { !vm.state.value.loading && vm.state.value.bill != null }
        compose.onAllNodesWithText("Retry unsent kitchen tickets").onLast().performClick()
        compose.waitUntil(10_000) { !vm.state.value.busy && vm.state.value.kitchenTickets.isEmpty() }
        assertEquals(listOf("kitchen-0", "kitchen-1"), sent)
        assertEquals(2, fixture.calls.count { it.path == "/api/orders" && it.method == "POST" })
        compose.runOnIdle { vm.retryKitchenTickets() }
        compose.waitUntil { !vm.state.value.busy }
        assertEquals(2, sent.size)

        compose.onNodeWithText("Print bill").performClick()
        compose.waitUntil(10_000) { !vm.state.value.busy && sent.size == 3 }
        assertEquals(listOf("kitchen-0", "kitchen-1", "bill-2"), sent)
        assertEquals(1, fixture.calls.count { it.path == "/api/tables/print-bill" })
    }
}
