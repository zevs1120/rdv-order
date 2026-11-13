package com.rdv.order

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dalvik.system.DexClassLoader
import java.io.File
import java.lang.reflect.Modifier
import java.net.*
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Test
import org.junit.runner.RunWith

/** Actual minified APK with loopback-only printers; never connects to the hotel. */
@RunWith(AndroidJUnit4::class)
class ReleasePrinterDiscoveryTest {
    @Test fun releasedDiscoveryRecoversLostProbeAcrossConsecutiveTickets() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val assets = instrumentation.context.assets
        Assume.assumeTrue(assets.list("")!!.contains("printer-release.apk"))
        val context = instrumentation.targetContext
        val apk = File(context.codeCacheDir, "printer-release.apk")
        apk.delete()
        apk.outputStream().use { output -> apk.setReadOnly(); assets.open("printer-release.apk").use { it.copyTo(output) } }
        val symbols = JSONObject(assets.open("printer-symbols.json").bufferedReader().use { it.readText() })
        val loader = DexClassLoader(apk.path, context.codeCacheDir.path, null, Context::class.java.classLoader)
        val discovery = loader.loadClass(symbols.getString("discovery"))
        val discover = discovery.declaredMethods.first { it.name == symbols.getString("method") }
            .apply { isAccessible = true }
        val printerIp = InetAddress.getByName("127.0.0.2")
        val pool = Executors.newFixedThreadPool(2)
        try { DatagramSocket(InetSocketAddress(printerIp, 9000)).use { udp ->
            udp.soTimeout = 5000
            ServerSocket(9100, 2, printerIp).use { tcp ->
                tcp.soTimeout = 5000
                val probes = pool.submit<Int> {
                    var n = 0
                    repeat(3) {
                        val request = DatagramPacket(ByteArray(100), 100); udp.receive(request)
                        assertEquals("XP0001FIND", String(request.data, 0, request.length))
                        if (++n > 1) {
                            val reply = ByteArray(34)
                            "XP0001FOUND".toByteArray().copyInto(reply)
                            byteArrayOf(0, 0x21, 0x40, 0xff.toByte(), 0x2b, 0x95.toByte()).copyInto(reply, 11)
                            printerIp.address.copyInto(reply, 19)
                            udp.send(DatagramPacket(reply, reply.size, request.address, request.port))
                        }
                    }; n
                }
                repeat(2) {
                    val ip = DatagramSocket(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 9000)).use {
                        discover.invoke(null, *discover.parameterTypes.map { type -> when {
                            type == DatagramSocket::class.java -> it
                            type == String::class.java -> "00:21:40:ff:2b:95"
                            java.util.Collection::class.java.isAssignableFrom(type) -> arrayListOf(printerIp)
                            else -> error("Unexpected released discovery parameter: $type")
                        } }.toTypedArray()) as InetAddress
                    }
                    assertEquals(printerIp, ip)
                }
                assertEquals(3, probes.get(6, TimeUnit.SECONDS).toInt())
            }
        } } finally { pool.shutdownNow() }
    }
}
