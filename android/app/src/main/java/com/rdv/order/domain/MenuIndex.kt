package com.rdv.order.domain

import com.rdv.order.data.MenuItem
import com.rdv.order.data.MenuResponse

data class MenuSelection(val categories: List<String>, val selected: String, val items: List<MenuItem>)

/** Built once per menu response, not once per cart edit or sheet recomposition. */
class MenuIndex(menu: MenuResponse?, private val uncategorized: String) {
    private val items = menu?.items.orEmpty()
    private fun category(item: MenuItem) = item.category ?: uncategorized
    private val categories = (menu?.subcategories.orEmpty() + items.map(::category))
        .filter { it.isNotBlank() }.distinctBy { it.lowercase() }
    private val byCategory = items.groupBy(::category)
    private val searchable = items.map { it to "${it.name} ${it.category.orEmpty()}".lowercase() }

    fun select(input: String, requested: String): MenuSelection {
        val keyword = input.trim().lowercase()
        if (keyword.isEmpty()) {
            val selected = requested.takeIf { it in categories } ?: categories.firstOrNull().orEmpty()
            return MenuSelection(categories, selected, if (selected.isEmpty()) items else byCategory[selected].orEmpty())
        }
        val matched = searchable.filter { keyword in it.second }.map { it.first }
        val matchedCategories = matched.map(::category).toHashSet()
        val visibleCategories = categories.filter { it in matchedCategories }
        val selected = requested.takeIf { it in visibleCategories } ?: visibleCategories.firstOrNull().orEmpty()
        return MenuSelection(visibleCategories, selected, if (selected.isEmpty()) matched else matched.filter { category(it) == selected })
    }
}
