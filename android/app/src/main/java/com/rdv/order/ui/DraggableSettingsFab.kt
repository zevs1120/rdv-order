package com.rdv.order.ui

import android.content.Context
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/** Position is a UI preference only, independent of sessions and order drafts. */
@Composable fun DraggableSettingsFab(label: String, lang: String, enabled: Boolean, onClick: () -> Unit) {
    val context = LocalContext.current
    val preferences = remember(context) { context.getSharedPreferences("rdv_ui", Context.MODE_PRIVATE) }
    fun initial(key: String) = preferences.getFloat(key, 1f).takeIf { it.isFinite() }?.coerceIn(0f, 1f) ?: 1f
    var x by rememberSaveable { mutableFloatStateOf(initial("settings_x")) }
    var y by rememberSaveable { mutableFloatStateOf(initial("settings_y")) }
    fun save() { preferences.edit().putFloat("settings_x", x).putFloat("settings_y", y).apply() }

    // The caller supplies the area below the toolbar, above system bars and keyboard.
    BoxWithConstraints(Modifier.fillMaxSize().padding(14.dp)) {
        val density = LocalDensity.current
        val maxX = with(density) { (maxWidth - 60.dp).toPx().coerceAtLeast(0f) }
        val maxY = with(density) { (maxHeight - 60.dp).toPx().coerceAtLeast(0f) }
        val step = with(density) { 24.dp.toPx() }
        fun move(dx: Float, dy: Float): Boolean {
            x = if (maxX > 0f) (x + dx / maxX).coerceIn(0f, 1f) else 0f
            y = if (maxY > 0f) (y + dy / maxY).coerceIn(0f, 1f) else 0f
            save()
            return true
        }
        SmallFloatingActionButton(
            onClick = { if (enabled) onClick() },
            modifier = Modifier.absoluteOffset { IntOffset((x * maxX).roundToInt(), (y * maxY).roundToInt()) }
                .size(60.dp).testTag("settings")
                .pointerInput(maxX, maxY) {
                    detectDragGestures(onDragEnd = { save() }, onDragCancel = { save() }) { change, delta ->
                        change.consume()
                        x = if (maxX > 0f) (x + delta.x / maxX).coerceIn(0f, 1f) else 0f
                        y = if (maxY > 0f) (y + delta.y / maxY).coerceIn(0f, 1f) else 0f
                    }
                }
                .onPreviewKeyEvent { event ->
                    if (event.type != KeyEventType.KeyDown) false else when (event.key) {
                        Key.DirectionLeft -> move(-step, 0f)
                        Key.DirectionRight -> move(step, 0f)
                        Key.DirectionUp -> move(0f, -step)
                        Key.DirectionDown -> move(0f, step)
                        else -> false
                    }
                }
                .semantics {
                    if (!enabled) disabled()
                    customActions = listOf(
                        CustomAccessibilityAction(if (lang == "en") "Move left" else "向左移动") { move(-step, 0f) },
                        CustomAccessibilityAction(if (lang == "en") "Move right" else "向右移动") { move(step, 0f) },
                        CustomAccessibilityAction(if (lang == "en") "Move up" else "向上移动") { move(0f, -step) },
                        CustomAccessibilityAction(if (lang == "en") "Move down" else "向下移动") { move(0f, step) }
                    )
                },
            shape = CircleShape, containerColor = Color.White, contentColor = RdvColors.Text
        ) { Icon(Icons.Outlined.Settings, label, Modifier.size(28.dp)) }
    }
}
