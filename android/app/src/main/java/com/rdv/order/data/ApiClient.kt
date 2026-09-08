package com.rdv.order.data

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ApiException(val status: Int, message: String) : IOException(message)
data class ApiResponse(val text: String, val contentType: String?, val filename: String?)

interface Transport {
    suspend fun request(path: String, method: String = "GET", body: JsonElement? = null,
        query: Map<String, String> = emptyMap(), idempotencyKey: String? = null,
        timeoutMs: Long = 5_500, retries: Int = if (method == "GET") 1 else 0,
        authenticated: Boolean = true): ApiResponse
}

class ApiClient(
    private val origin: () -> String,
    private val token: () -> String,
    private val allowLocalHttp: Boolean = false,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).build(),
    private val connection: (() -> ConnectionMonitor)? = null,
) : Transport {
    override suspend fun request(path: String, method: String, body: JsonElement?, query: Map<String, String>,
        idempotencyKey: String?, timeoutMs: Long, retries: Int, authenticated: Boolean): ApiResponse {
        val base = validateOrigin(origin(), allowLocalHttp).toHttpUrl()
        require(path.startsWith("/api/") && !path.contains("..")) { "Invalid API path" }
        val url = base.newBuilder().encodedPath(path).apply { query.forEach { (k, v) -> addQueryParameter(k, v) } }.build()
        val request = Request.Builder().url(url).apply {
            header("Accept", "application/json, text/csv")
            if (authenticated && token().isNotEmpty()) header("Authorization", "Bearer ${token()}")
            if (idempotencyKey != null) header("X-Idempotency-Key", idempotencyKey)
            val payload = if (method in setOf("POST", "PATCH", "PUT"))
                (body ?: JsonObject(emptyMap())).toString().toRequestBody("application/json; charset=utf-8".toMediaType()) else null
            method(method, payload)
        }.build()
        for (attempt in 0..retries) {
            val monitor = connection?.invoke()
            val sequence = monitor?.beginRequest()
            try {
                val call = client.newCall(request).apply { timeout().timeout(timeoutMs, TimeUnit.MILLISECONDS) }
                val incoming = call.await()
                sequence?.let { monitor?.responded(it) }
                return incoming.use { response -> withContext(Dispatchers.IO) {
                    val text = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        val error = runCatching { RdvJson.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.content }.getOrNull()
                        throw ApiException(response.code, error ?: "请求失败 (${response.code})")
                    }
                    ApiResponse(text, response.header("Content-Type"), response.header("Content-Disposition")
                        ?.let { Regex("filename=\"?([^\";]+)").find(it)?.groupValues?.get(1) })
                } }
            } catch (error: IOException) {
                currentCoroutineContext().ensureActive()
                if (error !is ApiException) sequence?.let { monitor?.failed(it) }
                // Never replay a validation/auth failure. Write retry behavior is explicit at each call site.
                val retryable = error !is ApiException || error.status == 408 || error.status == 429 || error.status >= 500
                if (attempt == retries || !retryable) throw error
                delay(220L * (attempt + 1))
            }
        }
        error("Unreachable")
    }
    suspend fun checkConnectivity() {
        val url = validateOrigin(origin(), allowLocalHttp).toHttpUrl().newBuilder().encodedPath("/api/connectivity").build()
        val request = Request.Builder().url(url).header("Cache-Control", "no-store").get().build()
        client.newCall(request).apply { timeout().timeout(4500, TimeUnit.MILLISECONDS) }.await().use { response ->
            withContext(Dispatchers.IO) {
                if (!response.isSuccessful || RdvJson.parseToJsonElement(response.body?.string().orEmpty())
                        .jsonObject["service"]?.jsonPrimitive?.content != "rdv-order") throw IOException("Unreachable")
            }
        }
    }
    companion object {
        fun validateOrigin(value: String, allowLocalHttp: Boolean = false): String {
            require(value.isNotBlank()) { "尚未配置门店地址" }
            val url = value.trim().toHttpUrl()
            val local = url.host in setOf("localhost", "127.0.0.1", "10.0.2.2")
            require(url.scheme == "https" || (allowLocalHttp && local)) { "门店地址必须使用 HTTPS" }
            require(url.username.isEmpty() && url.password.isEmpty() && url.query == null && url.fragment == null && url.encodedPath == "/") {
                "请填写门店网址，不要附加页面路径"
            }
            return url.toString().trimEnd('/')
        }
    }
}

private suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) { if (!continuation.isCancelled) continuation.resumeWithException(e) }
        override fun onResponse(call: Call, response: Response) {
            continuation.resume(response) { _, value, _ -> value.close() }
        }
    })
}

fun jsonBody(vararg values: Pair<String, Any?>): JsonObject = buildJsonObject {
    values.forEach { (key, value) -> put(key, when (value) {
        null -> JsonNull
        is JsonElement -> value
        is Boolean -> JsonPrimitive(value)
        is Number -> JsonPrimitive(value)
        else -> JsonPrimitive(value.toString())
    }) }
}
fun JsonObject.text(key: String, fallback: String = "") = this[key]?.jsonPrimitive?.contentOrNull ?: fallback
fun JsonObject.number(key: String) = this[key]?.jsonPrimitive?.doubleOrNull ?: 0.0
fun JsonObject.flag(key: String) = this[key]?.jsonPrimitive?.booleanOrNull ?: false
fun JsonObject.rows(key: String) = (this[key] as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
