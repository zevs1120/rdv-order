package com.rdv.order.update

import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.*
import org.junit.Assert.*
import org.junit.rules.TemporaryFolder

@OptIn(ExperimentalCoroutinesApi::class)
class UpdateTest {
    @get:Rule val temporary = TemporaryFolder()
    private val payload = "test-apk"
    private val release = AppRelease("0.1.4", 5, "/releases/rdv-order-0.1.4.apk", payload.length.toLong(),
        MessageDigest.getInstance("SHA-256").digest(payload.toByteArray()).joinToString("") { "%02x".format(it) })

    @Test fun manifestsRejectUntrustedPathsInvalidHashesAndUnboundedDownloads() {
        listOf(release.copy(file = "https://elsewhere.invalid/app.apk"), release.copy(file = "/releases/../app.apk"),
            release.copy(versionCode = 0), release.copy(bytes = 0), release.copy(bytes = 51L * 1024 * 1024),
            release.copy(sha256 = "bad"), release.copy(version = "../1")).forEach {
            assertTrue(runCatching { it.validated() }.isFailure)
        }
    }

    @Test fun chunkedManifestAllowsExistingExtraFieldsAndDoesNotSendCredentials() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setChunkedBody(release.encode().dropLast(1) + ",\"name\":\"RDV Order\"}", 7))
            val client = UpdateClient(temporary.newFolder(), server.url("/"), verifyPackage = { _, _ -> })
            assertEquals(release, client.latest())
            val request = server.takeRequest()
            assertEquals("/release.json", request.path)
            assertNull(request.getHeader("Authorization"))
            assertNull(request.getHeader("Cookie"))
        }
    }

    @Test fun rejectsOversizedManifestAndRedirect() = runBlocking {
        MockWebServer().use { server ->
            val client = UpdateClient(temporary.newFolder(), server.url("/"), verifyPackage = { _, _ -> })
            server.enqueue(MockResponse().setBody(" ".repeat(20_000)))
            assertTrue(runCatching { client.latest() }.isFailure)
            server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", server.url("/other")))
            assertTrue(runCatching { client.latest() }.isFailure)
            assertEquals(2, server.requestCount)
        }
    }

    @Test fun downloadVerifiesAndReusesCompleteApkWithoutAnotherRequest() = runBlocking {
        MockWebServer().use { server ->
            var verifications = 0
            val client = UpdateClient(temporary.newFolder(), server.url("/"), verifyPackage = { _, _ -> verifications++ })
            server.enqueue(MockResponse().setBody(payload))
            val progress = mutableListOf<Int>()
            val file = client.download(release, progress::add)
            assertEquals(payload, file.readText())
            assertEquals(100, progress.last())
            assertEquals(file, client.download(release) {})
            assertEquals(1, server.requestCount)
            assertEquals(2, verifications)
        }
    }

    @Test fun badChecksumSizeOrSignatureNeverLeavesAnInstallableDownload() = runBlocking {
        MockWebServer().use { server ->
            for (body in listOf("bad-hash", "short", "too-long-apk", payload)) {
                val folder = temporary.newFolder()
                val client = UpdateClient(folder, server.url("/"), verifyPackage = { _, _ -> error("Wrong signing certificate") })
                server.enqueue(MockResponse().setChunkedBody(body, 2))
                assertTrue(runCatching { client.download(release) {} }.isFailure)
                assertTrue(folder.listFiles()!!.isEmpty())
            }
        }
    }

    @Test fun damagedCachedApkIsDownloadedAgainAndPartialFileIsRemoved() = runBlocking {
        MockWebServer().use { server ->
            val folder = temporary.newFolder()
            File(folder, "5.apk").writeText("broken")
            File(folder, "download.part").writeText("partial")
            server.enqueue(MockResponse().setBody(payload))
            val client = UpdateClient(folder, server.url("/"), verifyPackage = { _, _ -> })
            assertEquals(payload, client.download(release) {}.readText())
            assertEquals(listOf("5.apk"), folder.list()!!.toList())
        }
    }

    @Test fun coldStartChecksOnlyOnceAndEveryNewerVersionBlocks() = runTest {
        var calls = 0
        var saved: String? = null
        val controller = UpdateController(4, backgroundScope, { calls++; release }, { _, _ -> error("Not downloading") }, { null }, { saved = it })
        controller.start()
        waitForCheck(controller)
        controller.start()
        assertEquals(1, calls)
        assertEquals(release, controller.state.value.release)
        assertEquals(release, AppRelease.parse(saved!!))
    }

    @Test fun equalAndOlderVersionsDoNotBlockAndClearSatisfiedRequirement() = runTest {
        for (version in listOf(5, 6)) {
            var saved: String? = "unchanged"
            val controller = UpdateController(version, backgroundScope, { release }, { _, _ -> error("Not downloading") }, { release.encode() }, { saved = it })
            controller.start(); waitForCheck(controller)
            assertNull(controller.state.value.release)
            assertNull(saved)
        }
    }

    @Test fun networkFailureAllowsUseOnlyWhenNoNewerVersionWasConfirmed() = runTest {
        for (known in listOf(null, release.encode())) {
            val controller = UpdateController(4, backgroundScope, { error("Offline") }, { _, _ -> error("Not downloading") }, { known }, {})
            controller.start(); waitForCheck(controller)
            assertEquals(if (known == null) null else release, controller.state.value.release)
        }
    }

    @Test fun staleManifestCannotUndoConfirmedUpdate() = runTest {
        val controller = UpdateController(4, backgroundScope, { release.copy(versionCode = 4) }, { _, _ -> error("Not downloading") }, { release.encode() }, {})
        controller.start(); waitForCheck(controller)
        assertEquals(release, controller.state.value.release)
    }

    @Test fun downloadFailureRetriesAndInstallerFailureStillBlocks() = runTest {
        var attempts = 0
        val file = temporary.newFile("verified.apk")
        val controller = UpdateController(4, backgroundScope, { release }, { _, progress ->
            attempts++
            if (attempts == 1) error("Offline")
            progress(100); file
        }, { null }, {})
        controller.start(); waitForCheck(controller)
        controller.download(); controller.download(); runCurrent()
        assertEquals(1, attempts)
        assertTrue(controller.state.value.failed)
        controller.download(); runCurrent()
        assertEquals(file, controller.state.value.apk)
        controller.installFailed()
        assertNull(controller.state.value.apk)
        assertEquals(release, controller.state.value.release)
    }

    private suspend fun TestScope.waitForCheck(controller: UpdateController) {
        // Persistence deliberately runs on IO; allow that dispatcher to finish without virtual-time polling.
        withContext(Dispatchers.Default) { withTimeout(5_000) {
            while (controller.state.value.checking) { testScheduler.runCurrent(); delay(5) }
        } }
    }
}
