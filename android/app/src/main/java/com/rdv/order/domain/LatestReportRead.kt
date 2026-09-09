package com.rdv.order.domain

import kotlinx.coroutines.*

/** Serial latest-selection reads. A changed filter doesn't abandon running server SQL. */
class LatestReportRead<T>(private val scope: CoroutineScope) {
    private var job: Job? = null
    private var generation = 0L
    private var pending: (suspend () -> T)? = null
    private var success: (T) -> Unit = {}
    private var failure: (Throwable) -> Unit = {}

    fun submit(read: suspend () -> T, onSuccess: (T) -> Unit, onFailure: (Throwable) -> Unit) {
        generation++
        pending = read; success = onSuccess; failure = onFailure
        if (job?.isActive == true) return
        job = scope.launch {
            while (pending != null) {
                // Wait for rapid taps to settle; only the final selection is sent.
                var selected: Long
                do { selected = generation; delay(180) } while (selected != generation)
                val next = pending ?: break
                pending = null
                try {
                    val result = next()
                    ensureActive()
                    if (selected == generation) success(result)
                } catch (error: Throwable) {
                    if (error is CancellationException) throw error
                    if (selected == generation) failure(error)
                }
            }
        }
    }

    fun cancel() { generation++; pending = null; job?.cancel(); job = null }
}
