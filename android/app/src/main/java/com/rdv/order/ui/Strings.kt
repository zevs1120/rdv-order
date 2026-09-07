package com.rdv.order.ui

import android.content.Context
import com.rdv.order.data.*
import java.util.Locale
import kotlinx.serialization.json.*

class Strings(context: Context) {
    private val dictionaries = RdvJson.parseToJsonElement(context.assets.open("translations.json").bufferedReader().use { it.readText() }).jsonObject
    private val pairs = RdvJson.parseToJsonElement(context.assets.open("menu-translations.json").bufferedReader().use { it.readText() }).jsonArray
    private val errors = RdvJson.parseToJsonElement(context.assets.open("server-errors.json").bufferedReader().use { it.readText() }).jsonObject
    val permissions = RdvJson.parseToJsonElement(context.assets.open("permissions.json").bufferedReader().use { it.readText() }).jsonObject
    val adminDefaults = RdvJson.parseToJsonElement(context.assets.open("admin-defaults.json").bufferedReader().use { it.readText() }).jsonObject
    fun text(lang: String, key: String, fallback: String = key): String = dictionaries[lang]?.jsonObject?.get(key)?.jsonPrimitive?.content ?: fallback
    fun menu(lang: String, name: String): String {
        val value = name.trim()
        val from = if (lang == "zh") "en" else "zh"
        return pairs.lastOrNull { it.jsonObject.text(from).equals(value, true) }?.jsonObject?.text(lang) ?: value
    }
    fun category(lang: String, value: String): String {
        val localized = menu(lang, value)
        if (lang == "zh") return when {
            localized.contains("帆船回响") -> "帆船回响"
            localized.contains("海岛白日梦") -> "海岛白日梦"
            else -> localized
        }
        val compact = localized.replace(Regex("\\s+(food|foods|cuisine|dishes|menu|specials)$", RegexOption.IGNORE_CASE), "")
            .replace(Regex("\\s*/\\s*.*"), "").trim()
        return if (compact.length <= 11) compact else compact.split(Regex("\\s+"))[0]
    }
    fun error(lang: String, error: Throwable): String {
        if (error is java.io.InterruptedIOException) return text(lang, "order.submitTimeout")
        val message = error.message.orEmpty()
        if (lang == "zh") return message.ifBlank { "请求失败" }
        if (message == "尚未配置门店地址") return "The store connection has not been configured."
        if (message == "本机保存的数据无法读取，请联系管理员") return "Saved data cannot be read. Contact your administrator."
        if (error is java.net.UnknownHostException || error is java.net.ConnectException) return "Unable to connect. Check network and retry."
        return errors[message]?.jsonPrimitive?.content ?: message.ifBlank { "Request failed" }
    }
    companion object { fun systemLanguage() = if (Locale.getDefault().language.startsWith("zh")) "zh" else "en" }
}
