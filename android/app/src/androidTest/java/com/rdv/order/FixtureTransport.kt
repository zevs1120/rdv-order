package com.rdv.order

import com.rdv.order.data.*
import java.io.IOException
import java.util.Base64
import kotlinx.serialization.json.*

class TestStore : KeyValueStore {
    val values = mutableMapOf("language" to "en")
    override fun get(key: String) = values[key]
    override fun put(key: String, value: String) { values[key] = value }
    override fun remove(key: String) { values.remove(key) }
}

/** Test-only server implementation. No sockets, production credentials, or printer calls. */
class FixtureTransport : Transport {
    data class Call(val path: String, val method: String, val body: JsonElement?, val key: String?)
    val calls = mutableListOf<Call>()
    var loseFirstSubmitResponse = false
    var sessionRejected = false
    var role = "waiter"
    private val opened = mutableMapOf<String, Int>()
    private val savedOrders = linkedMapOf<String, Pair<SubmitPayload, String>>()
    val rice = MenuItem("11111111-1111-4111-8111-111111111111", "Rice", 80, "Rice")
    val fish = MenuItem("22222222-2222-4222-8222-222222222222", "Grouper", 150, "Seasonal Seafood")
    val tea = MenuItem("33333333-3333-4333-8333-333333333333", "English Breakfast Tea", 120, "Tea")
    val longDish = MenuItem("44444444-4444-4444-8444-444444444444", "Sichuan Spicy Chicken Cubes with Vegetables", 520, "Rice")
    private val categories = listOf(MajorCategory("lunch", "午餐", "Lunch"), MajorCategory("beverage", "饮品", "Beverage"))
    override suspend fun request(path: String, method: String, body: JsonElement?, query: Map<String, String>, idempotencyKey: String?, timeoutMs: Long, retries: Int, authenticated: Boolean): ApiResponse {
        calls.add(Call(path, method, body, idempotencyKey))
        if (sessionRejected && authenticated) throw ApiException(401, "未登录")
        val request = body as? JsonObject ?: JsonObject(emptyMap())
        val result: String = when (path) {
            "/api/login" -> {
                role = if (request.text("username") == "manager") "manager" else "waiter"
                val claims = Base64.getUrlEncoder().withoutPadding().encodeToString("{\"userId\":\"test-$role\",\"role\":\"$role\"}".toByteArray())
                RdvJson.encodeToString(Session("test.$claims.signature", role))
            }
            "/api/tables" -> if (method == "POST") {
                val table = request.text("tableNo"); val guests = request.number("guestCount").toInt(); opened[table] = guests
                RdvJson.encodeToString(OpenResponse(OpenSession(table, guests, "2026-09-07T00:00:00Z")))
            } else RdvJson.encodeToString(TablesResponse((1..11).map { number ->
                val table = "%02d".format(number)
                TableInfo(table, listOf(table), if (number <= 3) 1 else if (number <= 6) 2 else 3,
                    if (table in opened) "open" else "idle", opened[table], if (table in opened) "2026-09-07T00:00:00Z" else null,
                    if (table in opened) bill(table).totalAmount else 0)
            }))
            "/api/menu" -> {
                val shift = query["shift"] ?: "lunch"
                RdvJson.encodeToString(MenuResponse(if (shift == "beverage") listOf(tea) else listOf(rice, fish, longDish), if (shift == "beverage") listOf("Tea") else listOf("Rice", "Seasonal Seafood"), categories, shift))
            }
            "/api/orders" -> {
                val payload = RdvJson.decodeFromJsonElement<SubmitPayload>(body!!)
                val key = idempotencyKey ?: error("Missing idempotency key")
                val existing = savedOrders[key]
                val id = existing?.second ?: "order-${savedOrders.size + 1}"
                savedOrders[key] = payload to id
                if (loseFirstSubmitResponse) { loseFirstSubmitResponse = false; throw IOException("response lost after commit") }
                RdvJson.encodeToString(SubmissionResult(id, existing != null))
            }
            "/api/orders/request-status" -> savedOrders[query["key"]]?.let { RdvJson.encodeToString(SubmissionStatus(true, it.second)) } ?: "{\"found\":false}"
            "/api/tables/bill" -> RdvJson.encodeToString(bill(query["tableNo"] ?: "01"))
            "/api/tables/print-bill" -> "{\"queued\":true}"
            "/api/tables/checkout" -> {
                val table = request.text("tableNo"); val bill = bill(table); opened.remove(table)
                RdvJson.encodeToString(CheckoutResult(bill.orders.size, bill.totalAmount))
            }
            "/api/manage/orders" -> "{\"orders\":[],\"viewerRole\":\"$role\"}"
            "/api/manage/income" -> "{\"orderCount\":2,\"totalAmount\":600,\"byDay\":[{\"day\":\"2026-09-07T00:00:00Z\",\"order_count\":2,\"amount\":600}]}"
            "/api/manage/hot-items" -> "{\"hotItems\":[{\"name\":\"Rice\",\"qty\":3}]}"
            "/api/pricing/rules" -> "{\"rules\":[{\"id\":\"fee-1\",\"name\":\"Service Fee\",\"charge_type\":\"service_fee\",\"mode\":\"percent\",\"value\":10,\"is_active\":true,\"sort_order\":10}]}"
            "/api/devices" -> "{\"devices\":[{\"device_code\":\"test-printer\",\"label\":\"Kitchen\",\"status\":\"online\",\"device_type\":\"printer\",\"fail_count\":0}],\"printQueue\":{\"pending\":0,\"failed\":0},\"alerts\":[]}"
            "/api/print/health" -> "{\"provider\":{\"primary\":\"cloud\"},\"ready\":true,\"warnings\":[]}"
            "/api/admin/permissions" -> "{\"rows\":[{\"role\":\"waiter\",\"permission\":\"order.create\",\"allowed\":true}]}"
            "/api/admin/menu-items" -> jsonBody("items" to RdvJson.encodeToJsonElement(listOf(rice, fish, tea))).toString()
            "/api/admin/menu-categories" -> jsonBody("majorCategories" to RdvJson.encodeToJsonElement(categories)).toString()
            "/api/admin/menu-subcategories" -> "{\"subcategories\":[{\"id\":\"sub-1\",\"shift_key\":\"beverage\",\"name\":\"Tea\"}]}"
            else -> "{}"
        }
        return ApiResponse(result, "application/json", null)
    }
    private fun bill(table: String): Bill {
        val menu = listOf(rice, fish, tea, longDish).associateBy { it.id }
        val orders = savedOrders.values.filter { it.first.tableNo == table }.map { (payload, id) ->
            val items = payload.items.map { item ->
                val dish = menu.getValue(item.menuItemId)
                BillItem(dish.id, dish.name, item.qty, dish.price * item.qty, item.note)
            }
            BillOrder(id, "submitted", totalAmount = items.sumOf { it.amount }, itemAmount = items.sumOf { it.amount }, items = items)
        }
        return Bill(table, opened[table] ?: 2, orders.flatMap { it.items }, orders, orders.sumOf { it.items.sumOf { item -> item.qty } }, orders.sumOf { it.totalAmount })
    }
}
