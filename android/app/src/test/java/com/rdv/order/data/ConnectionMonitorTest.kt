package com.rdv.order.data

import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Test
import org.junit.Assert.*

@OptIn(ExperimentalCoroutinesApi::class)
class ConnectionMonitorTest {
    @Test fun confirmsFailureDeduplicatesRetryAndRefreshesOnlyAfterRecovery() = runTest {
        var calls = 0
        var online = false
        val monitor = ConnectionMonitor(backgroundScope, now = { testScheduler.currentTime + 1 }) {
            calls++; delay(10); if (!online) error("Offline")
        }
        monitor.setForeground(true)
        advanceTimeBy(361); runCurrent()
        assertFalse(monitor.state.value.disconnected)
        advanceTimeBy(1010); runCurrent()
        assertTrue(monitor.state.value.disconnected)
        online = true
        monitor.retry(); monitor.retry(); runCurrent()
        advanceTimeBy(11); runCurrent()
        assertEquals(3, calls)
        assertFalse(monitor.state.value.disconnected)
        assertEquals(1L, monitor.state.value.refreshGeneration)
        advanceTimeBy(60_000); runCurrent()
        assertEquals(3, calls)
    }

    @Test fun backgroundCancellationAndStaleFailureDoNotShowOfflineAndForegroundResumes() = runTest {
        var calls = 0
        val monitor = ConnectionMonitor(backgroundScope, now = { testScheduler.currentTime + 1 }) {
            calls++; delay(1000)
        }
        monitor.setForeground(true); advanceTimeBy(351); runCurrent()
        monitor.setForeground(false); runCurrent()
        advanceTimeBy(31_000); runCurrent()
        assertFalse(monitor.state.value.disconnected)
        assertEquals(1, calls)
        monitor.setForeground(true); advanceTimeBy(1351); runCurrent()
        assertEquals(2, calls)
        assertEquals(1L, monitor.state.value.refreshGeneration)
        val stale = monitor.beginRequest()
        monitor.responded(monitor.beginRequest()); runCurrent()
        monitor.failed(stale); runCurrent(); advanceTimeBy(60_000); runCurrent()
        assertEquals(2, calls)
    }
}
