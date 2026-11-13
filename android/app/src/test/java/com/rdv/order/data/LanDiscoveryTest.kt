package com.rdv.order.data

import org.junit.Assert.*
import org.junit.Test
import java.net.*
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class LanDiscoveryTest {
    private val mac = "00:21:40:ff:2b:95"
    private fun reply(ip: InetAddress): ByteArray = ByteArray(34).apply {
        "XP0001FOUND".toByteArray().copyInto(this)
        byteArrayOf(0, 0x21, 0x40, 0xff.toByte(), 0x2b, 0x95.toByte()).copyInto(this, 11)
        ip.address.copyInto(this, 19)
    }
    @Test fun `reject wrong MAC truncated packet and address mismatch`() {
        val ip = InetAddress.getByName("127.0.0.2")
        val bytes = reply(ip)
        assertEquals(ip, LanDiscovery.response(DatagramPacket(bytes, bytes.size, ip, 9000), mac))
        assertNull(LanDiscovery.response(DatagramPacket(bytes, 10, ip, 9000), mac))
        assertNull(LanDiscovery.response(DatagramPacket(bytes, bytes.size, ip, 9000), "00:00:00:00:00:00"))
        assertNull(LanDiscovery.response(DatagramPacket(bytes, bytes.size, InetAddress.getLoopbackAddress(), 9000), mac))
    }
    @Test fun `lost first probe recovers and fresh sockets support consecutive tickets`() {
        val ip = InetAddress.getByName("127.0.0.1")
        val worker = Executors.newSingleThreadExecutor()
        try { DatagramSocket(InetSocketAddress(ip, 9000)).use { printer ->
            printer.soTimeout = 5000
            val received = worker.submit<Int> {
                var count = 0
                repeat(3) {
                    val request = DatagramPacket(ByteArray(100), 100); printer.receive(request)
                    assertEquals("XP0001FIND", String(request.data, 0, request.length))
                    if (++count > 1) { val bytes = reply(ip); printer.send(DatagramPacket(bytes, bytes.size, request.address, request.port)) }
                }; count
            }
            repeat(2) {
                DatagramSocket().use { client ->
                    assertEquals(ip, LanDiscovery.discover(client, listOf(ip), mac))
                }
            }
            assertEquals(3, received.get(6, TimeUnit.SECONDS).toInt())
        } } finally { worker.shutdownNow() }
    }
}
