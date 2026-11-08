package cl.surcode.conectasur

import android.app.AlertDialog
import android.content.Intent
import android.view.View
import android.widget.*
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import cl.surcode.conectasur.domain.*
import cl.surcode.conectasur.ui.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Integra el espacio de productos iniciado por Dan con repositorios, XML y datos reales. */
class ProductManagerActivity : OwnerActivity() {
    override val titleText="Mis productos"
    private var initialized=false
    private var products=emptyList<OwnerProduct>()
    private val selected=mutableSetOf<String>()
    private var preview=false
    private var defaults=false
    private var showPrices=true
    override fun onOwnerReady() {
        if(!initialized){initialized=true;showList();lifecycleScope.launch { repeatOnLifecycle(Lifecycle.State.STARTED){while(isActive){if(!defaults)refresh();delay(12000)}} }}
        else if(!defaults)refresh()
    }
    private fun showList(){
        defaults=false;screen(R.layout.screen_owner_products)
        click(R.id.pm_add){openEditor(null)}
        click(R.id.pm_sales){startActivity(Intent(this,SalesActivity::class.java))}
        click(R.id.pm_history){startActivity(Intent(this,SalesActivity::class.java).putExtra("history",true))}
        click(R.id.pm_defaults){showDefaults()}
        click(R.id.pm_refresh){refresh()}
        click(R.id.pm_preview){preview=!preview;findViewById<Button>(R.id.pm_preview).text=if(preview)"Volver a mi catálogo privado" else "Vista previa pública";render()}
        click(R.id.pm_bulk){bulk()}
        findViewById<EditText>(R.id.pm_search).doAfterTextChanged{render()}
        products=workspace.cached(shopId);render();refresh()
    }
    private fun refresh(){action("Actualizando tu catálogo…"){
        val snapshot=workspace.sync(shopId);products=snapshot.products
        showPrices=cl.surcode.conectasur.data.RepositoryProvider.shops().getShop(shopId)?.showPrices?:showPrices
        if(!defaults)render()
        status(if(snapshot.offline)"Sin conexión. Catálogo guardado; ${snapshot.pending} cambios pendientes. Se enviarán al volver la red." else "Catálogo actualizado. ${snapshot.products.size} productos. ${snapshot.pending} cambios pendientes.")
    }}
    private fun render(){
        if(defaults)return
        val list=findViewById<LinearLayout>(R.id.pm_items)?:return;list.removeAllViews()
        val query=text(R.id.pm_search)
        val rows=products.filter { (it.base.name+" "+it.base.category).contains(query,true) }.filter { !preview || it.toPublicOrNull(showPrices)!=null }
        findViewById<TextView>(R.id.pm_summary).text=if(preview)"Vista previa pública: ${rows.size} productos. No muestra cantidades privadas." else "${rows.size} productos · ${selected.size} seleccionados"
        findViewById<Button>(R.id.pm_add).text=if(workspace.draft(shopId)!=null)"Continuar borrador" else "Agregar producto"
        rows.forEach {item->
            val row=layoutInflater.inflate(R.layout.item_owner_product,list,false);val p=item.base;val public=item.toPublicOrNull(showPrices)
            row.findViewById<TextView>(R.id.pm_name).text=p.name
            row.findViewById<CheckBox>(R.id.pm_select).apply{isVisible=!preview;text="Seleccionar ${p.name}";isChecked=p.id in selected;setOnCheckedChangeListener{_,value->if(value)selected.add(p.id)else selected.remove(p.id)}}
            val mode=modes[modeValues.indexOf(p.stockMode)]
            row.findViewById<TextView>(R.id.pm_details).text=if(preview){
                val state=if(public?.soldOut==true)"Agotado" else if(public?.onRequest==true)"A pedido" else "Disponible"
                "$state · ${priceLabel(public?.priceClp)}\n${p.description}\n"+public?.variants.orEmpty().joinToString("\n"){
                    val variantState=if(public?.onRequest==true)"A pedido" else if(public?.soldOut==true || !it.available)"Agotado" else "Disponible"
                    "${it.label} · ${priceLabel(it.priceClp)} · $variantState"
                }
            }else {
                val soldOutInfo=if(p.stockMode==StockMode.UNITS)" · Al agotarse: ${soldOutLabels.getOrElse(soldOutValues.indexOf(p.soldOut)){p.soldOut}}" else ""
                "${p.category} · ${priceLabel(p.priceClp)}\n$mode · ${if(p.visible)"Disponible" else "No disponible"}$soldOutInfo\n"+
                (if(p.stockMode.countsUnits)"Stock: ${p.quantity?:0}" else "Sin conteo de unidades")+
                if(item.variants.isEmpty())"" else "\n${item.variants.size} variantes con precio y stock propios"
            }
            val image=row.findViewById<ImageView>(R.id.pm_photo)
            if(p.photo.startsWith("data:"))runCatching{val bytes=android.util.Base64.decode(p.photo.substringAfter(','),android.util.Base64.NO_WRAP);image.setImageBitmap(android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.size))}
            else PublicImageLoader.load(lifecycleScope,image,p.photo,BuildConfig.SUPABASE_URL)
            row.findViewById<Button>(R.id.pm_edit).apply{isVisible=!preview;setOnClickListener{openEditor(p.id)}}
            row.findViewById<Button>(R.id.pm_delete).apply{isVisible=!preview;setOnClickListener{
                AlertDialog.Builder(this@ProductManagerActivity).setTitle("Eliminar ${p.name}").setMessage("Se retirará de tu catálogo. Las ventas anteriores se conservan.")
                    .setNegativeButton("Conservar",null).setPositiveButton("Eliminar"){_,_->action("Eliminando producto…"){
                        val result=workspace.delete(shopId,p.id);products=result.products;selected.remove(p.id);render();status(if(result.offline)"Eliminación guardada. Se sincronizará al volver la conexión." else "Producto eliminado.")
                    }}.show()
            }}
            list.addView(row);applyAccessibility(row,settings)
        }
        if(rows.isEmpty())list.addView(TextView(this).apply{text="No hay productos para mostrar. Puedes agregar uno o cambiar la búsqueda.";textSize=18f})
    }
    private fun openEditor(id:String?){
        val draft=workspace.draft(shopId)
        fun open(){startActivity(Intent(this,ProductEditorActivity::class.java).apply{if(id!=null)putExtra("productId",id)})}
        if(id!=null && draft!=null && draft.optString("id")!=id){
            AlertDialog.Builder(this).setTitle("Tienes un borrador pendiente").setMessage("Puedes continuar ese borrador o descartarlo para editar este producto.")
                .setNegativeButton("Conservar borrador",null).setPositiveButton("Descartar y editar"){_,_->workspace.discardDraft(shopId);open()}.show()
        }else open()
    }
    private fun bulk(){
        AlertDialog.Builder(this).setTitle("¿A qué productos aplicar?").setItems(arrayOf("Seleccionados (${selected.size})","Una categoría","Todo mi catálogo")){_,scope->
            fun choose(category:String?){
                if(scope==0 && selected.isEmpty()){status("Primero marca al menos un producto.");return}
                val labels=arrayOf("Marcar disponibles","Marcar no disponibles","Mostrar precios","Ocultar precios","Al agotarse: ocultar","Al agotarse: mostrar Agotado","Al agotarse: pasar a pedido")
                AlertDialog.Builder(this).setTitle("Cambio de disponibilidad").setItems(labels){_,which->
                    val config=when(which){0->JSONObject().put("visible",true);1->JSONObject().put("visible",false);2->JSONObject().put("show_price",true);3->JSONObject().put("show_price",false);else->JSONObject().put("sold_out",soldOutValues[which-4])}
                    val count=products.count{scope==2 || (scope==1&&it.base.category==category) ||(scope==0&&it.base.id in selected)}
                    AlertDialog.Builder(this).setTitle("Aplicar a $count productos").setMessage(labels[which]+". Las piezas únicas vendidas siempre se retiran.").setNegativeButton("Cancelar",null).setPositiveButton("Aplicar"){_,_->action("Guardando cambios…"){
                        val result=workspace.bulk(shopId,selected,category,config,scope==2);products=result.products;render();status(if(result.offline)"Cambios guardados sin conexión. Se enviarán cuando vuelva la red." else "Cambio aplicado a $count productos.")
                    }}.show()
                }.show()
            }
            if(scope==1){val cats=products.map{it.base.category}.distinct().sorted();AlertDialog.Builder(this).setTitle("Elegir categoría").setItems(cats.toTypedArray()){_,i->choose(cats[i])}.show()}else choose(null)
        }.show()
    }
    private fun showDefaults(){action("Cargando preferencias…"){
        val config=workspace.refreshConfiguration(shopId);val d=config.getJSONObject("default_products")
        val currentDefaults=ProductDefaults.fromValues(d.optString("stockMode"),d.optString("soldOut"),d.optBoolean("visible",true),d.optBoolean("showPrice",true))
        defaults=true;screen(R.layout.screen_owner_defaults)
        choices(R.id.pd_mode,modes,modeValues.indexOf(currentDefaults.stockMode))
        choices(R.id.pd_soldout,soldOutLabels,soldOutValues.indexOf(currentDefaults.soldOut))
        findViewById<CheckBox>(R.id.pd_visible).isChecked=currentDefaults.visible;findViewById<CheckBox>(R.id.pd_price).isChecked=currentDefaults.showPrice
        findViewById<CheckBox>(R.id.pd_history).isChecked=config.optBoolean("history_enabled",true)
        click(R.id.pd_save){action("Guardando preferencias…"){
            val chosen=ProductDefaults(modeValues[option(R.id.pd_mode)],soldOutValues[option(R.id.pd_soldout)],checked(R.id.pd_visible),checked(R.id.pd_price))
            val next=JSONObject().put("history_enabled",checked(R.id.pd_history)).put("default_products",JSONObject()
                .put("stockMode",chosen.stockMode.name).put("soldOut",chosen.soldOut).put("visible",chosen.visible).put("showPrice",chosen.showPrice))
            workspace.saveConfiguration(shopId,next);showList();status("Preferencias guardadas. Se aplican a los próximos productos.")
        }}
        status("Configura cómo nacen los productos nuevos y si deseas guardar historial.")
    }}
}
