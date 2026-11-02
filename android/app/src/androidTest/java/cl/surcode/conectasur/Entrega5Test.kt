package cl.surcode.conectasur

import android.content.Context
import android.graphics.Bitmap
import android.util.Base64
import android.view.View
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.domain.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.json.JSONArray
import org.junit.*
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class Entrega5Test {
 private val context get()=InstrumentationRegistry.getInstrumentation().targetContext
 private lateinit var session:Session
 private lateinit var repo:OwnerWorkspaceRepository
 private val shop get()=requireNotNull(session.shopId)
 private val created=mutableListOf<String>()
 @Before fun setup():Unit=runBlocking{
  val args=InstrumentationRegistry.getArguments();Assume.assumeTrue(args.getString("supabaseLive")=="true")
  RepositoryProvider.initialize(context);BiometricStoreLock(context).clear()
  context.getSharedPreferences("presentation",Context.MODE_PRIVATE).edit().clear().commit()
  session=RepositoryProvider.auth().signIn(requireNotNull(args.getString("testEmail")),requireNotNull(args.getString("testPassword")))
  repo=RepositoryProvider.ownerWorkspace();repo.discardDraft(shop)
 }
 @After fun cleanup():Unit=runBlocking{if(::repo.isInitialized){repo.discardDraft(shop);for(id in created)repo.delete(shop,id)}}
 private fun raw(name:String=""):JSONObject {
  val bitmap=Bitmap.createBitmap(24,24,Bitmap.Config.ARGB_8888);bitmap.eraseColor(android.graphics.Color.GREEN)
  val bytes=ByteArrayOutputStream().apply{bitmap.compress(Bitmap.CompressFormat.JPEG,85,this)}.toByteArray();bitmap.recycle()
  return JSONObject().put("id",UUID.randomUUID().toString()).put("step",0).put("name",name).put("description","")
   .put("category","Artesanías").put("price","").put("productType","artesania").put("attributes",JSONObject())
   .put("mode","UNITS").put("quantity","2").put("soldOut","HIDE").put("visible",true).put("showPrice",true)
   .put("photo","data:image/jpeg;base64,"+Base64.encodeToString(bytes,Base64.NO_WRAP)).put("variants",JSONArray())
 }
 private fun <T:OwnerActivity> wait(s:ActivityScenario<T>,condition:(T)->Boolean){
  val end=android.os.SystemClock.elapsedRealtime()+60000
  while(android.os.SystemClock.elapsedRealtime()<end){var ok=false;s.onActivity{ok=condition(it)};if(ok)return;android.os.SystemClock.sleep(100)}
  Assert.fail("La pantalla no llegó al estado esperado")
 }
 private fun edit(id:Int,value:String){onView(withId(id)).perform(scrollTo(),replaceText(value),closeSoftKeyboard())}
 @Test fun encryptedDraftSurvivesClosingEditor():Unit=runBlocking{
  repo.saveDraft(shop,raw());var scenario=ActivityScenario.launch(ProductEditorActivity::class.java)
  try{
   wait(scenario){it.findViewById<View>(R.id.pe_next)?.isShown==true}
   onView(withId(R.id.pe_next)).perform(scrollTo(),click());edit(R.id.pe_name,"Borrador recuperable E5");edit(R.id.pe_description,"Flores tejidas con lana")
   scenario.close();scenario=ActivityScenario.launch(ProductEditorActivity::class.java)
   wait(scenario){it.findViewById<View>(R.id.pe_name)?.isShown==true}
   onView(withId(R.id.pe_name)).check(matches(withText("Borrador recuperable E5")))
   val stored=context.getSharedPreferences("supabase_private",Context.MODE_PRIVATE).all.values.joinToString()
   Assert.assertFalse(stored.contains("Borrador recuperable E5"))
  }finally{scenario.close()}
 }
 @Test fun editorPublishesVariantWithOwnPhotoPriceAndStock():Unit=runBlocking{
  val data=raw();created.add(data.getString("id"));repo.saveDraft(shop,data)
  val scenario=ActivityScenario.launch(ProductEditorActivity::class.java)
  try{
   wait(scenario){it.findViewById<View>(R.id.pe_next)?.isShown==true}
   onView(withId(R.id.pe_next)).perform(scrollTo(),click());edit(R.id.pe_name,"Producto UI E5");edit(R.id.pe_price,"8000");edit(R.id.pe_description,"Producto de prueba del flujo completo")
   onView(withId(R.id.pe_next)).perform(scrollTo(),click());onView(withId(R.id.pe_add_variant)).perform(scrollTo(),click())
   edit(R.id.pv_label,"Rojo");edit(R.id.pv_price,"9500");edit(R.id.pv_quantity,"2")
   onView(withId(R.id.pe_next)).perform(scrollTo(),click());onView(withId(R.id.pe_save)).perform(scrollTo(),click())
   val end=android.os.SystemClock.elapsedRealtime()+60000;var found:OwnerProduct?=null
   while(android.os.SystemClock.elapsedRealtime()<end){found=repo.sync(shop).products.find{it.base.id==data.getString("id")};if(found!=null)break;android.os.SystemClock.sleep(300)}
   Assert.assertNotNull(found);Assert.assertEquals(9500L,found!!.variants.single().priceClp);Assert.assertEquals(2,found.variants.single().quantity)
   Assert.assertTrue(found.base.photo.startsWith(BuildConfig.SUPABASE_URL+"/storage/"));Assert.assertNull(repo.draft(shop))
  }finally{scenario.close()}
 }
 @Test fun salesScreenSellsUniqueAndHistoryFilterShowsReceipt():Unit=runBlocking{
  val id="e5ui_"+UUID.randomUUID();created.add(id)
  val item=OwnerProduct(CatalogProduct(id,shop,"Pieza UI E5", "Prueba UI", "Artesanías",12000,true,StockMode.UNIQUE,1,true,""))
  repo.save(shop,item)
  val scenario=ActivityScenario.launch(SalesActivity::class.java)
  try{
   wait(scenario){it.findViewById<View>(R.id.sv_register)?.isShown==true}
   onView(withId(R.id.sv_product)).perform(scrollTo(),click());onView(withText("Pieza UI E5")).perform(click())
   edit(R.id.sv_quantity,"1");edit(R.id.sv_place,"Feria prueba E5")
   onView(withId(R.id.sv_register)).perform(scrollTo(),click());onView(withText("Confirmar")).perform(click())
   wait(scenario){it.findViewById<TextView>(R.id.owner_status).text.startsWith("Venta registrada")}
   Assert.assertEquals(0,repo.sync(shop).products.first{it.base.id==id}.base.quantity)
   onView(withId(R.id.sv_history)).perform(scrollTo(),click())
   wait(scenario){it.findViewById<View>(R.id.sh_filter)?.isShown==true}
   edit(R.id.sh_product,"Pieza UI E5");edit(R.id.sh_place,"Feria prueba E5");onView(withId(R.id.sh_filter)).perform(scrollTo(),click())
   onView(withId(R.id.sh_summary)).check(matches(withText("1 ventas · Total: $12.000 CLP")))
  }finally{scenario.close()}
 }
 @Test fun offlineProductAndDeleteAreSynchronizedForSameOwner():Unit=runBlocking{
  val id="e5offline_"+UUID.randomUUID();created.add(id)
  val down=OwnerWorkspaceRepository(SupabaseClient("https://127.0.0.1:1",BuildConfig.SUPABASE_ANON_KEY,SecureBackendStore(context)))
  val item=OwnerProduct(CatalogProduct(id,shop,"Producto sin conexión", "Prueba", "Artesanías",8000,true,StockMode.UNITS,2,false,""))
  val local=down.save(shop,item);Assert.assertTrue(local.offline);Assert.assertTrue(local.products.any{it.base.id==id})
  val online=repo.sync(shop);Assert.assertFalse(online.offline);Assert.assertTrue(online.products.any{it.base.id==id})
  Assert.assertTrue(down.delete(shop,id).offline);Assert.assertFalse(repo.sync(shop).products.any{it.base.id==id})
 }
}