package com.rdv.order.data

import android.content.Context
import java.io.Closeable
import java.util.Base64
import java.util.UUID
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

@Serializable data class LocalTicket(val id: String, val status: String, val mac: String)
enum class LocalPrintResult { SENT, NOT_SENT, UNKNOWN }
interface LocalConnection : Closeable { fun send(bytes: ByteArray): Boolean }
fun interface LocalConnector { suspend fun connect(mac: String): LocalConnection }

/** Select the local network explicitly, even when Android uses cellular for Internet. */
class XprinterLocalConnector(context: Context) : LocalConnector {
    private val connectivity = context.applicationContext.getSystemService(android.net.ConnectivityManager::class.java)
    override suspend fun connect(mac: String): LocalConnection = withContext(Dispatchers.IO) {
        val network = connectivity.allNetworks.firstOrNull { network ->
            connectivity.getNetworkCapabilities(network)?.let {
                it.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) &&
                    !it.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN)
            } == true
        } ?: connectivity.allNetworks.firstOrNull { network ->
            connectivity.getNetworkCapabilities(network)?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET) == true
        } ?: throw LanConnectionException("network", "no_local_network")
        val links = connectivity.getLinkProperties(network)
            ?: throw LanConnectionException("network", "network_lost")
        val broadcasts = links.linkAddresses.filter { it.address is java.net.Inet4Address && it.prefixLength in 1..30 }.map {
            val address = it.address.address
            val hostMask = -1 ushr it.prefixLength
            val value = address.fold(0) { acc, byte -> (acc shl 8) or (byte.toInt() and 255) } or hostMask
            java.net.InetAddress.getByAddress(byteArrayOf((value ushr 24).toByte(), (value ushr 16).toByte(), (value ushr 8).toByte(), value.toByte()))
        }.distinct() + java.net.InetAddress.getByName("255.255.255.255")
        var stage = "discovery"
        try {
            val ip = java.net.DatagramSocket(null).use { socket ->
                // Bind before connecting; never change the process-wide Internet route.
                network.bindSocket(socket)
                socket.reuseAddress = false
                socket.bind(java.net.InetSocketAddress(9000))
                LanDiscovery.discover(socket, broadcasts, mac)
            }
            currentCoroutineContext().ensureActive()
            stage = "tcp_connect"
            val socket = network.socketFactory.createSocket()
            try {
                socket.connect(java.net.InetSocketAddress(ip, 9100), 2500)
                currentCoroutineContext().ensureActive()
                LanSocketConnection(socket)
            } catch (error: Exception) { socket.close(); throw error }
        } catch (error: Exception) {
            currentCoroutineContext().ensureActive()
            if (error is LanConnectionException) throw error
            throw LanConnectionException(stage, when (error) {
                is java.net.BindException -> "port_busy"
                is java.net.SocketTimeoutException -> "timeout"
                is java.net.ConnectException -> "refused"
                else -> "network_io"
            })
        }
    }
}

class LocalPrinting(private val api: Transport, private val connector: LocalConnector) {
    private val mutex = Mutex()
    private suspend fun connectUnsent(ticket: LocalTicket): LocalConnection? {
        // Connection attempts send no ticket bytes and hold no server claim.
        // A missed discovery response/failed TCP handshake can safely reconnect.
        repeat(2) { attempt ->
            try { return connector.connect(ticket.mac) } catch (error: Exception) {
                currentCoroutineContext().ensureActive()
                if (attempt == 0) delay(250)
                else if (error is LanConnectionException) runCatching {
                    api.request("/api/print/local", "POST", jsonBody("action" to "diagnostic", "id" to ticket.id,
                        "stage" to error.stage, "reason" to error.reason), timeoutMs = 2_000, retries = 0)
                }
            }
        }
        return null
    }
    suspend fun print(ticket: LocalTicket): LocalPrintResult = mutex.withLock {
        if (ticket.status in setOf("accepted", "completed")) return@withLock LocalPrintResult.SENT
        if (ticket.status != "queued") return@withLock LocalPrintResult.UNKNOWN
        // Keep the order saved and retryable when discovery/connection fails:
        // no claim or paper bytes have been sent at this point.
        val connection = connectUnsent(ticket) ?: return@withLock LocalPrintResult.NOT_SENT
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
