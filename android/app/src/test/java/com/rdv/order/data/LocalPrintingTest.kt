package com.rdv.order.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class LocalPrintingTest {
    private val ticket = LocalTicket("job", "queued", "00:21:40:ff:2b:95")
    private class Api : Transport {
        var claims = 0; var reports = 0; var status = "queued"; var loseClaim = false; var loseReport = false
        override suspend fun request(path: String, method: String, body: JsonElement?, query: Map<String,String>,
            idempotencyKey: String?, timeoutMs: Long, retries: Int, authenticated: Boolean): ApiResponse {
            assertEquals(0, retries)
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
        assertEquals(LocalPrintResult.NOT_SENT, LocalPrinting(api, LocalConnector { throw IOException() }).print(ticket))
        assertEquals(0, api.claims)
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
