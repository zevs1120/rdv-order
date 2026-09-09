package com.rdv.order

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.espresso.Espresso
import com.rdv.order.data.*
import com.rdv.order.ui.*
import java.io.File
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeFlowTest {
    @get:Rule val compose = createComposeRule()
    private lateinit var vm: RdvViewModel
    private lateinit var transport: FixtureTransport
    private lateinit var connection: ConnectionMonitor
    private var connectionFails = false
    @Before fun setup() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        transport = FixtureTransport()
        val store = TestStore()
        val repository = RdvRepository(transport, store, { "https://isolated-fixture.invalid" })
        compose.setContent {
            val scope = androidx.compose.runtime.rememberCoroutineScope()
            connection = androidx.compose.runtime.remember { ConnectionMonitor(scope) { if (connectionFails) error("Offline fixture") } }
            vm = androidx.compose.runtime.remember { RdvViewModel(repository, Strings(context), store) }
            RdvRoot(vm); ConnectionRecovery(vm, connection)
        }
        compose.waitUntil(10_000) { ::vm.isInitialized && vm.state.value.ready }
    }
    private fun login(user: String = "waiter") {
        compose.onNodeWithTag("username").performTextInput(user)
        compose.onNodeWithTag("pin").performTextInput("fixture-pin")
        compose.onNodeWithTag("login").performScrollTo().assertIsDisplayed().performClick()
        compose.waitUntil(10_000) { !vm.state.value.busy && vm.state.value.screen != Screen.LOGIN && !vm.state.value.loading }
    }
    private fun openTable() {
        compose.onNodeWithTag("table-01").performClick()
        compose.onNodeWithText("Confirm Open").performClick()
        compose.waitUntil(10_000) { vm.state.value.screen == Screen.ORDER && vm.state.value.menu != null && !vm.state.value.busy && !vm.state.value.loading }
        val add = compose.onNodeWithTag("add-${transport.rice.id}")
        repeat(5) {
            if (!add.isDisplayed()) compose.onNodeWithTag("order-content-scroll").performTouchInput { swipeUp() }
        }
        add.performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("submit").assertIsDisplayed()
    }
    @Test fun draftBadgeAndCheckoutProtectionKeepOrderingVisible() {
        login(); openTable()
        repeat(3) { compose.onNodeWithTag("add-${transport.rice.id}").performClick() }
        compose.onNodeWithContentDescription("Draft count 3").assertIsDisplayed()
        assertEquals("", vm.state.value.sheet)
        compose.onNodeWithText("Table bill").assertIsDisplayed()
        compose.runOnIdle { vm.prepareCheckout() }
        compose.onNodeWithText("Review draft").assertIsDisplayed().performClick()
        assertEquals("cart", vm.state.value.sheet)
        assertEquals(3, vm.state.value.draft!!.lines.single().qty)
        assertFalse(transport.calls.any { it.path == "/api/tables/checkout" })
    }
    @Test fun guestEditAndBillReturnPreserveDraftAndSearch() {
        login("manager")
        compose.runOnIdle { vm.navigate(Screen.TABLES) }
        compose.waitUntil { !vm.state.value.loading && vm.state.value.tables.isNotEmpty() }
        openTable()
        compose.onNodeWithTag("add-${transport.rice.id}").performClick()
        compose.runOnIdle { vm.keyword("Rice"); vm.updateGuests(5) }
        compose.waitUntil { !vm.state.value.busy && vm.state.value.draft!!.guests == 5 }
        compose.runOnIdle { vm.showBill() }
        compose.waitUntil { !vm.state.value.loading && vm.state.value.bill != null }
        compose.runOnIdle { vm.showSessionOrders() }
        compose.waitUntil { !vm.state.value.loading && vm.state.value.screen == Screen.ORDERS }
        compose.onNodeWithContentDescription("Back").performClick()
        compose.waitUntil { !vm.state.value.loading && vm.state.value.screen == Screen.ORDER }
        assertEquals("Rice", vm.state.value.draft!!.keyword)
        assertEquals(5, vm.state.value.draft!!.guests)
        assertEquals(1, vm.state.value.draft!!.lines.single().qty)
        assertEquals("bill", vm.state.value.sheet)
    }
    @Test fun connectionDialogRecoversWithoutLosingDraftOrReplayingWrites() {
        login(); openTable()
        compose.onNodeWithTag("add-${transport.rice.id}").performClick()
        val draft = vm.state.value.draft
        val writes = transport.calls.count { it.method != "GET" }
        compose.runOnIdle { connectionFails = true; connection.setForeground(true); connection.retry() }
        compose.waitUntil { !connection.state.value.checking }
        compose.runOnIdle { connection.retry() }
        compose.waitUntil(5000) { connection.state.value.disconnected }
        compose.onNodeWithText("Unable to connect").assertIsDisplayed()
        compose.onNodeWithText("Retry").assertIsDisplayed()
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        compose.onNodeWithText("Unable to connect").assertIsDisplayed()
        compose.runOnIdle { connectionFails = false }
        compose.onNodeWithText("Retry").performClick()
        compose.waitUntil(5000) { !connection.state.value.disconnected }
        compose.onNodeWithText("Unable to connect").assertDoesNotExist()
        assertEquals(draft, vm.state.value.draft)
        assertEquals(writes, transport.calls.count { it.method != "GET" })
        compose.runOnIdle { connection.setForeground(false) }
    }
    @Test fun waiterCanOpenOrderPrintAndCheckoutWithoutChangingTheFlow() {
        login()
        compose.onNodeWithTag("table-01").assertExists()
        openTable()
        compose.onNodeWithTag("add-${transport.rice.id}").performClick()
        compose.waitUntil { vm.state.value.draft!!.lines.isNotEmpty() }
        assertEquals("", vm.state.value.sheet)
        assertEquals(1, vm.state.value.draft!!.lines.single().qty)
        compose.onAllNodesWithText("Submit Order").onLast().performClick()
        compose.waitUntil(10_000) { vm.state.value.bill != null && !vm.state.value.busy }
        assertTrue(vm.state.value.draft!!.lines.isEmpty())
        assertEquals(80L, vm.state.value.bill!!.totalAmount)
        compose.onNodeWithText("Print bill").performClick()
        compose.waitUntil { vm.state.value.message.isNotEmpty() }
        assertTrue(transport.calls.any { it.path == "/api/tables/print-bill" && it.method == "POST" })
        compose.onNodeWithText("Done").performClick()
        compose.onNodeWithText("Checkout").performClick()
        compose.waitUntil { vm.state.value.checkoutQuote != null && !vm.state.value.loading }
        compose.onNodeWithText("Confirm payment received").performClick()
        compose.waitUntil(10_000) { vm.state.value.screen == Screen.TABLES && !vm.state.value.busy }
        assertEquals("idle", vm.state.value.tables.first { it.tableNo == "01" }.status)
    }
    @Test fun uncertainSubmitKeepsBasketAndRetryResolvesExactlyOneOrder() {
        login(); openTable()
        transport.loseFirstSubmitResponse = true
        compose.onNodeWithTag("add-${transport.rice.id}").performClick()
        compose.onAllNodesWithText("Submit Order").onLast().performClick()
        compose.waitUntil { !vm.state.value.busy && vm.state.value.error.isNotEmpty() }
        assertEquals(1, vm.state.value.draft!!.lines.size)
        compose.onAllNodesWithText("Submit Order").onLast().performClick()
        compose.waitUntil(10_000) { !vm.state.value.busy && vm.state.value.bill != null }
        assertEquals(1, transport.calls.count { it.path == "/api/orders" })
        assertTrue(transport.calls.any { it.path == "/api/orders/request-status" })
        assertEquals(80L, vm.state.value.bill!!.totalAmount)
    }
    @Test fun seafoodMethodQuantityAndLanguageRemainConsistent() {
        login(); openTable()
        compose.onNodeWithText("Seasonal").performClick()
        compose.onNodeWithTag("add-${transport.fish.id}").performClick()
        compose.waitUntil { vm.state.value.sheet == "note" }
        compose.onNodeWithContentDescription("Increase quantity").performClick()
        compose.onNodeWithText("Braised").performClick()
        compose.onNodeWithTag("note-input").performTextInput("no chilli")
        compose.onNodeWithText("Apply").performClick()
        compose.waitUntil { vm.state.value.sheet.isEmpty() }
        val fish = vm.state.value.draft!!.lines.single()
        assertEquals(2, fish.qty)
        assertEquals("Braised; no chilli", fish.note)
        compose.onNodeWithContentDescription("切换到中文").performClick()
        compose.waitUntil { vm.state.value.lang == "zh" }
        compose.onNodeWithText("石斑鱼").assertExists()
        assertEquals("Braised; no chilli", vm.state.value.draft!!.lines.single().note)
    }
    @Test fun managerRetainsAllSevenManagementEntries() {
        login("manager")
        assertEquals(Screen.ORDERS, vm.state.value.screen)
        compose.onNodeWithContentDescription("Back").performClick()
        listOf("Order history", "Revenue", "Fees", "Hot Items", "Printers", "Access", "Menu").forEach { compose.onNodeWithText(it).assertExists() }
        compose.onNodeWithText("Revenue").performClick()
        compose.waitUntil(10_000) { !vm.state.value.loading && vm.state.value.management.number("totalAmount") == 600.0 }
        compose.onNodeWithText("₱600").assertExists()
    }
    @Test fun expiredLoginClearsPreviousScreenAndRecoversTheSameUsersDraftAfterLogin() {
        login(); openTable()
        compose.onNodeWithTag("add-${transport.rice.id}").performClick()
        compose.runOnIdle { transport.sessionRejected = true; vm.showBill() }
        compose.waitUntil(10_000) { vm.state.value.screen == Screen.LOGIN && !vm.state.value.busy }
        assertNull(vm.state.value.draft)
        assertNull(vm.state.value.bill)
        assertTrue(vm.state.value.management.isEmpty())
        transport.sessionRejected = false
        login()
        compose.onNodeWithTag("table-01").performClick()
        compose.waitUntil { vm.state.value.screen == Screen.ORDER && !vm.state.value.busy && !vm.state.value.loading }
        assertEquals(transport.rice.id, vm.state.value.draft!!.lines.single().item.id)
    }
    @Test fun closingOrdinaryNoteSavesTypedTextAfterDismissingTheKeyboard() {
        login(); openTable()
        compose.onNodeWithTag("add-${transport.rice.id}").performClick()
        compose.runOnIdle { vm.sheet("cart") }
        compose.onNodeWithText(vm.text("order.noteAction")).performClick()
        compose.onNodeWithTag("note-input").performTextInput("onion")
        Espresso.pressBack()
        compose.waitForIdle()
        if (vm.state.value.sheet == "note") Espresso.pressBack()
        compose.waitUntil { vm.state.value.sheet.isEmpty() }
        assertEquals("no onion", vm.state.value.draft!!.lines.single().note)
    }
    @Test fun waiterHasOrdersOnlyInManagement() {
        login()
        compose.onNodeWithTag("settings").performClick()
        compose.onNodeWithText("Order history").assertExists()
        listOf("Revenue", "Fees", "Hot Items", "Printers", "Access", "Menu").forEach { compose.onNodeWithText(it).assertDoesNotExist() }
    }
    @Test fun managerModulesLoadAsNativeScreensWithoutErrors() {
        login("manager")
        val targets = listOf("Fees" to Screen.FEES, "Hot Items" to Screen.HOT, "Printers" to Screen.DEVICES, "Access" to Screen.RBAC, "Menu" to Screen.MENU)
        targets.forEach { (label, target) ->
            compose.onNodeWithContentDescription("Back").performClick()
            compose.onNodeWithText(label).performClick()
            compose.waitUntil(10_000) { vm.state.value.screen == target && !vm.state.value.loading }
            assertEquals("Error loading $target", "", vm.state.value.error)
            assertTrue(vm.state.value.management.isNotEmpty())
        }
    }
    @Test fun tableDraftSurvivesLeavingTheOrderScreen() {
        login(); openTable()
        compose.onNodeWithTag("add-${transport.rice.id}").performClick()
        Espresso.pressBack()
        compose.waitUntil { vm.state.value.sheet.isEmpty() }
        Espresso.pressBack()
        compose.waitUntil { vm.state.value.screen == Screen.TABLES }
        compose.waitUntil { !vm.state.value.loading }
        compose.onNodeWithTag("table-01").performClick()
        compose.waitUntil { vm.state.value.screen == Screen.ORDER && !vm.state.value.busy }
        assertEquals(transport.rice.id, vm.state.value.draft!!.lines.single().item.id)
    }
    @Test fun deviceControlsRemainAvailableAndClearRequiresConfirmation() {
        login("manager")
        compose.onNodeWithContentDescription("Back").performClick()
        compose.onNodeWithText("Printers").performClick()
        compose.onNodeWithText("Advanced diagnostics +").performScrollTo().performClick()
        compose.waitUntil { !vm.state.value.loading && vm.state.value.screen == Screen.DEVICES }
        compose.onNodeWithText(vm.text("common.collapse")).assertDoesNotExist()
        compose.onNodeWithText(vm.text("devices.retryPrint")).assertIsDisplayed()
        compose.onNodeWithText(vm.text("devices.testKitchen")).performScrollTo().performClick()
        compose.waitUntil { !vm.state.value.busy && !vm.state.value.loading }
        assertEquals(1, transport.calls.count { it.path == "/api/print/self-test" && it.method == "POST" })
        compose.onNodeWithText(vm.text("devices.clearQueue")).performScrollTo().performClick()
        assertFalse(transport.calls.any { it.path == "/api/print/queue" })
        compose.onNodeWithText(vm.text("common.cancel")).performClick()
        assertFalse(transport.calls.any { it.path == "/api/print/queue" })
        compose.onNodeWithText(vm.text("devices.clearQueue")).performClick()
        compose.onNodeWithText(vm.text("common.done")).performClick()
        compose.waitUntil { !vm.state.value.busy && !vm.state.value.loading }
        assertEquals(1, transport.calls.count { it.path == "/api/print/queue" && it.method == "DELETE" })
    }
    @Test fun menuCodesAndRequiredChoicesKeepSeparateFreeDrinksAndVariantPrices() {
        login(); openTable()
        compose.onNodeWithTag("menu-search").performTextReplacement("161")
        compose.onNodeWithTag("clear-menu-search").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals("", vm.state.value.draft!!.keyword) }
        compose.onNodeWithTag("menu-search").performTextReplacement("161")
        compose.onNodeWithTag("add-${transport.freeBreakfast.id}").performScrollTo().performClick()
        compose.onNodeWithText("Add to draft").assertIsNotEnabled()
        compose.onNodeWithTag("choice-beverage-tea").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("choice-beverage-coke_zero").performScrollTo().assertIsDisplayed().performClick()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        File(context.filesDir, "android-evidence").mkdirs()
        InstrumentationRegistry.getInstrumentation().uiAutomation.waitForIdle(500, 5000)
        File(context.filesDir, "android-evidence/menu-choice.png").outputStream().use {
            requireNotNull(InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()).compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        compose.onNodeWithText("Add to draft").performClick()
        assertEquals(0L, com.rdv.order.domain.OrderRules.total(vm.state.value.draft!!.lines))
        compose.onNodeWithTag("add-${transport.freeBreakfast.id}").performScrollTo().performClick()
        compose.onNodeWithTag("choice-beverage-coke").performScrollTo().performClick()
        compose.onNodeWithText("Add to draft").performClick()
        assertEquals(2, vm.state.value.draft!!.lines.size)
        compose.onNodeWithTag("menu-search").performTextReplacement("018")
        compose.onNodeWithTag("add-${transport.chop.id}").performScrollTo().performClick()
        compose.onNodeWithTag("choice-protein-pork").performScrollTo().performClick()
        compose.onNodeWithText("Add to draft · ₱450").performClick()
        assertEquals(450L, com.rdv.order.domain.OrderRules.total(vm.state.value.draft!!.lines))
        compose.onAllNodesWithText("Submit Order").onLast().performClick()
        compose.waitUntil(10000) { !vm.state.value.busy && vm.state.value.bill != null }
        assertEquals(450L, vm.state.value.bill!!.totalAmount)
        assertTrue(vm.state.value.bill!!.items.any { it.note == "Beverage: Coke Zero" })
    }

    @Test fun captureNativeScreensForReview() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        File(context.filesDir, "android-evidence").listFiles()?.filter { it.extension == "png" }?.forEach { it.delete() }
        fun capture(name: String) {
            compose.waitForIdle()
            compose.mainClock.advanceTimeBy(500)
            compose.waitForIdle()
            // Dialog window fades run on Android's clock, outside Compose's test clock.
            InstrumentationRegistry.getInstrumentation().uiAutomation.waitForIdle(500, 5_000)
            File(context.filesDir, "android-evidence").mkdirs()
            File(context.filesDir, "android-evidence/$name.png").outputStream().use { stream ->
                requireNotNull(InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot())
                    .compress(Bitmap.CompressFormat.PNG, 100, stream)
            }
        }
        capture("login-en")
        login(); capture("tables-en"); openTable(); capture("order-en")
        compose.onNodeWithTag("add-${transport.rice.id}").performClick(); compose.runOnIdle { vm.sheet("cart") }; capture("cart-en")
        Espresso.pressBack(); compose.waitUntil { vm.state.value.sheet.isEmpty() }
        compose.onNodeWithContentDescription("切换到中文").performClick(); capture("order-zh")
    }
}
