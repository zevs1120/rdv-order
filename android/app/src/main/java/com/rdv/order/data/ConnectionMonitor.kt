package com.rdv.order.data

import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/** One foreground recovery loop. Never owns or replays orders, payments, or print requests. */
data class ConnectionState(val disconnected: Boolean = false, val checking: Boolean = false, val refreshGeneration: Long = 0)
class ConnectionMonitor(private val scope: CoroutineScope, private val now: () -> Long = { android.os.SystemClock.elapsedRealtime() }, private val probe: suspend () -> Unit) {
    private val mutable = MutableStateFlow(ConnectionState())
    val state: StateFlow<ConnectionState> = mutable.asStateFlow()
    private val sequence = AtomicLong()
    private var lastResponse = 0L
    private var foreground = false
    private var stoppedAt = 0L
    private var failures = 0
    private var recovering = false
    private var wakeRequested = false
    private var attempt = 0
    private var scheduled: Job? = null
    private var checking: Job? = null
    private val delays = longArrayOf(1000, 2000, 5000, 10000, 30000)

    fun beginRequest(): Long = sequence.incrementAndGet()
    fun responded(request: Long) { scope.launch { acceptResponse(request) } }
    fun failed(request: Long) { scope.launch {
        if (request >= lastResponse) { recovering = true; schedule(800) }
    } }
    private fun acceptResponse(request: Long, refreshReads: Boolean = false) {
        if (request < lastResponse) return
        lastResponse = request
        val refresh = recovering && failures > 0 && refreshReads
        recovering = false
        wakeRequested = false
        failures = 0
        attempt = 0
        scheduled?.cancel(); scheduled = null
        mutable.update { ConnectionState(refreshGeneration = it.refreshGeneration + if (refresh) 1 else 0) }
    }
    fun setForeground(value: Boolean) {
        if (foreground == value) return
        foreground = value
        if (!value) {
            stoppedAt = now()
            scheduled?.cancel(); scheduled = null
            checking?.cancel()
            return
        }
        if (stoppedAt > 0 && now() - stoppedAt >= 30000 && !recovering) {
            mutable.update { it.copy(refreshGeneration = it.refreshGeneration + 1) }
        }
        networkChanged()
    }
    fun networkChanged() {
        scheduled?.cancel(); scheduled = null
        if (checking?.isActive == true) wakeRequested = true else schedule(350)
    }
    private fun schedule(delayMs: Long) {
        if (!foreground || scheduled?.isActive == true || checking?.isActive == true) return
        scheduled = scope.launch {
            delay(delayMs)
            scheduled = null
            retry()
        }
    }
    fun retry() {
        if (!foreground || checking?.isActive == true) return
        scheduled?.cancel(); scheduled = null
        checking = scope.launch {
            val request = beginRequest()
            mutable.update { it.copy(checking = true) }
            try {
                withTimeout(4500) { probe() }
                acceptResponse(request, refreshReads = true)
            } catch (e: Exception) {
                if (e is CancellationException && e !is TimeoutCancellationException) throw e
                if (foreground && request >= lastResponse) {
                    recovering = true
                    failures++
                    mutable.update { it.copy(disconnected = it.disconnected || failures >= 2) }
                }
            } finally {
                mutable.update { it.copy(checking = false) }
                checking = null
                if (wakeRequested) { wakeRequested = false; schedule(350) }
                else if (recovering && foreground) schedule(delays[(attempt++).coerceAtMost(delays.lastIndex)])
            }
        }
    }
}
