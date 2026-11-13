package com.rdv.order.data

import java.io.IOException
import java.net.*
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** One discovery socket per attempt. No SDK receiver/timer survives into the next ticket. */
object LanDiscovery {
    fun response(packet: DatagramPacket, mac: String): InetAddress? {
        if (packet.length < 34) return null
        val b = packet.data.copyOfRange(packet.offset, packet.offset + packet.length)
        if (String(b, 0, 11, Charsets.US_ASCII) != "XP0001FOUND") return null
        val actual = b.sliceArray(11..16).joinToString(":") { "%02x".format(it.toInt() and 255) }
        if (!actual.equals(mac, true)) return null
        val ip = InetAddress.getByAddress(b.sliceArray(19..22))
        return ip.takeIf { it == packet.address && !it.isAnyLocalAddress && !it.isMulticastAddress }
    }
    fun discover(socket: DatagramSocket, targets: List<InetAddress>, mac: String): InetAddress {
        socket.broadcast = true
        val probe = "XP0001FIND".toByteArray(Charsets.US_ASCII)
        // Repeated discovery is safe: these packets contain no ticket bytes.
        repeat(4) {
            targets.forEach { address -> socket.send(DatagramPacket(probe, probe.size, address, 9000)) }
            val until = System.nanoTime() + 750_000_000L
            while (System.nanoTime() < until) {
                socket.soTimeout = ((until - System.nanoTime()) / 1_000_000).toInt().coerceAtLeast(1)
                val packet = DatagramPacket(ByteArray(1024), 1024)
                try { socket.receive(packet) } catch (_: SocketTimeoutException) { break }
                response(packet, mac)?.let { return it }
            }
        }
        throw LanConnectionException("discovery", "timeout")
    }
}

class LanConnectionException(val stage: String, val reason: String) : IOException("$stage: $reason")

/** TCP is opened on the same Android Network as discovery. Sending is never retried. */
class LanSocketConnection(private val socket: Socket) : LocalConnection {
    override fun send(bytes: ByteArray): Boolean {
        val deadline = timer.schedule({ runCatching { socket.close() } }, 5, TimeUnit.SECONDS)
        return try { socket.getOutputStream().write(bytes); socket.getOutputStream().flush(); true }
        finally { deadline.cancel(false) }
    }
    override fun close() = socket.close()
    companion object { private val timer = Executors.newSingleThreadScheduledExecutor() }
}
