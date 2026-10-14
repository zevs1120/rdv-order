package com.rdv.order.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy

class LocalPrintingTest {
    private val ticket = LocalTicket("job", "queued", "00:21:40:ff:2b:95")
    private class Api : Transport {
        var claims = 0; var reports = 0; var status = "queued"; var loseClaim = false; var loseReport = false
        override suspend fun request(path: String, method: String, body: JsonElement?, query: Map<String,String>,
            idempotencyKey: String?, timeoutMs: Long, retries: Int, authenticated: Boolean): ApiResponse {
            assertEquals(1, retries)
            if (body!!.jsonObject.text("action") == "report") {
                reports++; if (loseReport) throw IOException("lost report")
                status = body.jsonObject.text("status")
                return ApiResponse("{}", null, null)
            }
            claims++
            if (status != "queued") return ApiResponse("""{"granted":false,"status":"$status"}""", null, null)
            status = "sending"
            if (loseClaim) throw IOException("lost claim response")
            return ApiResponse("""{"granted":true,"token":"claim","content":"VEVTVA=="}""", null, null)
        }
    }
    @Test fun `recovery and repeated tap cannot send claimed paper twice`() = runBlocking {
        val api = Api(); var sends = 0
        val printer = LocalPrinting(api, LocalConnector { object : LocalConnection {
            override fun send(bytes: ByteArray): Boolean { sends++; assertEquals("TEST", String(bytes)); return true }
            override fun close() {}
        } })
        assertEquals(LocalPrintResult.SENT, printer.print(ticket))
        assertEquals(LocalPrintResult.SENT, printer.print(ticket))
        assertEquals(1, sends)
    }
    @Test fun `missing LAN connection leaves ticket unclaimed and safely retryable`() = runBlocking {
        val api = Api()
        var connections = 0
        assertEquals(LocalPrintResult.NOT_SENT, LocalPrinting(api, LocalConnector { connections++; throw IOException() }).print(ticket))
        assertEquals(2, connections)
        assertEquals(0, api.claims)
    }
    @Test fun `failed first connection recovers before claim and sends exactly once`() = runBlocking {
        val api = Api(); var connections = 0; var sends = 0
        val printer = LocalPrinting(api, LocalConnector {
            if (++connections == 1) throw IOException("first discovery missed")
            assertEquals(0, api.claims)
            object : LocalConnection {
                override fun send(bytes: ByteArray): Boolean { sends++; return true }
                override fun close() {}
            }
        })
        assertEquals(LocalPrintResult.SENT, printer.print(ticket))
        assertEquals(2, connections)
        assertEquals(1, api.claims)
        assertEquals(1, sends)
    }
    @Test fun `lost HTTP claim and report responses recover without a second paper send`() = runBlocking {
        val server = MockWebServer()
        var claims = 0; var reports = 0; var sends = 0; var closed = false
        var grantedToken = ""; var accepted = false
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val body = RdvJson.parseToJsonElement(request.body.readUtf8()).jsonObject
                if (body.text("action") == "report") {
                    assertTrue("Printer must be released before reporting", closed)
                    assertEquals(grantedToken, body.text("token"))
                    accepted = true
                    return if (++reports == 1) MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)
                        else MockResponse().setBody("{}")
                }
                claims++
                if (accepted) {
                    assertNotEquals("A new invocation must not reuse its previous send grant", grantedToken, body.text("claimToken"))
                    return MockResponse().setBody("""{"granted":false,"status":"accepted"}""")
                }
                if (claims == 1) {
                    grantedToken = body.text("claimToken")
                    assertTrue(grantedToken.isNotBlank())
                    return MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)
                }
                assertEquals(grantedToken, body.text("claimToken"))
                return MockResponse().setBody("""{"granted":true,"token":"$grantedToken","content":"VEVTVA=="}""")
            }
        }
        server.start()
        try {
            // The fixture listens on IPv4; don't let localhost's unused ::1
            // address become an unrelated connection refusal during retry.
            val api = ApiClient({ server.url("/").newBuilder().host("127.0.0.1").build().toString() },
                { "fixture" }, allowLocalHttp = true)
            val printer = LocalPrinting(api, LocalConnector { object : LocalConnection {
                override fun send(bytes: ByteArray): Boolean { sends++; return true }
                override fun close() { closed = true }
            } })
            val firstResult = printer.print(ticket)
            assertEquals("claims=$claims reports=$reports sends=$sends", LocalPrintResult.SENT, firstResult)
            assertEquals(LocalPrintResult.SENT, printer.print(ticket))
            assertEquals(3, claims)
            assertEquals(2, reports)
            assertEquals(1, sends)
        } finally { server.shutdown() }
    }
    @Test fun `lost claim or send result never replays bytes`() = runBlocking {
        for (loseClaim in listOf(true, false)) {
            val api = Api().apply { this.loseClaim = loseClaim; loseReport = true }
            var sends = 0
            val printer = LocalPrinting(api, LocalConnector { object : LocalConnection {
                override fun send(bytes: ByteArray): Boolean { sends++; throw IOException("partial write") }
                override fun close() {}
            } })
            assertEquals(LocalPrintResult.UNKNOWN, printer.print(ticket))
            assertEquals(LocalPrintResult.UNKNOWN, printer.print(ticket))
            assertEquals(if (loseClaim) 0 else 1, sends)
        }
    }
}
