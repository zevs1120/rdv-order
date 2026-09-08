package com.rdv.order.update

import java.io.File
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class UpdateState(
    val checking: Boolean = true,
    val release: AppRelease? = null,
    val downloading: Boolean = false,
    val progress: Int = 0,
    val apk: File? = null,
    val failed: Boolean = false,
    val latestRelease: AppRelease? = null,
    val checkFailed: Boolean = false,
    val initialCheckComplete: Boolean = false,
)

/** One automatic check per process; an explicit Settings check may run again. */
class UpdateController(
    private val currentVersion: Int,
    private val scope: CoroutineScope,
    private val latest: suspend () -> AppRelease,
    private val download: suspend (AppRelease, (Int) -> Unit) -> File,
    private val readKnown: () -> String?,
    private val saveKnown: (String?) -> Unit,
) {
    private val mutable = MutableStateFlow(UpdateState())
    val state = mutable.asStateFlow()
    private var started = false
    fun start(manual: Boolean = false) {
        if (state.value.downloading || state.value.apk != null) return
        if (started && (!manual || state.value.checking)) return
        started = true
        mutable.update { it.copy(checking = true) }
        scope.launch {
            var latestRelease: AppRelease? = null
            var checkFailed = false
            var required = withContext(Dispatchers.IO) {
                runCatching { readKnown()?.let(AppRelease::parse)?.takeIf { it.versionCode > currentVersion } }.getOrNull()
            }
            try {
                val remote = latest().validated()
                latestRelease = remote
                // A stale response must not undo an already confirmed update requirement.
                if (remote.versionCode > currentVersion && remote.versionCode >= (required?.versionCode ?: 0)) required = remote
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                checkFailed = true
            }
            withContext(Dispatchers.IO) { runCatching { saveKnown(required?.encode()) } }
            mutable.value = UpdateState(checking = false, release = required, latestRelease = latestRelease,
                checkFailed = checkFailed, initialCheckComplete = true)
        }
    }
    fun download() {
        val release = state.value.release ?: return
        if (state.value.downloading) return
        mutable.update { it.copy(downloading = true, failed = false, apk = null, progress = 0) }
        scope.launch {
            try {
                val file = download(release) { percent -> mutable.update { it.copy(progress = percent) } }
                mutable.update { it.copy(downloading = false, apk = file) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                mutable.update { it.copy(downloading = false, failed = true) }
            }
        }
    }
    fun installFailed() { mutable.update { it.copy(failed = true, apk = null) } }
}
