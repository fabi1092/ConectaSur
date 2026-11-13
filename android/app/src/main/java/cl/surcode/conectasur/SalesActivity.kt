package cl.surcode.conectasur

import android.app.AlertDialog
import android.app.DatePickerDialog
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.*
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.domain.*
import cl.surcode.conectasur.ui.PublicImageLoader
import cl.surcode.conectasur.ui.applyAccessibility
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.IOException
import java.time.LocalDate
import java.time.ZoneId
import java.time.Instant
import java.time.format.DateTimeFormatter

class SalesActivity : OwnerActivity() {
    override val titleText="Mis ventas"
    private var products=emptyList<OwnerProduct>()
    private var sales=emptyList<Sale>()
    private var initialized=false
    private var history=false
    private var pending:JSONObject?=null
    private var lastSoldSnapshot:OwnerProduct?=null
    private var undoTimerJob:Job?=null
    private val platformFairs=listOf(
        "Feria Artesanal de Alerce",
        "Feria Costanera Puerto Montt",
        "Feria Municipal Presidente Ibáñez",
        "Feria Parque La Paloma"
    )
    override fun onOwnerReady(){if(!initialized){initialized=true;history=intent.getBooleanExtra("history",false);if(history)showHistory()else saleScreen()}}
    private fun saleScreen(){action("Cargando tus productos…"){
        products=workspace.sync(shopId).products
        pending=workspace.saleDraft(shopId)
        screen(R.layout.screen_owner_sales)
        val dp=resources.displayMetrics.density
        fun optionBg(selected:Boolean,radiusDp:Float=12f)=GradientDrawable().apply{
            cornerRadius=radiusDp*dp
            setColor(if(selected) 0xFFEEF6F4.toInt() else 0xFFFFFFFF.toInt())
            setStroke(((if(selected) 2.5f else 1.5f)*dp).toInt(),if(selected) 0xFF1A7B6E.toInt() else 0xFFD3DDD9.toInt())
        }
        val productSpinner=findViewById<Spinner>(R.id.sv_product)
        val variantSpinner=findViewById<Spinner>(R.id.sv_variant)
        val productCards=findViewById<LinearLayout>(R.id.sv_product_cards)
        val variantChips=findViewById<LinearLayout>(R.id.sv_variant_chips)
        choices(R.id.sv_product,products.map{it.base.name})
        pending?.let{p->productSpinner.setSelection(products.indexOfFirst{it.base.id==p.optString("productId")}.coerceAtLeast(0))}
        fun renderProductCards(){
            val container=productCards?:return
            val selectedIdx=option(R.id.sv_product)
            container.removeAllViews()
            products.forEachIndexed{idx,prod->
                val isSel=idx==selectedIdx
                val card=LinearLayout(this).apply{
                    orientation=LinearLayout.HORIZONTAL
                    gravity=Gravity.CENTER_VERTICAL
                    minimumHeight=(52*dp).toInt()
                    setPadding((14*dp).toInt(),(10*dp).toInt(),(14*dp).toInt(),(10*dp).toInt())
                    layoutParams=LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,LinearLayout.LayoutParams.WRAP_CONTENT).apply{bottomMargin=(8*dp).toInt()}
                    background=optionBg(isSel)
                    isEnabled=pending==null
                    isClickable=true
                    isFocusable=true
                    contentDescription="${prod.base.name}, ${priceLabel(prod.base.priceClp)}"
                }
                val title=TextView(this).apply{
                    text=prod.base.name
                    textSize=16f
                    setTypeface(null,Typeface.BOLD)
                    setTextColor(0xFF183A34.toInt())
                    layoutParams=LinearLayout.LayoutParams(0,LinearLayout.LayoutParams.WRAP_CONTENT,1f).apply{marginEnd=(10*dp).toInt()}
                }
                val shownPrice=prod.variants.firstOrNull()?.priceClp?:prod.base.priceClp
                val price=TextView(this).apply{
                    text=priceLabel(shownPrice)
                    textSize=15f
                    setTypeface(null,Typeface.BOLD)
                    setTextColor(if(isSel) 0xFF155C43.toInt() else 0xFF1A7B6E.toInt())
                    fontFeatureSettings="tnum"
                }
                card.addView(title);card.addView(price)
                card.setOnClickListener{
                    if(pending!=null) return@setOnClickListener
                    productSpinner.setSelection(idx)
                }
                container.addView(card)
            }
        }
        fun renderVariantChips(p:OwnerProduct?){
            val container=variantChips?:return
            container.removeAllViews()
            val list=p?.variants.orEmpty()
            val selectedIdx=option(R.id.sv_variant)
            list.forEachIndexed{idx,v->
                val isSel=idx==selectedIdx
                val chip=LinearLayout(this).apply{
                    orientation=LinearLayout.HORIZONTAL
                    gravity=Gravity.CENTER_VERTICAL
                    minimumHeight=(56*dp).toInt()
                    setPadding((10*dp).toInt(),(8*dp).toInt(),(12*dp).toInt(),(8*dp).toInt())
                    layoutParams=LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT,LinearLayout.LayoutParams.WRAP_CONTENT).apply{marginEnd=(10*dp).toInt()}
                    background=optionBg(isSel)
                    isEnabled=pending==null
                    isClickable=true
                    isFocusable=true
                }
                val thumb=ImageView(this).apply{
                    layoutParams=LinearLayout.LayoutParams((40*dp).toInt(),(40*dp).toInt()).apply{marginEnd=(8*dp).toInt()}
                    scaleType=ImageView.ScaleType.CENTER_CROP
                    setImageResource(when(v.photo?:p?.base?.photo){"flores"->R.drawable.flores;"bandejas"->R.drawable.bandejas;else->R.drawable.ic_products})
                }
                PublicImageLoader.load(lifecycleScope,thumb,v.photo?:p?.base?.photo.orEmpty(),BuildConfig.SUPABASE_URL)
                val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
                col.addView(TextView(this).apply{text=v.label;textSize=14f;setTypeface(null,Typeface.BOLD);setTextColor(0xFF183A34.toInt());maxLines=1})
                col.addView(TextView(this).apply{text=priceLabel(v.priceClp?:p?.base?.priceClp?:0L);textSize=13f;fontFeatureSettings="tnum";setTextColor(if(isSel) 0xFF155C43.toInt() else 0xFF4A6560.toInt())})
                chip.addView(thumb);chip.addView(col)
                chip.setOnClickListener{
                    if(pending!=null) return@setOnClickListener
                    variantSpinner.setSelection(idx)
                }
                container.addView(chip)
            }
        }
        fun variants(){
            val p=products.getOrNull(option(R.id.sv_product));choices(R.id.sv_variant,p?.variants?.map{it.label}.orEmpty().ifEmpty{listOf("Sin variantes")})
            pending?.let{d->variantSpinner.setSelection(p?.variants?.indexOfFirst{it.id==d.optString("variantId")}?.coerceAtLeast(0)?:0)}
            val hasVariants=p?.variants?.isNotEmpty()==true
            findViewById<View>(R.id.sv_variant_section)?.isVisible=hasVariants
            findViewById<View>(R.id.sv_variant_label).isVisible=hasVariants
            renderProductCards()
            renderVariantChips(p)
            updatePrice()
        }
        productSpinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,i:Int,id:Long){variants()}}
        variantSpinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,i:Int,id:Long){renderVariantChips(products.getOrNull(option(R.id.sv_product)));updatePrice()}}
        findViewById<EditText>(R.id.sv_quantity).apply {
            setText(pending?.optString("quantity")?:"1")
            doAfterTextChanged { updatePrice() }
        }
        fun stepSaleQty(delta:Int){
            val current=findViewById<EditText>(R.id.sv_quantity).text.toString().trim().toIntOrNull()?:1
            val next=(current+delta).coerceAtLeast(1)
            findViewById<EditText>(R.id.sv_quantity).setText(next.toString())
        }
        click(R.id.sv_qty_minus){stepSaleQty(-1)}
        click(R.id.sv_qty_plus){stepSaleQty(1)}
        click(R.id.sv_undo_button){undoLastSale()}
        val initialPlace=pending?.optString("place")?:""
        val saleFairOptions=listOf("Otro lugar (escribir abajo)")+platformFairs
        val initialFairIndex=saleFairOptions.indexOf(initialPlace).coerceAtLeast(0)
        val fairSpinner=findViewById<Spinner>(R.id.sv_fair_selector)
        val placeInput=findViewById<EditText>(R.id.sv_place)
        val feriaBtn=findViewById<Button>(R.id.sv_place_feria)
        val particularBtn=findViewById<Button>(R.id.sv_place_particular)
        fun setPlaceMode(isFeria:Boolean){
            feriaBtn?.apply{background=optionBg(isFeria,12f);setTextColor(if(isFeria) 0xFF155C43.toInt() else 0xFF4A6560.toInt())}
            particularBtn?.apply{background=optionBg(!isFeria,12f);setTextColor(if(!isFeria) 0xFF155C43.toInt() else 0xFF4A6560.toInt())}
            fairSpinner?.isVisible=isFeria
        }
        choices(R.id.sv_fair_selector,saleFairOptions,initialFairIndex)
        placeInput.setText(initialPlace)
        val startInFeria=initialPlace.isBlank()||initialPlace in platformFairs
        setPlaceMode(startInFeria)
        click(R.id.sv_place_feria){
            if(pending!=null) return@click
            setPlaceMode(true)
            if(fairSpinner.selectedItemPosition<=0){
                fairSpinner.setSelection(1)
                placeInput.setText(platformFairs.first())
            }
        }
        click(R.id.sv_place_particular){
            if(pending!=null) return@click
            setPlaceMode(false)
            if(placeInput.text.toString().trim() in platformFairs||placeInput.text.isNullOrBlank()){
                placeInput.setText("Particular / Entrega directa")
            }
        }
        fairSpinner?.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{
            override fun onNothingSelected(p:AdapterView<*>?){}
            override fun onItemSelected(p:AdapterView<*>?,v:View?,i:Int,id:Long){
                if(pending!=null) return
                if(i>0){
                    placeInput.setText(saleFairOptions[i])
                }else if(placeInput.text.toString().trim() in platformFairs){
                    placeInput.setText("")
                }
            }
        }
        variants();lockPending()
        click(R.id.sv_register){confirmSale()}
        click(R.id.sv_history){history=true;showHistory()}
        status(if(pending!=null)"Hay una venta sin respuesta confirmada. Reintenta con los mismos datos para consultar su resultado sin duplicarla." else if(products.isEmpty())"Primero agrega un producto a tu catálogo." else "Elige producto, variante y cantidad. El stock se descuenta al confirmar.")
    }}
    private fun showUndoBanner(previousProduct:OwnerProduct,soldQty:Int){
        lastSoldSnapshot=previousProduct
        undoTimerJob?.cancel()
        val banner=findViewById<View>(R.id.sv_undo_banner)?:return
        findViewById<TextView>(R.id.sv_undo_text)?.text="¿Te equivocaste al anotar $soldQty × ${previousProduct.base.name}? Tienes 10 segundos para devolver las unidades."
        banner.isVisible=true
        undoTimerJob=lifecycleScope.launch{
            delay(10000L)
            findViewById<View>(R.id.sv_undo_banner)?.isVisible=false
            lastSoldSnapshot=null
        }
    }
    private fun undoLastSale(){
        val snapshot=lastSoldSnapshot?:return
        undoTimerJob?.cancel()
        findViewById<View>(R.id.sv_undo_banner)?.isVisible=false
        lastSoldSnapshot=null
        action("Devolviendo unidades al catálogo…"){
            val result=workspace.save(shopId,snapshot)
            products=result.products
            updatePrice()
            val msg="Venta anulada: se devolvieron las unidades de ${snapshot.base.name} a tu catálogo."
            status(msg)
        }
    }
    private fun updatePrice(){
        val p=products.getOrNull(option(R.id.sv_product))?:return;val v=p.variants.getOrNull(option(R.id.sv_variant))
        val unitPrice=v?.priceClp?:p.base.priceClp
        val qty=findViewById<EditText>(R.id.sv_quantity)?.text?.toString()?.trim()?.toIntOrNull()?.coerceAtLeast(1)?:1
        val total=unitPrice*qty
        val words=numberToSpanishWords(total).replaceFirstChar{it.uppercase()}
        val amount=if(p.base.stockMode in listOf(StockMode.ON_REQUEST,StockMode.UNLIMITED))"Sin conteo de unidades" else "Disponibles: ${v?.quantity?:p.base.quantity?:0}"
        findViewById<TextView>(R.id.sv_price).text="Precio por unidad: ${priceLabel(unitPrice)}. $amount\nTotal a cobrar: ${priceLabel(total)} (Escrito: $words pesos)"
    }
    private fun lockPending(){
        val editable=pending==null
        listOf(R.id.sv_product,R.id.sv_variant,R.id.sv_quantity,R.id.sv_place,R.id.sv_fair_selector,R.id.sv_qty_minus,R.id.sv_qty_plus,R.id.sv_place_feria,R.id.sv_place_particular).forEach{findViewById<View>(it)?.isEnabled=editable}
        listOf(R.id.sv_product_cards,R.id.sv_variant_chips).forEach{id->
            val g=findViewById<LinearLayout>(id)?:return@forEach
            for(i in 0 until g.childCount) g.getChildAt(i).isEnabled=editable
        }
        findViewById<Button>(R.id.sv_register).text=if(editable)"Guardar venta" else "Reintentar y confirmar venta"
    }
    private fun confirmSale(){
        val product=products.getOrNull(option(R.id.sv_product))?:run{status("Primero agrega un producto.");return}
        val variant=product.variants.getOrNull(option(R.id.sv_variant))
        val amount=pending?.optInt("quantity")?:text(R.id.sv_quantity).toIntOrNull()
        val place=pending?.optString("place")?:text(R.id.sv_place)
        if(place.length>240){status("El lugar puede tener hasta 240 letras.");return}
        if(pending==null){product.saleError(variant?.id,amount)?.let{status(it);return}}
        else if(amount==null||amount<=0){status("Escribe una cantidad mayor que cero.");return}
        AlertDialog.Builder(this).setTitle(if(pending==null)"Confirmar venta" else "Confirmar venta pendiente")
            .setMessage("$amount × ${product.base.name}${variant?.let{" · ${it.label}"}?:""}\nPrecio por unidad: ${priceLabel(variant?.priceClp?:product.base.priceClp)}\nLugar: ${place.ifBlank{"No indicado"}}\nEl servidor verificará el stock.")
            .setNegativeButton("Volver",null).setPositiveButton("Confirmar"){_,_->
                action("Confirmando venta…"){
                    val data=pending?:JSONObject().put("productId",product.base.id).put("variantId",variant?.id?:JSONObject.NULL).put("quantity",amount).put("place",place)
                    pending=data;workspace.saveSaleDraft(shopId,data);lockPending()
                    try{
                        val soldQty=data.getInt("quantity")
                        val unitClp=variant?.priceClp?:product.base.priceClp
                        RepositoryProvider.sales().registerSale(shopId,data.getString("productId"),data.nullableString("variantId"),soldQty,data.getString("place"))
                        workspace.clearSaleDraft(shopId);pending=null
                        products=workspace.sync(shopId).products
                        lockPending();updatePrice();status("Venta registrada. El stock fue actualizado. Puedes registrar otra venta.")
                        showUndoBanner(product,soldQty)
                        findViewById<EditText>(R.id.sv_quantity).setText("1")
                    }catch(e:BackendException){
                        if(e.status in 400..499 && e.status !in listOf(408,429)){workspace.clearSaleDraft(shopId);pending=null;lockPending()};throw e
                    }catch(_:IOException){status("No tenemos confirmación de esta venta. Conservamos los datos. Pulsa Reintentar cuando vuelva la conexión; no se duplicará.")}
                }
            }.show()
    }
    private fun showHistory(){action("Cargando historial…"){
        sales=workspace.sales(shopId);products=workspace.sync(shopId).products;screen(R.layout.screen_owner_history)
        val recordedPlaces=sales.map{it.place.trim()}.filter{it.isNotBlank()}
        val historyFairOptions=listOf("Todas las ferias y lugares")+(platformFairs+recordedPlaces).distinct()
        choices(R.id.sh_fair_selector,historyFairOptions,0)
        findViewById<Spinner>(R.id.sh_fair_selector)?.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{
            override fun onNothingSelected(p:AdapterView<*>?){}
            override fun onItemSelected(p:AdapterView<*>?,v:View?,i:Int,id:Long){
                val placeInput=findViewById<EditText>(R.id.sh_place)?:return
                if(i>0){
                    placeInput.setText(historyFairOptions[i])
                    renderHistory()
                }else if(placeInput.text.toString().trim() in historyFairOptions){
                    placeInput.setText("")
                    renderHistory()
                }
            }
        }
        fun attachDatePicker(id: Int) {
            val input = findViewById<EditText>(id) ?: return
            input.isFocusable = false
            input.isClickable = true
            input.setOnClickListener {
                val now = LocalDate.now()
                val currentText = input.text.toString().trim()
                val initialDate = runCatching { LocalDate.parse(currentText) }
                    .recoverCatching { LocalDate.parse(currentText, DateTimeFormatter.ofPattern("dd-MM-yyyy")) }
                    .recoverCatching { LocalDate.parse(currentText, DateTimeFormatter.ofPattern("dd/MM/yyyy")) }
                    .getOrNull() ?: now

                DatePickerDialog(
                    this,
                    { _, y, m, d ->
                        input.setText(String.format(java.util.Locale.ROOT, "%02d-%02d-%04d", d, m + 1, y))
                        renderHistory()
                    },
                    initialDate.year,
                    initialDate.monthValue - 1,
                    initialDate.dayOfMonth
                ).show()
            }
        }
        attachDatePicker(R.id.sh_from)
        attachDatePicker(R.id.sh_to)
        click(R.id.sh_filter){renderHistory()};renderHistory()
        val config=workspace.refreshConfiguration(shopId)
        status(if(config.optBoolean("history_enabled",true))"Historial de tu tienda. Puedes filtrar por fechas, lugar o feria y producto." else "Historial desactivado: las nuevas ventas no guardan detalle. Aquí puedes consultar las anteriores.")
    }}
    private fun renderHistory(){
        fun date(id:Int,end:Boolean):Long?{
            val value=text(id);if(value.isBlank())return null
            val d=runCatching{LocalDate.parse(value)}
                .recoverCatching{LocalDate.parse(value,DateTimeFormatter.ofPattern("dd-MM-yyyy"))}
                .recoverCatching{LocalDate.parse(value,DateTimeFormatter.ofPattern("dd/MM/yyyy"))}
                .getOrElse{throw IllegalArgumentException("Usa fechas como 02-11-2026 o 2026-11-02.")}
            return (if(end)d.plusDays(1)else d).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
        }
        val from:Long?;val until:Long?
        try{from=date(R.id.sh_from,false);until=date(R.id.sh_to,true);require(from==null||until==null||from<until){"La fecha inicial debe ser anterior a la final."}}
        catch(e:Exception){status(e.message?:"Revisa las fechas.");return}
        val place=text(R.id.sh_place);val product=text(R.id.sh_product)
        val filtered=sales.filter{(from==null||it.dateMillis>=from)&&(until==null||it.dateMillis<until)&&it.place.contains(place,true)&&it.productName.contains(product,true)}
        val box=findViewById<LinearLayout>(R.id.sh_items);box.removeAllViews()
        findViewById<TextView>(R.id.sh_summary).text="${filtered.size} ventas · Total: ${priceLabel(filtered.sumOf{it.priceClp*it.quantity})}"
        val labels=products.flatMap{it.variants}.associate{it.id to it.label}
        val fmt=DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm").withZone(ZoneId.systemDefault())
        filtered.forEach{s->box.addView(TextView(this).apply{text="${s.productName}${s.variantId?.let{" · ${labels[it]?:"opción eliminada"}"}?:""}\n${s.quantity} unidades × ${priceLabel(s.priceClp)}\n${fmt.format(Instant.ofEpochMilli(s.dateMillis))} · ${s.place.ifBlank{"Lugar no indicado"}}\n";textSize=18f})}
        if(filtered.isEmpty())box.addView(TextView(this).apply{text="No hay ventas para estos filtros.";textSize=18f})
        applyAccessibility(box,settings)
    }
}
