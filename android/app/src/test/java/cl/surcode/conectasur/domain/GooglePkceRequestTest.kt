package cl.surcode.conectasur.domain

import org.junit.Assert.*
import org.junit.Test
import java.net.URI
import java.net.URLDecoder

class GooglePkceRequestTest {
    private val request = GooglePkceRequest("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "N".repeat(43), 1000)
    private fun callback(extra: String = "code=server-code", state: String = request.state) =
        "conectasur://auth/callback?client_state=$state&$extra"
    private fun rejects(block: () -> Unit) {
        try { block(); fail("Debe rechazar el retorno") } catch (_: IllegalArgumentException) { }
    }
    @Test fun buildsS256ChallengeWithoutSendingTheVerifierToTheBrowser() {
        val value = request.authorizationUrl("https://example.supabase.co")
        val params = URI(value).rawQuery.split('&').associate {
            val pair = it.split('=', limit = 2)
            pair[0] to URLDecoder.decode(pair[1], "UTF-8")
        }
        assertEquals("google", params["provider"])
        assertEquals("s256", params["code_challenge_method"])
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", params["code_challenge"])
        assertEquals("conectasur://auth/callback?client_state=${request.state}", params["redirect_to"])
        assertFalse(value.contains(request.verifier))
    }
    @Test fun eachRequestGetsFreshSecrets() {
        val first = GooglePkceRequest.create(1000)
        val second = GooglePkceRequest.create(1000)
        assertNotEquals(first.verifier, second.verifier)
        assertNotEquals(first.state, second.state)
        assertNotEquals(first.state, first.verifier)
        assertTrue(first.verifier.length >= 43)
    }
    @Test fun acceptsOnlyTheMatchingFreshCode() { assertEquals("server-code", request.callbackCode(callback(), 1500)) }
    @Test fun rejectsAnUnrequestedState() { rejects { request.callbackCode(callback(state = "other"), 1500) } }
    @Test fun expiresAndRejectsClockRollback() {
        rejects { request.callbackCode(callback(), 1000 + GooglePkceRequest.LIFETIME_MILLIS + 1) }
        rejects { request.callbackCode(callback(), 999) }
    }
    @Test fun rejectsImplicitSessionInjection() {
        rejects { request.callbackCode(callback("access_token=foreign&refresh_token=foreign"), 1500) }
        rejects { request.callbackCode(callback() + "#access_token=foreign", 1500) }
    }
    @Test fun rejectsWrongRedirectComponents() {
        for (value in listOf(callback().replace("/callback?", "/callback/extra?"), callback().replace("auth/", "evil/"),
            callback().replace("conectasur:", "https:"), callback().replace("auth/", "auth:443/"), callback().replace("auth/", "user@auth/"))) {
            rejects { request.callbackCode(value, 1500) }
        }
    }
    @Test fun rejectsDuplicateParametersAndAmbiguousErrors() {
        rejects { request.callbackCode(callback("code=one&code=two"), 1500) }
        rejects { request.callbackCode(callback("code=one&error=denied"), 1500) }
        rejects { request.callbackCode(callback() + "&client_state=${request.state}", 1500) }
    }
    @Test fun acceptsProviderCancellationOnlyWithMatchingState() {
        assertNull(request.callbackCode(callback("error=access_denied"), 1500))
        rejects { request.callbackCode(callback("error=access_denied", "foreign"), 1500) }
    }
    @Test fun rejectsMissingOrEmptyCodes() {
        rejects { request.callbackCode(callback("code="), 1500) }
        rejects { request.callbackCode(callback("other=value"), 1500) }
    }
}
