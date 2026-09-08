package com.rdv.order.domain

import com.rdv.order.data.*
import org.junit.Assert.*
import org.junit.Test

class MenuIndexTest {
    private val rice = MenuItem("rice", "Garlic Rice", 80, "Rice")
    private val fish = MenuItem("fish", "Fish", 120, "Seafood")
    private val plain = MenuItem("plain", "Plain", 50)
    private val index = MenuIndex(MenuResponse(listOf(rice, fish, plain), listOf("Empty", "Rice", "rice")), "Other")

    @Test fun `keeps original category order empty categories and selection fallback`() {
        val selected = index.select("", "missing")
        assertEquals(listOf("Empty", "Rice", "Seafood", "Other"), selected.categories)
        assertEquals("Empty", selected.selected)
        assertTrue(selected.items.isEmpty())
        assertEquals(listOf(rice), index.select("", "Rice").items)
    }
    @Test fun `search is trimmed case insensitive and preserves dish order`() {
        val result = index.select("  GARLIC  ", "Seafood")
        assertEquals(listOf("Rice"), result.categories)
        assertEquals("Rice", result.selected)
        assertEquals(listOf(rice), result.items)
        assertEquals(listOf(fish), index.select("seafood", "Seafood").items)
        assertEquals(listOf(plain), index.select("Plain", "Other").items)
        assertTrue(index.select("not found", "Rice").items.isEmpty())
    }
    @Test fun `selection reuses grouped menu rows without rebuilding the menu`() {
        assertSame(index.select("", "Rice").items, index.select("", "Rice").items)
        assertTrue(MenuIndex(null, "Other").select("", "").items.isEmpty())
    }
}
