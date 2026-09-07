package com.rdv.order.update

import com.rdv.order.data.RdvJson
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import kotlin.coroutines.coroutineContext

@Serializable data class AppRelease(val version: String, val versionCode: Int, val file: String, val bytes: Long, val sha256: String) {
    fun validated(): AppRelease = apply {
        require(version.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+")) && versionCode > 0)
        require(file == "/releases/rdv-order-$version.apk")
        require(bytes in 1..50L * 1024 * 1024 && sha256.matches(Regex("[a-f0-9]{64}")))
    }
    fun encode(): String = RdvJson.encodeToString(serializer(), this)
    companion object {
        fun parse(raw: String): AppRelease = RdvJson.decodeFromString<AppRelease>(raw).validated()
    }
}

/** Public distribution traffic only: no session headers, redirects or background polling. */
class UpdateClient(
    private val directory: File,
    private val origin: HttpUrl = "https://download.resortdejavu.cn/".toHttpUrl(),
    private val client: OkHttpClient = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .connectTimeout(5, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build(),
    private val verifyPackage: (File, AppRelease) -> Unit,
) {
    suspend fun latest(): AppRelease = withContext(Dispatchers.IO) {
        client.newCall(Request.Builder().url(origin.resolve("/release.json")!!).header("Cache-Control", "no-cache").build())
            .apply { timeout().timeout(2500, TimeUnit.MILLISECONDS) }.execute().use { response ->
                if (!response.isSuccessful) throw IOException("Version check failed")
                val source = response.body?.source() ?: throw IOException("Empty response")
                // Bound even chunked responses before allocating the manifest string.
                source.request(16_385)
                val raw = source.readByteArray(minOf(source.buffer.size, 16_385L))
                require(raw.size <= 16_384)
                AppRelease.parse(raw.toString(Charsets.UTF_8))
            }
    }

    suspend fun download(release: AppRelease, progress: (Int) -> Unit): File = withContext(Dispatchers.IO) {
        release.validated()
        check(directory.isDirectory || directory.mkdirs())
        val target = File(directory, "${release.versionCode}.apk")
        if (target.isFile && runCatching { verify(target, release) }.isSuccess) return@withContext target
        // Only updater-owned files; keep cache bounded to one APK and one partial download.
        directory.listFiles()?.forEach { it.delete() }
        if (directory.usableSpace < release.bytes * 2 + 5 * 1024 * 1024) throw IOException("Not enough space")
        val partial = File(directory, "download.part")
        try {
            client.newCall(Request.Builder().url(origin.resolve(release.file)!!).build())
                .apply { timeout().timeout(5, TimeUnit.MINUTES) }.execute().use { response ->
                    if (!response.isSuccessful) throw IOException("Download failed")
                    val body = response.body ?: throw IOException("Empty response")
                    require(body.contentLength() == -1L || body.contentLength() == release.bytes)
                    body.byteStream().use { input -> partial.outputStream().use { output ->
                        val buffer = ByteArray(16 * 1024)
                        var count = 0L
                        var lastPercent = -1
                        while (true) {
                            coroutineContext.ensureActive()
                            val n = input.read(buffer)
                            if (n == -1) break
                            count += n
                            require(count <= release.bytes)
                            output.write(buffer, 0, n)
                            val percent = (count * 100 / release.bytes).toInt()
                            if (percent != lastPercent) { progress(percent); lastPercent = percent }
                        }
                    } }
                }
            verify(partial, release)
            check(partial.renameTo(target))
            target
        } finally { partial.delete() }
    }

    fun verify(file: File, release: AppRelease) {
        require(file.length() == release.bytes)
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(16 * 1024)
            while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) }
        }
        require(digest.digest().joinToString("") { "%02x".format(it) } == release.sha256)
        verifyPackage(file, release)
    }
}
