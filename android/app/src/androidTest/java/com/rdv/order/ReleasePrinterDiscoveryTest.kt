package com.rdv.order

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dalvik.system.DexClassLoader
import java.io.File
import java.lang.ref.WeakReference
import java.lang.reflect.Modifier
import java.lang.reflect.Proxy
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Test
import org.junit.runner.RunWith

/** Executes the actual minified, signed APK, not the unoptimized test variant.
 * Only loopback UDP/TCP fixtures are used. No API, hotel network or paper writes. */
@RunWith(AndroidJUnit4::class)
class ReleasePrinterDiscoveryTest {
    @Test fun releasedDiscoverySurvivesGcAndConnectsToMatchingMac() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val assets = instrumentation.context.assets
        Assume.assumeTrue("Run scripts/android/test-printer-release.sh", assets.list("")!!.contains("printer-release.apk"))
        val context = instrumentation.targetContext
        val apk = File(context.codeCacheDir, "printer-release.apk")
        apk.delete()
        apk.outputStream().use { output ->
            apk.setReadOnly() // Required for dynamically loaded code on Android 14+.
            assets.open("printer-release.apk").use { it.copyTo(output) }
        }
        val symbols = JSONObject(assets.open("printer-symbols.json").bufferedReader().use { it.readText() })
        // A boot-only parent prevents the debug APK from shadowing any release code.
        val loader = DexClassLoader(apk.path, context.codeCacheDir.path, null, Context::class.java.classLoader)
        fun type(name: String) = loader.loadClass(symbols.getString(name))
        val connectorClass = type("connector")
        val connector = connectorClass.getConstructor(Context::class.java).newInstance(context)
        val continuationClass = type("continuation")
        val emptyClass = type("emptyContext")
        val empty = emptyClass.declaredFields.first { Modifier.isStatic(it.modifiers) && it.type == emptyClass }
            .apply { isAccessible = true }.get(null)
        val result = LinkedBlockingQueue<Any>()
        val continuation = Proxy.newProxyInstance(loader, arrayOf(continuationClass)) { _, method, args ->
            if (method.parameterCount == 0) empty else { result.offer(args!![0]); null }
        }
        // R8 narrows suspend parameters to ContinuationImpl in the real release.
        // Use its existing state machine and attach our completion/context.
        fun newContinuation(): Any {
            val wrapperClass = type("connectContinuation")
            val wrapper = wrapperClass.declaredConstructors.first().apply { isAccessible = true }
                .newInstance(connector, null)
            val fields = generateSequence(wrapperClass.superclass) { it.superclass }
                .flatMap { it.declaredFields.asSequence() }.filterNot { Modifier.isStatic(it.modifiers) }.toList()
            fields.last { it.type == continuationClass }.apply { isAccessible = true }.set(wrapper, continuation)
            fields.first { it.type.isInterface && it.type.isInstance(empty) }
                .apply { isAccessible = true }.set(wrapper, empty)
            wrapperClass.declaredFields.first { it.type == Int::class.javaPrimitiveType }
                .apply { isAccessible = true }.setInt(wrapper, Int.MIN_VALUE)
            return wrapper
        }
        val connect = connectorClass.declaredMethods.first {
            it.parameterCount == 2 && it.parameterTypes[0] == String::class.java
        }.apply { isAccessible = true }
        val discovery = connectorClass.declaredFields.first { it.type.name == "net.posprinter.esc.PosUdpNet" }
            .apply { isAccessible = true }.get(connector)
        val weakCallback = discovery.javaClass.getDeclaredField("udpCallback").apply { isAccessible = true }
        val loopback = InetAddress.getByName("127.0.0.1")
        try {
            ServerSocket(9100, 1, loopback).use { server ->
                server.soTimeout = 5000
                repeat(2) {
                    instrumentation.runOnMainSync { connect.invoke(connector, "00:21:40:ff:2b:95", newContinuation()) }
                    repeat(4) { Runtime.getRuntime().gc(); System.runFinalization(); Thread.sleep(50) }
                    assertNotNull("Release build lost the SDK discovery callback during GC",
                        (weakCallback.get(discovery) as WeakReference<*>).get())
                    val reply = ByteArray(34)
                    "XP0001FOUND".toByteArray().copyInto(reply)
                    byteArrayOf(0, 0x21, 0x40, 0xff.toByte(), 0x2b, 0x95.toByte()).copyInto(reply, 11)
                    byteArrayOf(127, 0, 0, 1).copyInto(reply, 19)
                    DatagramSocket().use { it.send(DatagramPacket(reply, reply.size, loopback, 9000)) }
                    val connection = result.poll(6, TimeUnit.SECONDS)
                    assertNotNull("No connection result from release SDK", connection)
                    // A Kotlin Result failure has no close method; success implements Closeable.
                    assertTrue("Released connect failed: $connection", connection is java.io.Closeable)
                    server.accept().use { (connection as java.io.Closeable).close() }
                }
            }
        } finally {
            instrumentation.runOnMainSync { discovery.javaClass.getMethod("closeNetSocket").invoke(discovery) }
        }
    }
}
