package com.rdv.order

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import net.posprinter.POSConnect
import net.posprinter.IConnectListener
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.net.ServerSocket
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Isolated loopback fixture: exercises official SDK on Android, never hotel hardware. */
@RunWith(AndroidJUnit4::class)
class LocalPrinterSdkTest {
    @Test fun ethernetSdkSendsOneWholeTicketAndCloses() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        POSConnect.init(context)
        val paper = byteArrayOf(27, 64) + "RDV KITCHEN COPY\nTABLE TEST\n".toByteArray() + byteArrayOf(29, 86, 66, 0)
        val executor = Executors.newSingleThreadExecutor()
        ServerSocket(9100, 1, java.net.InetAddress.getByName("127.0.0.1")).use { listener ->
            val received = executor.submit<ByteArray> {
                listener.accept().use { socket -> socket.soTimeout = 5000; socket.getInputStream().readBytes() }
            }
            val printer = POSConnect.createDevice(POSConnect.DEVICE_TYPE_ETHERNET)
            try {
                assertTrue(printer.connectSync("127.0.0.1", IConnectListener { _, _, _ -> }))
                assertEquals(paper.size, printer.sendSync(paper))
            } finally { printer.closeSync() }
            assertArrayEquals(paper, received.get(6, TimeUnit.SECONDS))
        }
        executor.shutdownNow()
    }
}
