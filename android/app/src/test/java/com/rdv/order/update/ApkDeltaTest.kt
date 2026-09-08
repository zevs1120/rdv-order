package com.rdv.order.update

import com.rdv.order.data.RdvJson
import java.io.File
import java.util.Base64
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.*
import org.junit.Assert.*
import org.junit.rules.TemporaryFolder

class ApkDeltaTest {
    @get:Rule val temporary = TemporaryFolder()
    private val fixture = RdvJson.parseToJsonElement(javaClass.getResource("/delta-fixture.json")!!.readText()).jsonObject
    private fun value(key: String) = fixture.getValue(key).jsonPrimitive.content
    private fun bytes(key: String) = Base64.getDecoder().decode(value(key))
    private val delta = ApkDelta(8, value("baseHash"), "/releases/rdv-order-1.1.0-from-8.rdvdelta", bytes("patch").size.toLong(), value("patchHash"))
    private val release = AppRelease("1.1.0", 9, "/releases/rdv-order-1.1.0.apk", bytes("target").size.toLong(), value("targetHash"), deltas = listOf(delta))

    @Test fun nodeGeneratedDeltaRebuildsExactApkWithoutFullDownload() = runBlocking {
        MockWebServer().use { server ->
            val base = temporary.newFile().apply { writeBytes(bytes("base")) }
            server.enqueue(MockResponse().setBody(Buffer().write(bytes("patch"))))
            var verified = 0
            val client = UpdateClient(temporary.newFolder(), server.url("/"), installedApk = { base }, installedVersionCode = 8,
                verifyPackage = { _, _ -> verified++ })
            assertArrayEquals(bytes("target"), client.download(release) {}.readBytes())
            assertEquals(1, verified)
            assertEquals(delta.file, server.takeRequest().path)
            assertEquals(1, server.requestCount)
        }
    }

    @Test fun corruptPatchFallsBackToVerifiedFullApkAndCleansTemporaryFiles() = runBlocking {
        MockWebServer().use { server ->
            val base = temporary.newFile().apply { writeBytes(bytes("base")) }
            val folder = temporary.newFolder()
            server.enqueue(MockResponse().setBody(Buffer().write(ByteArray(bytes("patch").size))))
            server.enqueue(MockResponse().setBody(Buffer().write(bytes("target"))))
            val client = UpdateClient(folder, server.url("/"), installedApk = { base }, installedVersionCode = 8, verifyPackage = { _, _ -> })
            assertArrayEquals(bytes("target"), client.download(release) {}.readBytes())
            assertEquals(delta.file, server.takeRequest().path)
            assertEquals(release.file, server.takeRequest().path)
            assertEquals(listOf("9.apk"), folder.list()!!.toList())
        }
    }

    @Test fun wrongInstalledBaseSkipsPatchAndInvalidMetadataIsRejected() = runBlocking {
        MockWebServer().use { server ->
            val base = temporary.newFile().apply { writeText("different signed APK") }
            server.enqueue(MockResponse().setBody(Buffer().write(bytes("target"))))
            val client = UpdateClient(temporary.newFolder(), server.url("/"), installedApk = { base }, installedVersionCode = 8, verifyPackage = { _, _ -> })
            assertArrayEquals(bytes("target"), client.download(release) {}.readBytes())
            assertEquals(release.file, server.takeRequest().path)
            for (bad in listOf(delta.copy(file = "/elsewhere"), delta.copy(bytes = release.bytes), delta.copy(baseVersionCode = 9))) {
                assertTrue(runCatching { release.copy(deltas = listOf(bad)).validated() }.isFailure)
            }
        }
    }
}
