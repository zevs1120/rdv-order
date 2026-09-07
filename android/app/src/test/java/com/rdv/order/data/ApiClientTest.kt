package com.rdv.order.data

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.*
import org.junit.Assert.*

class ApiClientTest {
    private lateinit var server: MockWebServer
    private lateinit var client: ApiClient
    @Before fun setup() {
        server = MockWebServer(); server.start()
        client = ApiClient({ server.url("/").toString() }, { "session-token" }, allowLocalHttp = true)
    }
    @After fun tearDown() { server.shutdown() }
    @Test fun `authenticated JSON requests preserve wire keys and immutable idempotency header`() = runBlocking {
        server.enqueue(MockResponse().setBody("{\"orderId\":\"saved\"}"))
        client.request("/api/orders", "POST", jsonBody("tableNo" to "01+04", "guestCount" to 2), idempotencyKey = "original-request-key", retries = 0)
        val request = server.takeRequest()
        assertEquals("Bearer session-token", request.getHeader("Authorization"))
        assertEquals("original-request-key", request.getHeader("X-Idempotency-Key"))
        assertEquals("{\"tableNo\":\"01+04\",\"guestCount\":2}", request.body.readUtf8())
    }
    @Test fun `GET queries encode a merged table plus without changing its meaning`() = runBlocking {
        server.enqueue(MockResponse().setBody("{}"))
        client.request("/api/tables/bill", query = mapOf("tableNo" to "01+04"))
        assertEquals("01+04", server.takeRequest().requestUrl!!.queryParameter("tableNo"))
    }
    @Test fun `login does not send an existing bearer token`() = runBlocking {
        server.enqueue(MockResponse().setBody("{}"))
        client.request("/api/login", "POST", jsonBody("username" to "test", "pin" to "test-only"), authenticated = false)
        assertNull(server.takeRequest().getHeader("Authorization"))
    }
    @Test fun `POST server failure is not retried automatically`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(500).setBody("{\"error\":\"提交失败\"}"))
        val error = runCatching { client.request("/api/orders", "POST", jsonBody("tableNo" to "01")) }.exceptionOrNull()
        assertTrue(error is ApiException)
        assertEquals("提交失败", error!!.message)
        assertEquals(1, server.requestCount)
    }
    @Test fun `GET retries a transient server failure but never an auth rejection`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(503)); server.enqueue(MockResponse().setBody("{\"tables\":[]}"))
        assertEquals("{\"tables\":[]}", client.request("/api/tables", retries = 1).text)
        assertEquals(2, server.requestCount)
        server.enqueue(MockResponse().setResponseCode(401).setBody("{\"error\":\"未登录\"}"))
        assertEquals(401, (runCatching { client.request("/api/tables", retries = 2) }.exceptionOrNull() as ApiException).status)
        assertEquals(3, server.requestCount)
    }
    @Test fun `redirects cannot forward credentials to another origin`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(302).addHeader("Location", "https://example.com/api/orders"))
        assertEquals(302, (runCatching { client.request("/api/orders") }.exceptionOrNull() as ApiException).status)
        assertEquals(1, server.requestCount)
    }
    @Test fun `response body timeout reports failure with no write replay`() = runBlocking {
        server.enqueue(MockResponse().setBody("{\"orderId\":\"saved\"}").setBodyDelay(1, TimeUnit.SECONDS))
        assertTrue(runCatching { client.request("/api/orders", "POST", timeoutMs = 100) }.exceptionOrNull() is IOException)
        assertEquals(1, server.requestCount)
    }
    @Test fun `production origin validation rejects cleartext credentials query and paths`() {
        listOf("http://example.com", "https://user:pin@example.com", "https://example.com/order", "https://example.com?token=x", "https://example.com/#token", "").forEach {
            assertTrue("must reject $it", runCatching { ApiClient.validateOrigin(it) }.isFailure)
        }
        assertEquals("https://orders.example.com", ApiClient.validateOrigin("https://orders.example.com/"))
    }
}
