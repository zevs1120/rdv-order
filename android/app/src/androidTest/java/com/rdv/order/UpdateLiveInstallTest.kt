package com.rdv.order

import android.content.ComponentName
import android.content.Intent
import android.graphics.Bitmap
import android.os.SystemClock
import android.view.KeyEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith

/** Opt-in ONLY on an isolated emulator with the local lower-version updater harness installed. */
@RunWith(AndroidJUnit4::class)
class UpdateLiveInstallTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation
    private fun node(vararg labels: String): AccessibilityNodeInfo? {
        fun visit(item: AccessibilityNodeInfo): AccessibilityNodeInfo? {
            if (item.text?.toString() in labels || item.contentDescription?.toString() in labels) return item
            for (index in 0 until item.childCount) item.getChild(index)?.let { visit(it)?.let { match -> return match } }
            return null
        }
        return automation.rootInActiveWindow?.let(::visit)
    }
    private fun awaitNode(vararg labels: String): AccessibilityNodeInfo {
        val until = SystemClock.uptimeMillis() + 40_000
        while (SystemClock.uptimeMillis() < until) { node(*labels)?.let { return it }; SystemClock.sleep(100) }
        screenshot("failure")
        error("UI did not reach: ${labels.toList()}")
    }
    private fun click(item: AccessibilityNodeInfo) {
        val label = item.text?.toString() ?: item.contentDescription?.toString().orEmpty()
        automation.waitForIdle(300, 3_000)
        var target: AccessibilityNodeInfo? = node(label) ?: item
        while (target != null && !target.isClickable) target = target.parent
        check(target?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true)
    }
    private fun back() {
        automation.waitForIdle(300, 3_000)
        node("Navigate up", "Back")?.let { click(it); return }
        val now = SystemClock.uptimeMillis()
        automation.injectInputEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK, 0), true)
        automation.injectInputEvent(KeyEvent(now, SystemClock.uptimeMillis(), KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK, 0), true)
        automation.waitForIdle(300, 3_000)
    }
    private fun screenshot(name: String) {
        val folder = File(instrumentation.targetContext.filesDir, "update-evidence").apply { mkdirs() }
        automation.takeScreenshot()?.let { bitmap ->
            File(folder, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
    }
    @Test fun publicDownloadPermissionCancellationAndConfirmedUpgrade() {
        Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("liveUpdate") == "true")
        android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("appops set com.rdv.order REQUEST_INSTALL_PACKAGES default")).use { it.readBytes() }
        val context = instrumentation.targetContext
        context.startActivity(Intent().setComponent(ComponentName("com.rdv.order", "com.rdv.order.MainActivity"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        awaitNode("Update to continue", "更新后继续使用")
        screenshot("required")
        click(awaitNode("Download update", "下载更新"))
        awaitNode("Allow from this source")
        screenshot("permission")
        back() // Declining source permission must leave the app blocked, with a usable retry.
        click(awaitNode("Install update", "安装更新"))
        click(awaitNode("Allow from this source"))
        back()
        val cancel = awaitNode("Cancel", "取消")
        screenshot("installer")
        click(cancel)
        awaitNode("Update to continue", "更新后继续使用")
        click(awaitNode("Install update", "安装更新"))
        click(awaitNode("Update", "更新"))
        awaitNode("Open", "打开")
        screenshot("installed")
        click(awaitNode("Open", "打开"))
        awaitNode("Tables", "桌台", "Sign In", "登录")
        assertNull(node("Update to continue", "更新后继续使用"))
        screenshot("reopened")
    }
}
