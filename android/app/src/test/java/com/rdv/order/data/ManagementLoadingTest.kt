package com.rdv.order.data

import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.*
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.*
import org.junit.Test

class ManagementLoadingTest {
    @Test fun `management starts all independent reads before awaiting any one`() = runBlocking {
        val started = CopyOnWriteArrayList<String>()
        val release = CompletableDeferred<Unit>()
        val transport = object : Transport {
            override suspend fun request(path: String, method: String, body: JsonElement?, query: Map<String, String>,
                idempotencyKey: String?, timeoutMs: Long, retries: Int, authenticated: Boolean): ApiResponse {
                assertEquals("GET", method)
                started += path
                release.await()
                return ApiResponse("{\"source\":\"$path\"}", "application/json", null)
            }
        }
        val store = object : KeyValueStore {
            override fun get(key: String): String? = null
            override fun put(key: String, value: String) = error("Read-only load must not write")
            override fun remove(key: String) = error("Read-only load must not remove")
        }
        val repo = RdvRepository(transport, store, { "https://test.invalid" })
        val load = async { repo.management("/api/items", related = linkedMapOf("majorData" to "/api/major", "subData" to "/api/sub")) }
        withTimeout(2_000) { while (started.size < 3) yield() }
        assertEquals(setOf("/api/items", "/api/major", "/api/sub"), started.toSet())
        release.complete(Unit)
        val result = load.await()
        assertEquals("/api/items", result.text("source"))
        assertEquals(setOf("source", "majorData", "subData"), result.keys)
    }
}
