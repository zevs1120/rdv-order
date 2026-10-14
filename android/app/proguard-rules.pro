# kotlinx.serialization and OkHttp ship their consumer rules.
# Keep the source line table for actionable, token-free crash traces.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
# Xprinter's official prebuilt SDK includes optional USB/serial transports.
-keep class net.posprinter.** { *; }
# The SDK stores this callback weakly. Its write-only strong owner must survive
# R8, otherwise GC discards it while connect() is waiting for the UDP response.
-keepclassmembers class com.rdv.order.data.XprinterLocalConnector {
    net.posprinter.posprinterface.UdpCallback discoveryCallback;
}
