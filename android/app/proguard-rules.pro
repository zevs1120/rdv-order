# kotlinx.serialization and OkHttp ship their consumer rules.
# Keep the source line table for actionable, token-free crash traces.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
# Xprinter's official prebuilt SDK includes optional USB/serial transports.
-keep class net.posprinter.** { *; }
