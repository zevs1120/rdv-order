package com.rdv.order

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.rdv.order.data.SecureStore
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SecureStoreTest {
    @Test fun persistedSessionIsEncryptedAndSurvivesStoreRecreation() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val key = "instrumentation:test-session"
        val payload = "test-only-token-and-draft"
        try {
            SecureStore(context).put(key, payload)
            val ciphertext = context.getSharedPreferences("rdv_secure", 0).getString(key, null)!!
            assertFalse(ciphertext.contains(payload))
            assertEquals(payload, SecureStore(context).get(key))
            SecureStore(context).put(key, payload)
            assertNotEquals(ciphertext, context.getSharedPreferences("rdv_secure", 0).getString(key, null))
        } finally { SecureStore(context).remove(key) }
    }
    @Test fun ciphertextCannotBeMovedIntoAnotherStorageSlot() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val a = "instrumentation:a"; val b = "instrumentation:b"
        val prefs = context.getSharedPreferences("rdv_secure", 0)
        try {
            SecureStore(context).put(a, "private-test-data")
            assertTrue(prefs.edit().putString(b, prefs.getString(a, null)).commit())
            assertTrue(runCatching { SecureStore(context).get(b) }.exceptionOrNull() is IllegalStateException)
        } finally { SecureStore(context).remove(a); SecureStore(context).remove(b) }
    }
}
