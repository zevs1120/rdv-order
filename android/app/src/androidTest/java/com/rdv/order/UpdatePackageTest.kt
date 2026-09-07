package com.rdv.order

import android.content.Intent
import android.content.pm.PackageManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.rdv.order.update.*
import java.io.File
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith

/** Optional real signed artifacts, staged by scripts/android/test-release.sh; never embedded in the app. */
@RunWith(AndroidJUnit4::class)
@Suppress("DEPRECATION")
class UpdatePackageTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private lateinit var release: AppRelease
    private lateinit var old: File
    private lateinit var next: File
    @Before fun fixtures() {
        Assume.assumeTrue("Run scripts/android/test-release.sh with the signed release built", instrumentation.context.assets.list("")!!.contains("update-next.apk"))
        val folder = File(context.cacheDir, "updates").apply { mkdirs() }
        fun copy(name: String): File = File(folder, name).also { file ->
            instrumentation.context.assets.open(name).use { input -> file.outputStream().use(input::copyTo) }
        }
        old = copy("update-old.apk")
        next = copy("update-next.apk")
        release = AppRelease.parse(instrumentation.context.assets.open("update-release.json").bufferedReader().use { it.readText() })
    }
    @Test fun signedUpgradePassesButWrongVersionPackageAndCertificateFail() {
        val pm = context.packageManager
        val previous = pm.getPackageArchiveInfo(old.path, PackageManager.GET_SIGNATURES)!!
        val candidate = pm.getPackageArchiveInfo(next.path, PackageManager.GET_SIGNATURES)!!
        val client = UpdateClient(next.parentFile!!) { file, manifest ->
            verifyUpdateIdentity(pm.getPackageArchiveInfo(file.path, PackageManager.GET_SIGNATURES)!!, previous, manifest)
        }
        client.verify(next, release)
        assertTrue(runCatching { verifyUpdateIdentity(candidate, previous, release.copy(versionCode = release.versionCode + 1)) }.isFailure)
        assertTrue(runCatching { verifyUpdateIdentity(candidate, candidate, release) }.isFailure)
        candidate.packageName = "wrong.package"
        assertTrue(runCatching { verifyUpdateIdentity(candidate, previous, release) }.isFailure)
        candidate.packageName = previous.packageName
        candidate.signatures = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES).signatures
        assertTrue(runCatching { verifyUpdateIdentity(candidate, previous, release) }.isFailure)
    }
    @Test fun installerCanReadVerifiedApkThroughNarrowFileProvider() {
        val intent = updateInstallIntent(context, next)
        assertEquals("application/vnd.android.package-archive", intent.type)
        assertEquals("content", intent.data!!.scheme)
        assertTrue(intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertEquals(next.length(), context.contentResolver.openInputStream(intent.data!!)!!.use { it.readBytes().size.toLong() })
        val unrelated = File(context.cacheDir, "private.txt").apply { writeText("not shared") }
        assertTrue(runCatching { updateInstallIntent(context, unrelated) }.isFailure)
        unrelated.delete()
    }
}
