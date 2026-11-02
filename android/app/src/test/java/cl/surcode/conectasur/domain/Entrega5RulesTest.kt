package cl.surcode.conectasur.domain
import org.junit.Assert.*
import org.junit.Test
class Entrega5RulesTest {
 private fun item(mode:StockMode=StockMode.UNITS,out:String="HIDE",qty:Int?=0)=CatalogProduct("x","s","Producto","","Artesanías",8000,true,mode,qty,true,"",soldOut=out)
 @Test fun exhaustedHasThreeExplicitBehaviors(){assertNull(item().toPublicOrNull());assertTrue(item(out="SHOW").toPublicOrNull()!!.soldOut);assertTrue(item(out="ORDER").toPublicOrNull()!!.onRequest)}
 @Test fun uniqueNeverReturnsWhenSold(){for(out in listOf("HIDE","SHOW","ORDER"))assertNull(item(StockMode.UNIQUE,out).toPublicOrNull())}
 @Test fun uncountedRegularRemainsAvailable(){assertNotNull(item(StockMode.UNLIMITED,qty=null).toPublicOrNull());assertFalse(item(StockMode.UNLIMITED,qty=null).toPublicOrNull()!!.onRequest)}
 @Test fun priceReadingSaysChileanPesos(){assertEquals("Precio: 8000 pesos chilenos",chileanSpeech("Precio: $8.000 CLP"));assertEquals("1 peso chileno",chileanSpeech("$1 CLP"))}
}
