package com.rdv.order

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.espresso.Espresso
import com.rdv.order.update.*
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class UpdateScreenTest {
    @get:Rule val compose = createComposeRule()
    private val release = AppRelease("0.1.4", 5, "/releases/rdv-order-0.1.4.apk", 8, "a".repeat(64))
    @Test fun requiredUpdateRemainsAfterBackAndActionIsVisible() {
        var clicks = 0
        compose.setContent { UpdateScreen(UpdateState(checking = false, release = release), "zh", onUpdate = { clicks++ }) }
        compose.onNodeWithTag("update-action").performScrollTo().assertIsDisplayed().performClick()
        assertEquals(1, clicks)
        Espresso.pressBack()
        compose.onNodeWithText("更新后继续使用").assertExists()
        compose.onNodeWithTag("update-action").performScrollTo().assertIsDisplayed()
        val instrumentation = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        val folder = java.io.File(instrumentation.targetContext.filesDir, "update-evidence").apply { mkdirs() }
        instrumentation.uiAutomation.takeScreenshot()?.let { bitmap ->
            java.io.File(folder, "screen-layout.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
    }
    @Test fun downloadingDisablesDuplicateActionsAndFailureOffersRetry() {
        val state = androidx.compose.runtime.mutableStateOf(UpdateState(checking = false, release = release, downloading = true, progress = 42))
        compose.setContent { UpdateScreen(state.value, "en", onUpdate = {}) }
        compose.onNodeWithText("Downloading 42%").assertExists()
        compose.onNodeWithTag("update-action").assertIsNotEnabled()
        compose.runOnIdle { state.value = state.value.copy(downloading = false, failed = true) }
        compose.onNodeWithTag("update-action").performScrollTo().assertIsDisplayed().assertIsEnabled()
    }
}
