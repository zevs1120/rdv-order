package com.rdv.order.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

val RdvJson = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }

@Serializable data class Session(val token: String, val role: String)
@Serializable data class TableInfo(
    val tableNo: String,
    val baseTables: List<String> = emptyList(),
    val column: Int = 1,
    val status: String = "idle",
    val guestCount: Int? = null,
    val openedAt: String? = null,
    val currentAmount: Long = 0,
)
@Serializable data class TablesResponse(val tables: List<TableInfo>)
@Serializable data class OpenSession(val tableNo: String, val guestCount: Int, val openedAt: String? = null)
@Serializable data class OpenResponse(val session: OpenSession)
@Serializable data class MajorCategory(
    val key: String,
    @SerialName("label_zh") val zh: String,
    @SerialName("label_en") val en: String,
    @SerialName("menu_group") val menuGroup: String = "lunch_dinner",
)
@Serializable data class MenuItem(
    val id: String,
    val name: String,
    val price: Long,
    val category: String? = null,
    val description: String? = null,
    val allergens: List<String>? = null,
    @SerialName("menu_group") val menuGroup: String = "lunch_dinner",
    @SerialName("item_type") val itemType: String = "single",
    val code: Int? = null,
    @SerialName("option_groups") val optionGroups: List<MenuOptionGroup> = emptyList(),
    @SerialName("is_complimentary") val isComplimentary: Boolean = false,
)
@Serializable data class MenuOption(val id: String, @SerialName("label_en") val en: String,
    @SerialName("label_zh") val zh: String? = null, @SerialName("price_delta") val priceDelta: Long = 0)
@Serializable data class MenuOptionGroup(val id: String, @SerialName("label_en") val en: String,
    @SerialName("label_zh") val zh: String? = null, val options: List<MenuOption>)
@Serializable data class MenuResponse(
    val items: List<MenuItem>,
    val subcategories: List<String> = emptyList(),
    val majorCategories: List<MajorCategory> = emptyList(),
    val shift: String = "lunch",
    val searchItems: List<MenuItem> = emptyList(),
)
@Serializable data class CartLine(val item: MenuItem, val qty: Int, val note: String? = null, val choices: Map<String, String> = emptyMap())
@Serializable data class Draft(
    val tableNo: String,
    val openedAt: String? = null,
    val guests: Int = 2,
    val shift: String = "lunch",
    val keyword: String = "",
    val category: String = "",
    val lines: List<CartLine> = emptyList(),
    val updatedAt: Long = 0,
)
@Serializable data class SubmitItem(val menuItemId: String, val qty: Int, val note: String? = null, val choices: Map<String, String> = emptyMap())
@Serializable data class SubmitPayload(val tableNo: String, val guestCount: Int, val shift: String, val items: List<SubmitItem>)
@Serializable data class PendingSubmission(val key: String, val payload: SubmitPayload, val createdAt: Long, val openedAt: String? = null)
@Serializable data class SubmissionResult(val orderId: String, val deduped: Boolean = false)
@Serializable data class SubmissionStatus(val found: Boolean, val orderId: String? = null)
@Serializable data class CheckoutResult(val orderCount: Int, val totalAmount: Long)
@Serializable data class BillItem(
    @SerialName("menu_item_id") val menuItemId: String,
    val name: String,
    val qty: Int,
    val amount: Long,
    val note: String? = null,
    @SerialName("order_item_id") val orderItemId: String? = null,
)
@Serializable data class Charge(
    val id: String,
    @SerialName("charge_type") val type: String,
    val amount: Long,
    val mode: String = "amount",
    val value: Double = 0.0,
    val note: String? = null,
)
@Serializable data class BillOrder(
    val id: String,
    val status: String,
    @SerialName("cancelled_at") val cancelledAt: String? = null,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("item_amount") val itemAmount: Long = 0,
    @SerialName("charge_amount") val chargeAmount: Long = 0,
    @SerialName("total_amount") val totalAmount: Long = 0,
    val items: List<BillItem> = emptyList(),
    val charges: List<Charge> = emptyList(),
)
@Serializable data class Bill(
    val tableNo: String,
    val guestCount: Int,
    val items: List<BillItem>,
    val orders: List<BillOrder>,
    val totalQty: Int,
    val totalAmount: Long,
)
@Serializable data class CachedMenu(val response: MenuResponse, val savedAt: Long)
