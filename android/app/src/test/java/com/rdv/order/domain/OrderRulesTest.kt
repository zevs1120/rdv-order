package com.rdv.order.domain

import com.rdv.order.data.*
import java.time.*
import org.junit.Assert.*
import org.junit.Test

class OrderRulesTest {
    private val fish = MenuItem("fish", "Grouper", 150)
    @Test fun `seafood quantities are order units rather than grams in the submitted payload`() {
        val draft = Draft("05", lines = listOf(CartLine(fish, 3, "Steamed; no salt")))
        assertEquals("300g", Seafood.quantity(fish.name, 3, "en"))
        assertEquals(3, OrderRules.payload(draft).items.single().qty)
        assertEquals(450L, OrderRules.total(draft.lines))
        assertEquals("3 pcs", Seafood.quantity("Tiger Prawn", 3, "en"))
        assertEquals("3只", Seafood.quantity("老虎虾", 3, "zh"))
    }
    @Test fun `all seafood cooking choices match the current ordering page`() {
        assertEquals(listOf("steamed", "braised", "pickled"), Seafood.config("石斑鱼")!!.methods.map { it.key })
        assertEquals(listOf("steamed", "braised", "seared"), Seafood.config("hairtail")!!.methods.map { it.key })
        assertEquals(listOf("steamed", "ginger_garlic"), Seafood.config("Crab")!!.methods.map { it.key })
        assertEquals(listOf("steamed", "salt_pepper"), Seafood.config("Mantis")!!.methods.map { it.key })
        assertEquals(listOf("poached", "braised", "bbq"), Seafood.config("Tiger Prawn")!!.methods.map { it.key })
        assertNull(Seafood.config("Fish soup"))
    }
    @Test fun `Chinese and English cooking notes round trip and preserve extra instructions`() {
        val config = Seafood.config("Grouper")!!
        assertEquals("braised" to "不要辣", Seafood.parse("做法：红烧；备注：不要辣", config))
        assertEquals("steamed" to "no oil", Seafood.parse("Method: Steamed | Note: no oil", config))
        assertEquals("steamed" to "chef special", Seafood.parse("chef special", config))
        assertEquals("红烧; 不要辣", Seafood.note(config, "braised", "不要辣", "zh"))
        assertTrue(Seafood.note(config, "braised", "x".repeat(150), "en").length <= 120)
    }
    @Test fun `manual notes preserve existing tokens and do not duplicate case variants`() {
        assertEquals("no onion; more rice", OrderRules.addNote("no onion", "more", "rice"))
        assertEquals("no Onion", OrderRules.addNote("no Onion", "no", "onion"))
        assertEquals("no onion", OrderRules.addNote("no onion", "more", "x".repeat(120)))
        assertEquals("no onion", OrderRules.addNote("no onion", "more", "   "))
    }
    @Test fun `request identity is stable across item ordering but distinct across tables or quantities`() {
        val rice = MenuItem("rice", "Rice", 80)
        val original = OrderRules.payload(Draft("01", lines = listOf(CartLine(fish, 3, "No Salt"), CartLine(rice, 1))))
        assertEquals(OrderRules.fingerprint(original), OrderRules.fingerprint(original.copy(items = original.items.reversed().map { it.copy(note = it.note?.lowercase()) })))
        assertNotEquals(OrderRules.fingerprint(original), OrderRules.fingerprint(original.copy(tableNo = "02")))
        assertNotEquals(OrderRules.fingerprint(original), OrderRules.fingerprint(original.copy(items = original.items.map { it.copy(qty = 2) })))
    }
    @Test(expected = IllegalArgumentException::class) fun `empty basket is not submitted`() { OrderRules.payload(Draft("01")) }
    @Test(expected = IllegalArgumentException::class) fun `zero quantity is not submitted`() { OrderRules.payload(Draft("01", lines = listOf(CartLine(fish, 0)))) }
    @Test fun `money uses integer arithmetic and does not overflow 32 bit`() {
        assertEquals(3_000_000_000L, OrderRules.total(listOf(CartLine(fish.copy(price = 1_000_000_000), 3))))
    }
    @Test fun `export timezone uses JavaScript sign and accounts for DST`() {
        val winter = Instant.parse("2026-01-01T00:00:00Z")
        val summer = Instant.parse("2026-07-01T00:00:00Z")
        assertEquals(-480, DateRules.exportOffsetMinutes(winter, ZoneId.of("Asia/Manila")))
        assertEquals(300, DateRules.exportOffsetMinutes(winter, ZoneId.of("America/New_York")))
        assertEquals(240, DateRules.exportOffsetMinutes(summer, ZoneId.of("America/New_York")))
    }
    @Test fun `month preset preserves JavaScript date overflow rather than clamping or using calendar month`() {
        val range = DateRules.preset("month", LocalDate.of(2026, 3, 31), ZoneId.of("UTC"))
        assertEquals(Instant.parse("2026-03-03T00:00:00Z"), range.from)
        assertEquals(Instant.parse("2026-03-31T23:59:59.999Z"), range.to)
        val leap = DateRules.preset("year", LocalDate.of(2024, 2, 29), ZoneId.of("UTC"))
        assertEquals(Instant.parse("2023-03-01T00:00:00Z"), leap.from)
    }
    @Test fun `week is six days back plus today with local day boundaries`() {
        val range = DateRules.preset("week", LocalDate.of(2026, 9, 7), ZoneId.of("Asia/Manila"))
        assertEquals(Instant.parse("2026-08-31T16:00:00Z"), range.from)
        assertEquals(Instant.parse("2026-09-07T15:59:59.999Z"), range.to)
    }
    @Test(expected = IllegalArgumentException::class) fun `reversed export month range is rejected`() { DateRules.months("2026-09", "2026-08") }
    @Test(expected = IllegalArgumentException::class) fun `non padded export month is rejected`() { DateRules.months("2026-9", "2026-09") }
}
