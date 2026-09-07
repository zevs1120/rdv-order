package com.rdv.order.domain

import com.rdv.order.data.*
import java.time.*
import java.util.Locale

object OrderRules {
    fun payload(draft: Draft): SubmitPayload {
        require(draft.tableNo.isNotBlank()) { "缺少桌号" }
        require(draft.lines.isNotEmpty()) { "请选择菜品" }
        require(draft.lines.all { it.qty > 0 && it.item.id.isNotBlank() }) { "菜品参数无效" }
        return SubmitPayload(draft.tableNo, draft.guests, draft.shift,
            draft.lines.map { SubmitItem(it.item.id, it.qty, it.note?.trim()?.take(120)?.ifEmpty { null }) })
    }

    /** Delimiters are JSON-encoded so note text cannot collide with item boundaries. */
    fun fingerprint(payload: SubmitPayload): String = RdvJson.encodeToString(
        payload.copy(guestCount = 0, shift = "", items = payload.items
            .map { it.copy(note = it.note?.trim()?.lowercase(Locale.ROOT)?.ifEmpty { null }) }
            .sortedWith(compareBy({ it.menuItemId }, { it.qty }, { it.note ?: "" })))
    )

    fun total(lines: List<CartLine>): Long = lines.fold(0L) { total, line ->
        Math.addExact(total, Math.multiplyExact(line.item.price, line.qty.toLong()))
    }

    fun addNote(existing: String?, mode: String, input: String): String? {
        require(mode == "no" || mode == "more")
        if (input.trim().isEmpty()) return existing
        val tokens = existing.orEmpty().split(';').map { it.trim() }.filter { it.isNotEmpty() }.toMutableList()
        val token = "$mode ${input.trim()}"
        if (tokens.none { it.equals(token, ignoreCase = true) }) tokens.add(token)
        val accepted = mutableListOf<String>()
        for (part in tokens) {
            if ((accepted + part).joinToString("; ").length > 120) break
            accepted.add(part)
        }
        return accepted.joinToString("; ").ifEmpty { null }
    }
}

data class CookingMethod(val key: String, val zh: String, val en: String, val aliases: List<String> = emptyList())
data class SeafoodConfig(val unit: String, val methods: List<CookingMethod>)

object Seafood {
    private val steamed = CookingMethod("steamed", "清蒸", "Steamed")
    private val braised = CookingMethod("braised", "红烧", "Braised")
    private val pickled = CookingMethod("pickled", "酸菜煮", "Pickled")
    private val seared = CookingMethod("seared", "香煎", "Seared")
    private val ginger = CookingMethod("ginger_garlic", "姜葱", "Ginger & Garlic", listOf("ginger&garlic"))
    private val salt = CookingMethod("salt_pepper", "椒盐", "Salt & Pepper", listOf("salt&pepper"))
    private val poached = CookingMethod("poached", "白灼", "Poached")
    private val bbq = CookingMethod("bbq", "炭烤", "BBQ")
    private fun normalize(value: String) = value.trim().lowercase(Locale.ROOT).replace(Regex("\\s+"), " ")
    fun config(name: String): SeafoodConfig? = when (normalize(name)) {
        "grouper", "石斑鱼", "parrot fish", "青衣鱼" -> SeafoodConfig("100g", listOf(steamed, braised, pickled))
        "hairtail", "带鱼" -> SeafoodConfig("100g", listOf(steamed, braised, seared))
        "crab", "金玉蟹" -> SeafoodConfig("100g", listOf(steamed, ginger))
        "mantis", "富贵虾" -> SeafoodConfig("100g", listOf(steamed, salt))
        "tiger prawn", "老虎虾" -> SeafoodConfig("pcs", listOf(poached, braised, bbq))
        else -> null
    }
    fun quantity(name: String, qty: Int, lang: String): String = when (config(name)?.unit) {
        "100g" -> "${qty.coerceAtLeast(0).toLong() * 100}g"
        "pcs" -> if (lang == "zh") "${qty.coerceAtLeast(0)}只" else "${qty.coerceAtLeast(0)} pcs"
        else -> qty.coerceAtLeast(0).toString()
    }
    fun parse(note: String?, config: SeafoodConfig): Pair<String, String> {
        val raw = note.orEmpty().trim()
        val parts = raw.split(Regex("[;；|｜]")).map { it.trim() }.filter { it.isNotEmpty() }
        val fallback = config.methods.first().key
        if (parts.isEmpty()) return fallback to ""
        val first = parts.first().replace(Regex("^(method|做法)[:：]\\s*", RegexOption.IGNORE_CASE), "")
        val method = config.methods.find { m -> (m.aliases + m.en + m.zh).any { normalize(it) == normalize(first) } }
            ?: return fallback to raw
        return method.key to parts.drop(1).joinToString("; ")
            .replace(Regex("^(note|备注)[:：]\\s*", RegexOption.IGNORE_CASE), "").trim()
    }
    fun note(config: SeafoodConfig, key: String, extra: String, lang: String): String {
        val method = config.methods.find { it.key == key } ?: config.methods.first()
        val label = if (lang == "zh") method.zh else method.en
        val trimmed = extra.trim().take((120 - label.length - 2).coerceAtLeast(0)).trim()
        return if (trimmed.isEmpty()) label else "$label; $trimmed"
    }
}

data class DateRange(val from: Instant, val to: Instant)
object DateRules {
    /** JS getTimezoneOffset has the opposite sign to ZoneOffset. */
    fun exportOffsetMinutes(now: Instant, zone: ZoneId): Int = -zone.rules.getOffset(now).totalSeconds / 60
    fun custom(from: LocalDate, to: LocalDate, zone: ZoneId): DateRange {
        require(!from.isAfter(to)) { "时间范围无效" }
        return DateRange(from.atStartOfDay(zone).toInstant(), to.atTime(23, 59, 59).atZone(zone).toInstant())
    }
    private fun jsPreviousMonth(date: LocalDate, months: Long): LocalDate =
        date.withDayOfMonth(1).minusMonths(months).plusDays(date.dayOfMonth.toLong() - 1)
    fun preset(key: String, today: LocalDate, zone: ZoneId): DateRange {
        val end = if (key == "yesterday") today.minusDays(1) else today
        val start = when (key) {
            "yesterday" -> end
            "week" -> today.minusDays(6)
            "month" -> jsPreviousMonth(today, 1)
            "3months" -> jsPreviousMonth(today, 3)
            "year" -> today.withDayOfMonth(1).minusYears(1).plusDays(today.dayOfMonth.toLong() - 1)
            else -> today
        }
        return DateRange(start.atStartOfDay(zone).toInstant(), end.plusDays(1).atStartOfDay(zone).toInstant().minusMillis(1))
    }
    fun months(from: String, to: String): Pair<YearMonth, YearMonth> {
        require(Regex("\\d{4}-\\d{2}").matches(from) && Regex("\\d{4}-\\d{2}").matches(to)) { "时间范围无效" }
        val a = YearMonth.parse(from); val b = YearMonth.parse(to)
        require(!a.isAfter(b)) { "时间范围无效" }
        return a to b
    }
}
