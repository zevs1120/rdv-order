package com.rdv.order.ui

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
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
    val OrderSection = Color(0xFFE8EDF1)
    val OrderCanvas = Color(0xFFF1F4F6)
    val Text = Color(0xFF0F172A)
    val Secondary = Color(0xFF475569)
    val Border = Color(0xFFE2E8F0)
    val ControlBorder = Color(0xFF94A3B8)
    val Success = Color(0xFF1F8F5F)
    val Danger = Color(0xFFC53030)
}

val LocalLinearSettings = staticCompositionLocalOf { false }
val LocalFlatOrdering = staticCompositionLocalOf { false }

private fun Modifier.bottomRule(color: Color = RdvColors.Border) = drawBehind {
    val stroke = 1.dp.toPx()
    drawLine(color, Offset(0f, size.height - stroke / 2), Offset(size.width, size.height - stroke / 2), stroke)
}

@Composable fun RdvTheme(linearSettings: Boolean = false, flatOrdering: Boolean = false, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalLinearSettings provides linearSettings, LocalFlatOrdering provides flatOrdering) {
    MaterialTheme(
        shapes = if (linearSettings || flatOrdering) Shapes(
            extraSmall = RoundedCornerShape(0.dp), small = RoundedCornerShape(0.dp),
            medium = RoundedCornerShape(0.dp), large = RoundedCornerShape(0.dp), extraLarge = RoundedCornerShape(0.dp)
        ) else Shapes(),
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
}

@Composable fun RdvButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    secondary: Boolean = false, danger: Boolean = false, enabled: Boolean = true, loading: Boolean = false,
    icon: ImageVector? = null, iconLabel: String? = null) {
    val color = if (danger) RdvColors.Danger else RdvColors.Brand
    val linear = LocalLinearSettings.current || LocalFlatOrdering.current
    val lineColor = if (danger) color.copy(alpha = .5f) else if (linear) RdvColors.ControlBorder else RdvColors.Border
    Button(onClick = onClick, modifier = modifier.heightIn(min = 48.dp), enabled = enabled && !loading,
        shape = if (linear) RectangleShape else RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = if (secondary) Color.White else color,
            contentColor = if (secondary) (if (danger) color else RdvColors.Text) else Color.White),
        border = if (secondary) BorderStroke(1.dp, lineColor) else null,
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp)) {
        if (loading) { CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp); Spacer(Modifier.width(6.dp)) }
        if (icon != null) Icon(icon, iconLabel, Modifier.size(20.dp)) else Text(label)
    }
}
@Composable fun RdvCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    if (LocalLinearSettings.current) {
        Column(modifier.bottomRule().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
        return
    }
    Surface(modifier, shape = if (LocalFlatOrdering.current) RectangleShape else RoundedCornerShape(16.dp),
        color = Color.White, border = if (LocalFlatOrdering.current) null else BorderStroke(1.dp, RdvColors.Border)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}
@Composable fun RdvField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier,
    numeric: Boolean = false, password: Boolean = false, enabled: Boolean = true, singleLine: Boolean = true,
    trailingIcon: (@Composable () -> Unit)? = null) {
    if (LocalLinearSettings.current || LocalFlatOrdering.current) {
        RdvLineField(label, value, onChange, modifier, password = password, enabled = enabled, numeric = numeric, singleLine = singleLine, trailingIcon = trailingIcon)
        return
    }
    OutlinedTextField(value, onChange, modifier.fillMaxWidth(), label = { Text(label) },
        singleLine = singleLine, enabled = enabled, shape = RoundedCornerShape(12.dp),
        keyboardOptions = KeyboardOptions(keyboardType = when { password -> KeyboardType.Password; numeric -> KeyboardType.Decimal; else -> KeyboardType.Text }),
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        trailingIcon = trailingIcon,
        colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = RdvColors.Border))
}
@Composable fun RdvLineField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier,
    password: Boolean = false, enabled: Boolean = true, numeric: Boolean = false, singleLine: Boolean = true,
    trailingIcon: (@Composable () -> Unit)? = null) {
    TextField(value, onChange, modifier.fillMaxWidth(), label = { Text(label) }, singleLine = singleLine, enabled = enabled,
        shape = RoundedCornerShape(0.dp),
        keyboardOptions = KeyboardOptions(keyboardType = when { password -> KeyboardType.Password; numeric -> KeyboardType.Decimal; else -> KeyboardType.Text }),
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        trailingIcon = trailingIcon,
        colors = TextFieldDefaults.colors(
            focusedContainerColor = if (LocalFlatOrdering.current) RdvColors.OrderCanvas else Color.Transparent,
            unfocusedContainerColor = if (LocalFlatOrdering.current) RdvColors.OrderCanvas else Color.Transparent,
            disabledContainerColor = Color.Transparent,
            focusedIndicatorColor = RdvColors.Brand,
            unfocusedIndicatorColor = RdvColors.Border,
            disabledIndicatorColor = RdvColors.Border.copy(alpha = .55f)))
}
@Composable fun RdvChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    if (LocalFlatOrdering.current) {
        FilterChip(selected, onClick, label = { Text(label, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            textDecoration = if (selected) androidx.compose.ui.text.style.TextDecoration.Underline else null) }, enabled = enabled,
            modifier = modifier.heightIn(min = 48.dp), shape = RectangleShape,
            border = BorderStroke(1.dp, if (selected) RdvColors.Brand else RdvColors.ControlBorder),
            colors = FilterChipDefaults.filterChipColors(containerColor = Color.Transparent,
                selectedContainerColor = RdvColors.Brand, selectedLabelColor = Color.White))
        return
    }
    if (LocalLinearSettings.current) {
        FilterChip(selected, onClick, label = { Text(label) }, enabled = enabled,
            modifier = modifier.heightIn(min = 48.dp),
            shape = RectangleShape, border = BorderStroke(1.dp, if (selected) RdvColors.Brand else RdvColors.ControlBorder),
            colors = FilterChipDefaults.filterChipColors(containerColor = Color.White,
                selectedContainerColor = RdvColors.Brand.copy(alpha = .08f), selectedLabelColor = RdvColors.Brand))
        return
    }
    FilterChip(selected, onClick, label = { Text(label) }, modifier = modifier.heightIn(min = 48.dp), enabled = enabled,
        shape = RoundedCornerShape(24.dp), colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = RdvColors.Brand.copy(alpha = .07f), selectedLabelColor = RdvColors.Brand))
}
@Composable fun Stepper(value: Int, onChange: (Int) -> Unit, label: String = value.toString(), max: Int = Int.MAX_VALUE, min: Int = 0, enabled: Boolean = true, lang: String = "zh") {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        RdvButton("", { onChange((value - 1).coerceAtLeast(min)) }, Modifier.width(48.dp), secondary = true, enabled = enabled && value > min,
            icon = Icons.Outlined.Remove, iconLabel = if (lang == "en") "Decrease quantity" else "减少数量")
        Text(label, fontWeight = FontWeight.SemiBold)
        RdvButton("", { onChange(if (value < max) value + 1 else max) }, Modifier.width(48.dp), secondary = true, enabled = enabled && value < max,
            icon = Icons.Outlined.Add, iconLabel = if (lang == "en") "Increase quantity" else "增加数量")
    }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun RdvSheet(title: String, onClose: () -> Unit, busy: Boolean = false, footer: (@Composable RowScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true,
        confirmValueChange = { !busy || it != SheetValue.Hidden })
    ModalBottomSheet(onDismissRequest = { if (!busy) onClose() }, sheetState = sheetState,
        containerColor = Color.White, shape = if (LocalLinearSettings.current || LocalFlatOrdering.current) RectangleShape else RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)) {
        Column(Modifier.fillMaxWidth().imePadding().padding(horizontal = 16.dp).padding(bottom = 16.dp).heightIn(max = 640.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())
                .then(if (LocalFlatOrdering.current) Modifier.background(RdvColors.OrderCanvas).padding(8.dp) else Modifier),
                verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
            if (footer != null) { HorizontalDivider(color = RdvColors.Border); Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = footer) }
        }
    }
}
@Composable fun ErrorPanel(error: String, onDismiss: () -> Unit, closeLabel: String) {
    if (error.isEmpty()) return
    Surface(color = RdvColors.Danger.copy(alpha = .07f), modifier = Modifier.fillMaxWidth(),
        shape = if (LocalLinearSettings.current || LocalFlatOrdering.current) RectangleShape else RoundedCornerShape(10.dp)) {
        Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(error, color = RdvColors.Danger, modifier = Modifier.weight(1f).padding(vertical = 8.dp))
            IconButton(onClick = onDismiss) { Icon(Icons.Outlined.Close, closeLabel, Modifier.size(20.dp)) }
        }
    }
}

@Composable fun RdvTextButton(onClick: () -> Unit, enabled: Boolean = true, content: @Composable RowScope.() -> Unit) {
    if (LocalLinearSettings.current || LocalFlatOrdering.current) {
        OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp), shape = RectangleShape,
            border = BorderStroke(1.dp, RdvColors.ControlBorder), content = content)
        return
    }
    TextButton(onClick = onClick, enabled = enabled, shape = if (LocalLinearSettings.current) RectangleShape else RoundedCornerShape(24.dp),
        content = content)
}

@Composable fun RdvToolbarButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
    content: @Composable () -> Unit) {
    IconButton(onClick = onClick, modifier = modifier, enabled = enabled, content = content)
}
