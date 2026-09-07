package com.rdv.order.update

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.PackageInfo
import android.os.Build
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import java.io.File

@Suppress("DEPRECATION") // GET_SIGNATURES also supports our Android 8 baseline; updates retain the existing key.
fun verifyUpdatePackage(context: Context, file: File, release: AppRelease) {
    val pm = context.packageManager
    val archive = requireNotNull(pm.getPackageArchiveInfo(file.path, PackageManager.GET_SIGNATURES))
    val installed = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
    verifyUpdateIdentity(archive, installed, release)
}

@Suppress("DEPRECATION")
internal fun verifyUpdateIdentity(archive: PackageInfo, installed: PackageInfo, release: AppRelease) {
    require(archive.packageName == installed.packageName)
    require(PackageInfoCompat.getLongVersionCode(archive) == release.versionCode.toLong())
    require(archive.versionName == release.version)
    require(release.versionCode > PackageInfoCompat.getLongVersionCode(installed))
    require(requireNotNull(archive.applicationInfo).minSdkVersion <= Build.VERSION.SDK_INT)
    val expected = requireNotNull(installed.signatures).map { it.toCharsString() }.toSet()
    require(expected.isNotEmpty() && archive.signatures?.map { it.toCharsString() }?.toSet() == expected)
}

fun updateInstallIntent(context: Context, file: File): Intent = Intent(Intent.ACTION_VIEW)
    .setDataAndType(FileProvider.getUriForFile(context, "${context.packageName}.updates", file), "application/vnd.android.package-archive")
    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
