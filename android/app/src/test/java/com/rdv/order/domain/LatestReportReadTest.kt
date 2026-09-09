package com.rdv.order.domain

import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Test
import org.junit.Assert.*

@OptIn(ExperimentalCoroutinesApi::class)
class LatestReportReadTest {
    @Test fun burstReadsAreSerialAndOnlyNewestResultOrErrorIsPublished() = runTest {
        val reader = LatestReportRead<String>(backgroundScope)
        val started = mutableListOf<String>()
        val results = mutableListOf<String>()
        val errors = mutableListOf<Throwable>()
        val release = CompletableDeferred<Unit>()
        reader.submit({ started += "year"; release.await(); "year" }, results::add, errors::add)
        advanceTimeBy(181)
        reader.submit({ started += "quarter"; "quarter" }, results::add, errors::add)
        reader.submit({ started += "month"; "month" }, results::add, errors::add)
        advanceTimeBy(500)
        assertEquals(listOf("year"), started)
        release.complete(Unit)
        advanceTimeBy(181)
        assertEquals(listOf("year", "month"), started)
        assertEquals(listOf("month"), results)
        assertTrue(errors.isEmpty())
    }
    @Test fun cancellationPreventsPublicationAndNewReadsRecoverAfterFailure() = runTest {
        val reader = LatestReportRead<Int>(backgroundScope)
        val values = mutableListOf<Int>()
        val errors = mutableListOf<Throwable>()
        reader.submit({ delay(500); 1 }, values::add, errors::add)
        advanceTimeBy(181); reader.cancel(); advanceTimeBy(600)
        assertTrue(values.isEmpty()); assertTrue(errors.isEmpty())
        reader.submit({ error("failure") }, values::add, errors::add)
        advanceTimeBy(181)
        assertEquals(1, errors.size)
        reader.submit({ 2 }, values::add, errors::add)
        advanceTimeBy(181)
        assertEquals(listOf(2), values)
    }
}
