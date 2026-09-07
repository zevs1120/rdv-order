package com.rdv.order.ui

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.*

object RdvColors {
    val Brand = Color(0xFF8F1520)
    val Background = Color(0xFFF8FAFC)
    val Surface = Color.White
    val Text = Color(0xFF0F172A)
    val Secondary = Color(0xFF475569)
    val Border = Color(0xFFE2E8F0)
    val Success = Color(0xFF1F8F5F)
    val Danger = Color(0xFFC53030)
}

@Composable fun RdvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(primary = RdvColors.Brand, onPrimary = Color.White,
            background = RdvColors.Background, surface = RdvColors.Surface, onSurface = RdvColors.Text,
            onSurfaceVariant = RdvColors.Secondary, outline = RdvColors.Border, error = RdvColors.Danger),
        typography = Typography(
            bodyLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
            bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
            bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 17.sp),
            titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold),
            titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
            labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
        ), content = content)
}

@Composable fun RdvButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    secondary: Boolean = false, danger: Boolean = false, enabled: Boolean = true, loading: Boolean = false) {
    val color = if (danger) RdvColors.Danger else RdvColors.Brand
    Button(onClick = onClick, modifier = modifier.heightIn(min = 48.dp), enabled = enabled && !loading,
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = if (secondary) Color.White else color,
            contentColor = if (secondary) (if (danger) color else RdvColors.Text) else Color.White),
        border = if (secondary) BorderStroke(1.dp, if (danger) color.copy(alpha = .35f) else RdvColors.Border) else null,
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp)) {
        if (loading) { CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp); Spacer(Modifier.width(6.dp)) }
        Text(label)
    }
}
@Composable fun RdvCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier, shape = RoundedCornerShape(16.dp), color = Color.White, border = BorderStroke(1.dp, RdvColors.Border)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}
@Composable fun RdvField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier,
    numeric: Boolean = false, password: Boolean = false, enabled: Boolean = true, singleLine: Boolean = true) {
    OutlinedTextField(value, onChange, modifier.fillMaxWidth(), label = { Text(label) },
        singleLine = singleLine, enabled = enabled, shape = RoundedCornerShape(12.dp),
        keyboardOptions = KeyboardOptions(keyboardType = when { password -> KeyboardType.Password; numeric -> KeyboardType.Decimal; else -> KeyboardType.Text }),
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = RdvColors.Border))
}
@Composable fun RdvChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    FilterChip(selected, onClick, label = { Text(label) }, modifier = modifier.heightIn(min = 48.dp), enabled = enabled,
        shape = RoundedCornerShape(24.dp), colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = RdvColors.Brand.copy(alpha = .07f), selectedLabelColor = RdvColors.Brand))
}
@Composable fun Stepper(value: Int, onChange: (Int) -> Unit, label: String = value.toString(), max: Int = Int.MAX_VALUE, min: Int = 0, enabled: Boolean = true) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        RdvButton("−", { onChange((value - 1).coerceAtLeast(min)) }, Modifier.width(48.dp), secondary = true, enabled = enabled && value > min)
        Text(label, fontWeight = FontWeight.SemiBold)
        RdvButton("+", { onChange(if (value < max) value + 1 else max) }, Modifier.width(48.dp), secondary = true, enabled = enabled && value < max)
    }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun RdvSheet(title: String, onClose: () -> Unit, busy: Boolean = false, footer: (@Composable RowScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true,
        confirmValueChange = { !busy || it != SheetValue.Hidden })
    ModalBottomSheet(onDismissRequest = { if (!busy) onClose() }, sheetState = sheetState,
        containerColor = Color.White, shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)) {
        Column(Modifier.fillMaxWidth().imePadding().padding(horizontal = 16.dp).padding(bottom = 16.dp).heightIn(max = 640.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
            if (footer != null) { HorizontalDivider(color = RdvColors.Border); Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = footer) }
        }
    }
}
@Composable fun ErrorPanel(error: String, onDismiss: () -> Unit) {
    if (error.isEmpty()) return
    Surface(color = RdvColors.Danger.copy(alpha = .07f), modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp)) {
        Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(error, color = RdvColors.Danger, modifier = Modifier.weight(1f).padding(vertical = 8.dp))
            TextButton(onClick = onDismiss) { Text("×", fontSize = 22.sp) }
        }
    }
}
