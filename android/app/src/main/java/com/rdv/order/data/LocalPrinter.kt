package com.rdv.order.data

import android.content.Context
import java.io.Closeable
import java.util.Base64
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import net.posprinter.IConnectListener
import net.posprinter.IDeviceConnection
import net.posprinter.POSConnect
import net.posprinter.esc.PosUdpNet
import net.posprinter.posprinterface.UdpCallback

@Serializable data class LocalTicket(val id: String, val status: String, val mac: String)
enum class LocalPrintResult { SENT, NOT_SENT, UNKNOWN }
interface LocalConnection : Closeable { fun send(bytes: ByteArray): Boolean }
fun interface LocalConnector { suspend fun connect(mac: String): LocalConnection }

/** The same official discovery + Ethernet connection used by PrinterDemo.
 * Resolve by MAC every time; DHCP changes cannot redirect a bill to another host. */
class XprinterLocalConnector(context: Context) : LocalConnector {
    init { POSConnect.init(context.applicationContext) }
    private val discovery = PosUdpNet()
    // Kept by proguard-rules.pro: this strong owner is required even though
    // application code never reads it (the SDK reads its own WeakReference).
    private var discoveryCallback: UdpCallback? = null
    override suspend fun connect(mac: String): LocalConnection {
        val found = CompletableDeferred<String>()
        val callback = UdpCallback { device ->
            if (device.macStr.equals(mac, ignoreCase = true)) found.complete(device.ipStr)
        }
        discoveryCallback = callback // SDK holds only a WeakReference.
        val ip = try {
            discovery.searchNetDevice(callback)
            withTimeout(5_000) { found.await() }
        } finally { discoveryCallback = null }
        return withContext(Dispatchers.IO) {
            val connection = POSConnect.createDevice(POSConnect.DEVICE_TYPE_ETHERNET)
            try {
                check(connection.connectSync(ip, IConnectListener { _, _, _ -> })) { "Printer unavailable" }
                SdkConnection(connection)
            } catch (error: Exception) { connection.closeSync(); throw error }
        }
    }
    private class SdkConnection(private val connection: IDeviceConnection) : LocalConnection {
        override fun send(bytes: ByteArray): Boolean {
            // One synchronous send. Closing the socket bounds a blocked write;
            // neither timeout nor partial write is retried.
            val deadline = timer.schedule({ connection.closeSync() }, 5, TimeUnit.SECONDS)
            return try { connection.sendSync(bytes) == bytes.size } finally { deadline.cancel(false) }
        }
        override fun close() = connection.closeSync()
    }
    companion object { private val timer = Executors.newSingleThreadScheduledExecutor() }
}

class LocalPrinting(private val api: Transport, private val connector: LocalConnector) {
    private val mutex = Mutex()
    private suspend fun connectUnsent(mac: String): LocalConnection? {
        // Connection attempts send no ticket bytes and hold no server claim.
        // A missed discovery response/failed TCP handshake can safely reconnect.
        repeat(2) { attempt ->
            try { return connector.connect(mac) } catch (error: Exception) {
                currentCoroutineContext().ensureActive()
                if (attempt == 0) delay(250)
            }
        }
        return null
    }
    suspend fun print(ticket: LocalTicket): LocalPrintResult = mutex.withLock {
        if (ticket.status in setOf("accepted", "completed")) return@withLock LocalPrintResult.SENT
        if (ticket.status != "queued") return@withLock LocalPrintResult.UNKNOWN
        // Keep the order saved and retryable when discovery/connection fails:
        // no claim or paper bytes have been sent at this point.
        val connection = connectUnsent(ticket.mac) ?: return@withLock LocalPrintResult.NOT_SENT
        val claimToken = UUID.randomUUID().toString()
        var reportToken: String? = null
        var reportStatus: String? = null
        try {
            var claim: JsonObject? = null
            var started = 0L
            // Busy means another phone owns the printer, and no bytes were sent.
            for (attempt in 0..12) {
                started = System.nanoTime()
                val reply = RdvJson.parseToJsonElement(api.request("/api/print/local", "POST",
                    jsonBody("action" to "claim", "id" to ticket.id, "claimToken" to claimToken), timeoutMs = 5_000, retries = 1).text).jsonObject
                if (reply.text("status") != "busy") { claim = reply; break }
                delay(500)
            }
            val grant = claim ?: return@withLock LocalPrintResult.NOT_SENT
            if (!grant.flag("granted")) return@withLock if (grant.text("status") in setOf("accepted", "completed"))
                LocalPrintResult.SENT else LocalPrintResult.UNKNOWN
            // A delayed response must not outlive the server's 30-second guard.
            if (System.nanoTime() - started > 15_000_000_000L) return@withLock LocalPrintResult.UNKNOWN
            // Finish and record this one bounded send even if the screen is left.
            withContext(NonCancellable + Dispatchers.IO) {
                if (System.nanoTime() - started > 15_000_000_000L) return@withContext LocalPrintResult.UNKNOWN
                val status = try {
                    if (connection.send(Base64.getDecoder().decode(grant.text("content")))) "accepted" else "unknown"
                } catch (_: Exception) { "unknown" }
                reportToken = grant.text("token")
                reportStatus = status
                if (status == "accepted") LocalPrintResult.SENT else LocalPrintResult.UNKNOWN
            }
        } catch (error: Exception) {
            currentCoroutineContext().ensureActive(); LocalPrintResult.UNKNOWN
        } finally { withContext(NonCancellable + Dispatchers.IO) {
            // Release the printer before waiting for the bookkeeping request.
            // Retrying this idempotent report never sends paper again.
            runCatching { connection.close() }
            if (reportStatus != null) runCatching { api.request("/api/print/local", "POST", jsonBody("action" to "report",
                "id" to ticket.id, "token" to reportToken, "status" to reportStatus), timeoutMs = 4_000, retries = 1) }
        } }
    }
}
