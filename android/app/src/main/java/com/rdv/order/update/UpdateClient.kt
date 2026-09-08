package com.rdv.order.update

import com.rdv.order.data.RdvJson
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import kotlin.coroutines.coroutineContext

@Serializable data class ReleaseNotes(
    val zh: String = "修复已知问题，优化使用体验。",
    val en: String = "Bug fixes and experience improvements.",
) {
    fun validated(): ReleaseNotes = apply {
        require(zh.trim().length in 1..600 && en.trim().length in 1..600)
    }
}

@Serializable data class AppRelease(
    val version: String, val versionCode: Int, val file: String, val bytes: Long, val sha256: String,
    val notes: ReleaseNotes = ReleaseNotes(),
    val deltas: List<ApkDelta> = emptyList(),
) {
    fun validated(): AppRelease = apply {
        require(version.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+")) && versionCode > 0)
        require(file == "/releases/rdv-order-$version.apk")
        require(bytes in 1..50L * 1024 * 1024 && sha256.matches(Regex("[a-f0-9]{64}")))
        notes.validated()
        require(deltas.size <= 4)
        require(deltas.map { it.baseVersionCode }.distinct().size == deltas.size)
        deltas.forEach { it.validated(this) }
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
    private val installedApk: (() -> File)? = null,
    private val installedVersionCode: Int = 0,
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
        // Only updater-owned files; one complete APK plus bounded patch/partial files.
        directory.listFiles()?.forEach { it.delete() }
        if (directory.usableSpace < release.bytes * 2 + 5 * 1024 * 1024) throw IOException("Not enough space")
        val partial = File(directory, "download.part")
        val patch = File(directory, "delta.part")
        try {
            val delta = release.deltas.firstOrNull { it.baseVersionCode == installedVersionCode }
            val patched = if (delta != null && installedApk != null) {
                try {
                    val base = installedApk.invoke()
                    require(base.length() in 1..50L * 1024 * 1024 && sha256(base) == delta.baseSha256)
                    fetchFile(delta.file, delta.bytes, patch) { progress(it * 90 / 100) }
                    require(sha256(patch) == delta.sha256)
                    applyApkDelta(base, patch, partial, release, delta)
                    verify(partial, release)
                    true
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    // Missing/corrupt/inapplicable delta must never strand a mandatory update.
                    partial.delete()
                    false
                } finally { patch.delete() }
            } else false
            if (!patched) {
                fetchFile(release.file, release.bytes, partial) { progress(it * 90 / 100) }
                verify(partial, release)
            }
            check(partial.renameTo(target))
            progress(100)
            target
        } finally { partial.delete(); patch.delete() }
    }

    private suspend fun fetchFile(path: String, bytes: Long, partial: File, progress: (Int) -> Unit) {
            client.newCall(Request.Builder().url(origin.resolve(path)!!).build())
                .apply { timeout().timeout(5, TimeUnit.MINUTES) }.execute().use { response ->
                    if (!response.isSuccessful) throw IOException("Download failed")
                    val body = response.body ?: throw IOException("Empty response")
                    require(body.contentLength() == -1L || body.contentLength() == bytes)
                    body.byteStream().use { input -> partial.outputStream().use { output ->
                        val buffer = ByteArray(16 * 1024)
                        var count = 0L
                        var lastPercent = -1
                        while (true) {
                            coroutineContext.ensureActive()
                            val n = input.read(buffer)
                            if (n == -1) break
                            count += n
                            require(count <= bytes)
                            output.write(buffer, 0, n)
                            val percent = (count * 100 / bytes).toInt()
                            if (percent != lastPercent) { progress(percent); lastPercent = percent }
                        }
                        require(count == bytes)
                    } }
                }
    }

    fun verify(file: File, release: AppRelease) {
        require(file.length() == release.bytes)
        require(sha256(file) == release.sha256)
        verifyPackage(file, release)
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(16 * 1024)
            while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
