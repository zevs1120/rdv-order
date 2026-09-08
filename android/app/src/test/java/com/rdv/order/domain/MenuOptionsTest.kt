package com.rdv.order.domain

import com.rdv.order.data.*
import org.junit.Assert.*
import org.junit.Test

class MenuOptionsTest {
    private val chop = MenuItem("chop", "Chop Suey", 420, "Filipino Food", code = 12, optionGroups = listOf(
        MenuOptionGroup("protein", "Protein", "选择肉类", listOf(MenuOption("chicken", "Chicken"), MenuOption("pork", "Pork", priceDelta = 30)))
    ))
    @Test fun choicesControlTotalsAndSurviveDraftSerialization() {
        val lines = listOf(CartLine(chop, 1, choices = mapOf("protein" to "chicken")), CartLine(chop, 2, choices = mapOf("protein" to "pork")))
        val draft = Draft("01", lines = lines)
        assertEquals(1320L, OrderRules.total(lines))
        val restored = RdvJson.decodeFromString<Draft>(RdvJson.encodeToString(draft))
        assertEquals(draft, restored)
        assertEquals("pork", OrderRules.payload(restored).items[1].choices["protein"])
        assertNotEquals(OrderRules.fingerprint(OrderRules.payload(draft)), OrderRules.fingerprint(OrderRules.payload(draft.copy(lines = lines.take(1)))))
    }
    @Test fun missingChoicesCannotSubmitAndComplimentaryLinesHaveZeroAmount() {
        assertFalse(MenuOptions.complete(chop, emptyMap()))
        assertThrows(IllegalArgumentException::class.java) { OrderRules.payload(Draft("01", lines = listOf(CartLine(chop, 1)))) }
        assertEquals(0L, OrderRules.total(listOf(CartLine(chop.copy(isComplimentary = true), 2, choices = mapOf("protein" to "pork")))))
    }
    @Test fun codeSearchFindsOtherSectionsAndIgnoresLeadingZeros() {
        val menu = MenuResponse(emptyList(), searchItems = listOf(chop))
        assertEquals(listOf(chop), MenuIndex(menu, "Other").select("012", "Breakfast").items)
        assertEquals(listOf(chop), MenuIndex(menu, "Other").select("12", "").items)
        assertTrue(MenuIndex(menu, "Other").select("1", "").items.isEmpty())
    }
}
