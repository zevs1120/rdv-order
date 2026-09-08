package com.rdv.order.update

import java.io.DataInputStream
import java.io.File
import java.io.RandomAccessFile
import java.util.zip.GZIPInputStream
import kotlinx.coroutines.ensureActive
import kotlin.coroutines.coroutineContext
import kotlinx.serialization.Serializable

@Serializable data class ApkDelta(
    val baseVersionCode: Int, val baseSha256: String,
    val file: String, val bytes: Long, val sha256: String,
    val format: String = "rdv-copy-add-v1",
) {
    fun validated(target: AppRelease): ApkDelta = apply {
        require(format == "rdv-copy-add-v1")
        require(baseVersionCode in 1 until target.versionCode)
        require(baseSha256.matches(Regex("[a-f0-9]{64}")) && sha256.matches(Regex("[a-f0-9]{64}")))
        require(file == "/releases/rdv-order-${target.version}-from-$baseVersionCode.rdvdelta")
        require(bytes in 1 until target.bytes)
    }
}

/** Rebuild the original signed APK; never execute patch content or modify the installed APK. */
internal suspend fun applyApkDelta(base: File, patch: File, output: File, release: AppRelease, delta: ApkDelta) {
    require(base.length() in 1..50L * 1024 * 1024)
    DataInputStream(GZIPInputStream(patch.inputStream().buffered())).use { input ->
        val magic = ByteArray(8).also { input.readFully(it) }
        require(magic.contentEquals("RDVDLT01".toByteArray(Charsets.US_ASCII)))
        require(input.readInt().toLong() == release.bytes)
        fun readHash() = ByteArray(32).also { input.readFully(it) }.joinToString("") { "%02x".format(it) }
        require(readHash() == delta.baseSha256 && readHash() == release.sha256)
        RandomAccessFile(base, "r").use { source -> output.outputStream().buffered().use { target ->
            val buffer = ByteArray(16 * 1024)
            var written = 0L
            var commands = 0
            while (true) {
                coroutineContext.ensureActive()
                val op = input.readUnsignedByte()
                if (op == 255) break
                require(++commands <= 1_000_000 && op in 0..1)
                val offset = if (op == 1) input.readInt().toLong() else 0L
                val length = input.readInt().toLong()
                require(length > 0 && length <= release.bytes - written)
                if (op == 1) {
                    require(length >= 64 && offset >= 0 && offset <= source.length() - length)
                    source.seek(offset)
                }
                var remaining = length
                while (remaining > 0) {
                    coroutineContext.ensureActive()
                    val n = minOf(buffer.size.toLong(), remaining).toInt()
                    if (op == 1) source.readFully(buffer, 0, n) else input.readFully(buffer, 0, n)
                    target.write(buffer, 0, n)
                    remaining -= n
                }
                written += length
            }
            require(written == release.bytes && input.read() == -1)
        } }
    }
}
