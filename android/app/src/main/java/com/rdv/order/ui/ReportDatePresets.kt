package com.rdv.order.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable fun ReportDatePresets(vm: RdvViewModel, value: String, enabled: Boolean, onChange: (String) -> Unit) {
    val presets = listOf(
        Triple("today", "income.today", vm.either("当天", "Today")),
        Triple("yesterday", "income.yesterday", vm.either("昨天", "Yest.")),
        Triple("week", "income.week", vm.either("近1周", "1 wk")),
        Triple("month", "income.month", vm.either("近1月", "1 mo")),
        Triple("3months", "income.threeMonths", vm.either("近3月", "3 mo")),
        Triple("year", "income.year", vm.either("近1年", "1 yr"))
    )
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        presets.forEach { (key, labelKey, label) ->
            OutlinedButton(onClick = { onChange(key) }, enabled = enabled,
                modifier = Modifier.weight(1f).heightIn(min = 48.dp).semantics {
                    selected = value == key
                    contentDescription = vm.text(labelKey)
                }, shape = RectangleShape, contentPadding = PaddingValues(horizontal = 1.dp),
                border = BorderStroke(1.dp, if (value == key) RdvColors.Brand else RdvColors.ControlBorder),
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = if (value == key) RdvColors.Brand.copy(alpha = .04f) else Color.White,
                    contentColor = if (value == key) RdvColors.Brand else RdvColors.Secondary)) {
                Text(label, fontSize = 12.sp, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}
