package com.rdv.order

import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.rdv.order.data.XprinterLocalConnector
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.net.*
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Isolated emulator only: its own Wi-Fi address is the fixture printer. */
@RunWith(AndroidJUnit4::class)
class LanNetworkTest {
    @Test fun wifiBoundDiscoveryAndTcpWorkForConsecutiveTickets() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val cm = context.getSystemService(ConnectivityManager::class.java)
        val network = cm.allNetworks.first { cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true }
        val ip = cm.getLinkProperties(network)!!.linkAddresses.first { it.address is Inet4Address }.address
        val pool = Executors.newScheduledThreadPool(2)
        val connector = XprinterLocalConnector(context)
        try { ServerSocket(9100, 2, ip).use { tcp ->
            tcp.soTimeout = 7000
            DatagramSocket().use { sender ->
                network.bindSocket(sender)
                val reply = ByteArray(34)
                "XP0001FOUND".toByteArray().copyInto(reply)
                byteArrayOf(0, 0x21, 0x40, 0xff.toByte(), 0x2b, 0x95.toByte()).copyInto(reply, 11)
                ip.address.copyInto(reply, 19)
                val responder = pool.scheduleAtFixedRate({ sender.send(DatagramPacket(reply, reply.size, ip, 9000)) }, 150, 150, TimeUnit.MILLISECONDS)
                try {
                    val papers = pool.submit<List<String>> { List(2) { tcp.accept().use { it.soTimeout = 5000; String(it.getInputStream().readBytes()) } } }
                    repeat(2) { index -> connector.connect("00:21:40:ff:2b:95").use { assertTrue(it.send("NETWORK-$index".toByteArray())) } }
                    assertEquals(listOf("NETWORK-0", "NETWORK-1"), papers.get(7, TimeUnit.SECONDS))
                } finally { responder.cancel(true) }
            }
        } } finally { pool.shutdownNow() }
    }
}
