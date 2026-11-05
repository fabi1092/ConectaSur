package cl.surcode.conectasur.ui

import cl.surcode.conectasur.domain.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.*
import org.junit.Assert.*
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class ContactViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private var shop = Shop("s","Tienda","",null,"","","",true)
    private val shops = object : ShopRepository {
        override suspend fun getShop(shopId: String) = shop
        override suspend fun getShopChoices() = ShopChoices()
        override suspend fun updateShop(shop: Shop) = Unit
        override suspend fun uploadLogo(shopId: String, jpegBytes: ByteArray) = ""
    }
    private val requests = mutableListOf<String>()
    private var failure = false
    private val messages = object : ShopMessageRepository {
        override suspend fun send(id: String, shopId: String, name: String, contact: String, body: String) {
            requests.add(id); if(failure) throw IOException()
        }
        override suspend fun inbox(shopId: String, before: ShopMessage?) = emptyList<ShopMessage>()
        override suspend fun markRead(id: String) = Unit
    }
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() { Dispatchers.resetMain() }
    @Test fun retryKeepsRequestIdentityAndOnlyConfirmedSuccessIsShown() = runTest(dispatcher) {
        val vm=ContactViewModel(shops,messages); vm.load("s");advanceUntilIdle()
        failure=true;vm.send("Ana","test@example.cl","Hola");advanceUntilIdle()
        assertFalse(vm.state.value.sent)
        failure=false;vm.send("Ana","test@example.cl","Hola");advanceUntilIdle()
        assertEquals(requests[0],requests[1]);assertTrue(vm.state.value.sent)
        vm.send("Ana","test@example.cl","Hola");advanceUntilIdle();assertEquals(2,requests.size)
    }
    @Test fun duplicateTapCannotSendTwiceAndEditingAfterFailureUsesAnotherId() = runTest(dispatcher) {
        val vm=ContactViewModel(shops,messages);vm.load("s");advanceUntilIdle()
        failure=true;vm.send("Ana","test@example.cl","Hola");vm.send("Ana","test@example.cl","Hola");advanceUntilIdle()
        assertEquals(1,requests.size)
        vm.send("Ana","test@example.cl","Otra consulta");advanceUntilIdle()
        assertNotEquals(requests[0],requests[1])
    }
    @Test fun invalidFormAndWhatsAppOnlyStoreDoNotSend() = runTest(dispatcher) {
        val vm=ContactViewModel(shops,messages);vm.load("s");advanceUntilIdle()
        vm.send("","a","Hola");advanceUntilIdle();assertTrue(requests.isEmpty())
        shop=shop.copy(contactMode=ContactMode.WHATSAPP,whatsappNumber="56912345678")
        val whatsapp=ContactViewModel(shops,messages);whatsapp.load("s");advanceUntilIdle()
        whatsapp.send("Ana","test@example.cl","Hola");advanceUntilIdle();assertTrue(requests.isEmpty())
    }
    @Test fun whatsappDestinationsAreNumbersAndChileanCellphonesAreNormalized() {
        assertEquals("56912345678",whatsappNumber("9 1234 5678"))
        assertEquals("56912345678",whatsappNumber("+56 (9) 1234-5678"))
        listOf("123","000000000","https://bad.example","javascript:alert(1)").forEach { assertNull(whatsappNumber(it)) }
    }
}
