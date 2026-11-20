package cl.surcode.conectasur

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.DatePickerDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.location.LocationManager
import android.view.Gravity
import android.view.View
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
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
    private var selectedProductIndex=0
    private var selectedVariantIndex=0
    private var lastSoldSnapshot:OwnerProduct?=null
    private var undoTimerJob:Job?=null
    private var ownerFairCalendar=emptyList<OwnerFairCalendarItem>()
    private var currentFairSuggestion:FairSaleSuggestion?=null
    private var activeFairNames=emptyList<String>()
    private val platformFairs=listOf(
        "Feria Artesanal de Alerce",
        "Feria Costanera Puerto Montt",
        "Feria Municipal Presidente Ibáñez",
        "Feria Parque La Paloma"
    )
    private val gpsPermissionLauncher=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){
        refreshFairSuggestion(autoApply=true, userInitiated=true)
    }
    override fun onOwnerReady(){if(!initialized){initialized=true;history=intent.getBooleanExtra("history",false);if(history)showHistory()else saleScreen()}}
    private fun optionBg(selected:Boolean,radiusDp:Float=12f)=GradientDrawable().apply{
        val dp=resources.displayMetrics.density
        cornerRadius=radiusDp*dp
        setColor(if(selected) 0xFFEEF6F4.toInt() else 0xFFFFFFFF.toInt())
        setStroke(((if(selected) 2.5f else 1.5f)*dp).toInt(),if(selected) 0xFF1A7B6E.toInt() else 0xFFD3DDD9.toInt())
    }
    private fun productStockLabel(prod:OwnerProduct):String=when{
        prod.variants.isNotEmpty()->{
            val summary=when(prod.base.stockMode){
                StockMode.ON_REQUEST->"A pedido"
                StockMode.UNLIMITED->"Sin conteo de unidades"
                else->{
                    val total=prod.variants.sumOf{it.quantity.coerceAtLeast(0)}
                    when{
                        total>0->"Disponibles: $total"
                        prod.base.stockMode==StockMode.UNITS && prod.base.soldOut=="ORDER"->"A pedido"
                        else->"Agotado"
                    }
                }
            }
            "${prod.variants.size} variantes · $summary"
        }
        prod.base.stockMode==StockMode.ON_REQUEST->"A pedido"
        prod.base.stockMode==StockMode.UNLIMITED->"Sin conteo de unidades"
        (prod.base.quantity?:0)>0->"Disponibles: ${prod.base.quantity}"
        prod.base.stockMode==StockMode.UNITS && prod.base.soldOut=="ORDER"->"A pedido"
        else->"Agotado"
    }
    private fun variantStockLabel(product:OwnerProduct,variant:Variant):String=when{
        product.base.stockMode==StockMode.ON_REQUEST->"A pedido"
        product.base.stockMode==StockMode.UNLIMITED->"Sin conteo"
        variant.quantity>0->"Disponibles: ${variant.quantity}"
        product.base.stockMode==StockMode.UNITS && product.base.soldOut=="ORDER"->"A pedido"
        else->"Agotado"
    }
    private fun renderProductCards(){
        val container=findViewById<LinearLayout>(R.id.sv_product_cards)?:return
        val dp=resources.displayMetrics.density
        container.removeAllViews()
        products.forEachIndexed{idx,prod->
            val isSel=idx==selectedProductIndex
            val stockText=productStockLabel(prod)
            val shownPrice=prod.variants.firstOrNull()?.priceClp?:prod.base.priceClp
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
                contentDescription="${prod.base.name}, $stockText, ${priceLabel(shownPrice)}"
            }
            val infoCol=LinearLayout(this).apply{
                orientation=LinearLayout.VERTICAL
                layoutParams=LinearLayout.LayoutParams(0,LinearLayout.LayoutParams.WRAP_CONTENT,1f).apply{marginEnd=(10*dp).toInt()}
            }
            val title=TextView(this).apply{
                text=prod.base.name
                textSize=16f
                setTypeface(null,Typeface.BOLD)
                setTextColor(0xFF183A34.toInt())
            }
            val stockInfo=TextView(this).apply{
                text=stockText
                textSize=13f
                setTextColor(if(stockText.endsWith("Agotado")) 0xFFB3261E.toInt() else if(isSel) 0xFF155C43.toInt() else 0xFF4A6560.toInt())
            }
            infoCol.addView(title);infoCol.addView(stockInfo)
            val price=TextView(this).apply{
                text=priceLabel(shownPrice)
                textSize=15f
                setTypeface(null,Typeface.BOLD)
                setTextColor(if(isSel) 0xFF155C43.toInt() else 0xFF1A7B6E.toInt())
                fontFeatureSettings="tnum"
            }
            card.addView(infoCol);card.addView(price)
            card.setOnClickListener{selectProduct(idx)}
            container.addView(card)
        }
        applyAccessibility(container,settings)
    }
    private fun renderVariantChips(p:OwnerProduct?){
        val container=findViewById<LinearLayout>(R.id.sv_variant_chips)?:return
        val dp=resources.displayMetrics.density
        container.removeAllViews()
        val list=p?.variants.orEmpty()
        list.forEachIndexed{idx,v->
            val isSel=idx==selectedVariantIndex
            val availLabel=p?.let{variantStockLabel(it,v)}.orEmpty()
            val variantPrice=v.priceClp?:p?.base?.priceClp?:0L
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
                contentDescription="${v.label}, ${priceLabel(variantPrice)}, $availLabel"
            }
            val thumb=ImageView(this).apply{
                layoutParams=LinearLayout.LayoutParams((40*dp).toInt(),(40*dp).toInt()).apply{marginEnd=(8*dp).toInt()}
                scaleType=ImageView.ScaleType.CENTER_CROP
                setImageResource(when(v.photo?:p?.base?.photo){"flores"->R.drawable.flores;"bandejas"->R.drawable.bandejas;else->R.drawable.ic_products})
            }
            PublicImageLoader.load(lifecycleScope,thumb,v.photo?:p?.base?.photo.orEmpty(),BuildConfig.SUPABASE_URL)
            val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
            col.addView(TextView(this).apply{text=v.label;textSize=14f;setTypeface(null,Typeface.BOLD);setTextColor(0xFF183A34.toInt());maxLines=1})
            col.addView(TextView(this).apply{
                text="${priceLabel(variantPrice)} · $availLabel"
                textSize=13f
                fontFeatureSettings="tnum"
                setTextColor(if(availLabel=="Agotado") 0xFFB3261E.toInt() else if(isSel) 0xFF155C43.toInt() else 0xFF4A6560.toInt())
            })
            chip.addView(thumb);chip.addView(col)
            chip.setOnClickListener{selectVariant(idx)}
            container.addView(chip)
        }
        applyAccessibility(container,settings)
    }
    private fun selectProduct(idx:Int){
        if(pending!=null || idx !in products.indices) return
        selectedProductIndex=idx
        val p=products[idx]
        selectedVariantIndex=p.variants.indexOfFirst{p.saleError(it.id,1)==null}.coerceAtLeast(0)
        findViewById<Spinner>(R.id.sv_product)?.setSelection(idx,false)
        variants()
    }
    private fun selectVariant(idx:Int){
        val p=products.getOrNull(selectedProductIndex)?:return
        if(pending!=null || idx !in p.variants.indices) return
        selectedVariantIndex=idx
        findViewById<Spinner>(R.id.sv_variant)?.setSelection(idx,false)
        renderVariantChips(p)
        updatePrice()
    }
    private fun variants(){
        val p=products.getOrNull(selectedProductIndex)
        val hasVariants=p?.variants?.isNotEmpty()==true
        selectedVariantIndex=if(hasVariants) selectedVariantIndex.coerceIn(0,p!!.variants.lastIndex) else 0
        choices(R.id.sv_variant,p?.variants?.map{it.label}.orEmpty().ifEmpty{listOf("Sin variantes")},selectedVariantIndex)
        findViewById<View>(R.id.sv_variant_section)?.isVisible=hasVariants
        findViewById<View>(R.id.sv_variant_label)?.isVisible=hasVariants
        renderProductCards()
        renderVariantChips(p)
        updatePrice()
    }
    private fun saleScreen(){action("Cargando tus productos…"){
        products=workspace.sync(shopId).products
        pending=workspace.saleDraft(shopId)
        ownerFairCalendar=runCatching{RepositoryProvider.shops().listOwnerFairCalendar(shopId)}.getOrDefault(emptyList())
        screen(R.layout.screen_owner_sales)
        if(pending!=null){
            val pIdx=products.indexOfFirst{it.base.id==pending!!.optString("productId")}
            selectedProductIndex=if(pIdx>=0) pIdx else 0
            val p=products.getOrNull(selectedProductIndex)
            val vId=pending!!.nullableString("variantId")
            selectedVariantIndex=if(vId!=null && p!=null) p.variants.indexOfFirst{it.id==vId}.coerceAtLeast(0) else 0
        }else{
            val availableIdx=products.indexOfFirst{prod->
                if(prod.variants.isNotEmpty()) prod.variants.any{prod.saleError(it.id,1)==null}
                else prod.saleError(null,1)==null
            }
            selectedProductIndex=if(availableIdx>=0) availableIdx else 0
            val p=products.getOrNull(selectedProductIndex)
            selectedVariantIndex=p?.variants?.indexOfFirst{p.saleError(it.id,1)==null}?.coerceAtLeast(0)?:0
        }
        val productSpinner=findViewById<Spinner>(R.id.sv_product)
        val variantSpinner=findViewById<Spinner>(R.id.sv_variant)
        choices(R.id.sv_product,products.map{it.base.name},selectedProductIndex)
        productSpinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{
            override fun onNothingSelected(p:AdapterView<*>?){}
            override fun onItemSelected(p:AdapterView<*>?,v:View?,i:Int,id:Long){
                if(i!=selectedProductIndex && i in products.indices && pending==null) selectProduct(i)
            }
        }
        variantSpinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{
            override fun onNothingSelected(p:AdapterView<*>?){}
            override fun onItemSelected(p:AdapterView<*>?,v:View?,i:Int,id:Long){
                val current=products.getOrNull(selectedProductIndex)
                if(i!=selectedVariantIndex && current!=null && i in current.variants.indices && pending==null) selectVariant(i)
            }
        }
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
        activeFairNames=(ownerFairCalendar.map{it.fair.name}+platformFairs).distinct()
        val saleFairOptions=listOf("Otro lugar (escribir abajo)")+activeFairNames
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
        placeInput.doAfterTextChanged {
            val currentPriceText=findViewById<TextView>(R.id.sv_price)?.text?.toString().orEmpty()
            if(!currentPriceText.startsWith("Precio por unidad:")) updatePrice()
        }
        val startInFeria=initialPlace.isBlank()||initialPlace in activeFairNames
        setPlaceMode(startInFeria)
        click(R.id.sv_place_feria){
            if(pending!=null) return@click
            setPlaceMode(true)
            if(fairSpinner.selectedItemPosition<=0 && activeFairNames.isNotEmpty()){
                fairSpinner.setSelection(1)
                placeInput.setText(activeFairNames.first())
            }
        }
        click(R.id.sv_place_particular){
            if(pending!=null) return@click
            setPlaceMode(false)
            if(placeInput.text.toString().trim() in activeFairNames||placeInput.text.isNullOrBlank()){
                placeInput.setText("Particular / Entrega directa")
            }
        }
        fairSpinner?.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{
            override fun onNothingSelected(p:AdapterView<*>?){}
            override fun onItemSelected(p:AdapterView<*>?,v:View?,i:Int,id:Long){
                if(pending!=null) return
                if(i>0){
                    placeInput.setText(saleFairOptions[i])
                }else if(placeInput.text.toString().trim() in activeFairNames){
                    placeInput.setText("")
                }
            }
        }
        refreshFairSuggestion(autoApply=(pending==null && initialPlace.isBlank()), userInitiated=false)
        findViewById<Button>(R.id.sv_detect_gps_fair)?.setOnClickListener {
            if(pending!=null) return@setOnClickListener
            val hasLoc=hasLocationPermission()
            if(!hasLoc){
                gpsPermissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))
            }else{
                refreshFairSuggestion(autoApply=true, userInitiated=true)
            }
        }
        variants();lockPending()
        click(R.id.sv_register){confirmSale()}
        click(R.id.sv_history){history=true;showHistory()}
        status(if(pending!=null)"Hay una venta sin respuesta confirmada. Reintenta con los mismos datos para consultar su resultado sin duplicarla." else if(products.isEmpty())"Primero agrega un producto a tu catálogo." else "Elige producto, variante y cantidad. El stock se descuenta al confirmar.")
    }}
    private fun hasLocationPermission():Boolean=
        ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED
    @SuppressLint("MissingPermission")
    private fun readDeviceLocationOrNull():Pair<Double,Double>?{
        if(!hasLocationPermission()) return null
        val lm=getSystemService(LOCATION_SERVICE) as? LocationManager ?: return null
        val best=listOf(LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER,LocationManager.PASSIVE_PROVIDER)
            .mapNotNull{provider->runCatching{lm.getLastKnownLocation(provider)}.getOrNull()}
            .maxByOrNull{it.time} ?: return null
        return best.latitude to best.longitude
    }
    private fun applyFairToPlaceForm(fairName:String){
        if(pending!=null) return
        val saleFairOptions=listOf("Otro lugar (escribir abajo)")+activeFairNames
        val targetIndex=saleFairOptions.indexOf(fairName)
        findViewById<Button>(R.id.sv_place_feria)?.apply{background=optionBg(true,12f);setTextColor(0xFF155C43.toInt())}
        findViewById<Button>(R.id.sv_place_particular)?.apply{background=optionBg(false,12f);setTextColor(0xFF4A6560.toInt())}
        findViewById<Spinner>(R.id.sv_fair_selector)?.apply{
            isVisible=true
            if(targetIndex>0) setSelection(targetIndex)
        }
        findViewById<EditText>(R.id.sv_place)?.setText(fairName)
    }
    private fun refreshFairSuggestion(autoApply:Boolean,userInitiated:Boolean){
        val suggestionBox=findViewById<View>(R.id.sv_fair_suggestion_box)?:return
        val suggestionText=findViewById<TextView>(R.id.sv_fair_suggestion_text)?:return
        val applyButton=findViewById<Button>(R.id.sv_fair_suggestion_apply)?:return
        val gps=readDeviceLocationOrNull()
        val suggestion=suggestFairForSale(
            calendar=ownerFairCalendar,
            now=Instant.now(),
            userLat=gps?.first,
            userLng=gps?.second
        )
        currentFairSuggestion=suggestion
        if(suggestion!=null){
            suggestionBox.isVisible=true
            suggestionText.text=suggestion.label
            applyButton.setOnClickListener {
                applyFairToPlaceForm(suggestion.fair.name)
                status("Lugar fijado en ${suggestion.fair.name}.")
            }
            if(autoApply && pending==null){
                applyFairToPlaceForm(suggestion.fair.name)
                if(userInitiated) status("Feria detectada: ${suggestion.fair.name}.")
            }
        }else{
            suggestionBox.isVisible=false
            if(userInitiated){
                status(
                    if(!hasLocationPermission())"Otorga permiso de ubicación para detectar ferias cercanas en curso."
                    else if(gps==null)"No obtuvimos tu ubicación GPS actual. Puedes elegir la feria de la lista."
                    else "No hay ferias confirmadas para hoy ni en curso a menos de 3 km."
                )
            }
        }
    }
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
            selectedProductIndex=products.indexOfFirst{it.base.id==snapshot.base.id}.coerceAtLeast(0)
            choices(R.id.sv_product,products.map{it.base.name},selectedProductIndex)
            variants()
            val msg="Venta anulada: se devolvieron las unidades de ${snapshot.base.name} a tu catálogo."
            status(msg)
        }
    }
    private fun updatePrice(){
        val priceView=findViewById<TextView>(R.id.sv_price)?:return
        val p=products.getOrNull(selectedProductIndex)?:run{priceView.setText(R.string.e5_screen_owner_sales_8);return}
        val v=p.variants.getOrNull(selectedVariantIndex)
        val unitPrice=v?.priceClp?:p.base.priceClp
        val qty=findViewById<EditText>(R.id.sv_quantity)?.text?.toString()?.trim()?.toIntOrNull()?.coerceAtLeast(1)?:1
        val total=unitPrice*qty
        val words=numberToSpanishWords(total).replaceFirstChar{it.uppercase()}
        val amount=when{
            p.base.stockMode in listOf(StockMode.ON_REQUEST,StockMode.UNLIMITED)->"Sin conteo de unidades"
            p.base.stockMode==StockMode.UNITS && (p.base.quantity?:0)==0 && p.base.soldOut=="ORDER"->"A pedido"
            else->"Disponibles: ${v?.quantity?:p.base.quantity?:0}"
        }
        priceView.text="Precio por unidad: ${priceLabel(unitPrice)}. $amount\nTotal a cobrar: ${priceLabel(total)} (Escrito: $words pesos)"
    }
    private fun lockPending(){
        val editable=pending==null
        listOf(R.id.sv_product,R.id.sv_variant,R.id.sv_quantity,R.id.sv_place,R.id.sv_fair_selector,R.id.sv_qty_minus,R.id.sv_qty_plus,R.id.sv_place_feria,R.id.sv_place_particular,R.id.sv_fair_suggestion_apply,R.id.sv_detect_gps_fair).forEach{findViewById<View>(it)?.isEnabled=editable}
        listOf(R.id.sv_product_cards,R.id.sv_variant_chips).forEach{id->
            val g=findViewById<LinearLayout>(id)?:return@forEach
            for(i in 0 until g.childCount) g.getChildAt(i).isEnabled=editable
        }
        findViewById<Button>(R.id.sv_register).text=if(editable)"Guardar venta" else "Reintentar y confirmar venta"
    }
    private fun showSaleError(message:String){
        status(message)
        Toast.makeText(this,message,Toast.LENGTH_LONG).show()
        findViewById<TextView>(R.id.sv_price)?.text=message
    }
    private fun confirmSale(){
        val product=pending?.let{d->products.find{it.base.id==d.optString("productId")}}?:products.getOrNull(selectedProductIndex)
        if(product==null){
            if(pending!=null){workspace.clearSaleDraft(shopId);pending=null;lockPending()}
            showSaleError("Primero agrega un producto.");return
        }
        val variant=pending?.nullableString("variantId")?.let{vId->product.variants.find{it.id==vId}}?:product.variants.getOrNull(selectedVariantIndex)
        val amount=pending?.optInt("quantity")?:text(R.id.sv_quantity).toIntOrNull()
        val place=pending?.optString("place")?:text(R.id.sv_place)
        if(place.length>240){showSaleError("El lugar puede tener hasta 240 letras.");return}
        if(pending==null){product.saleError(variant?.id,amount)?.let{showSaleError(it);return}}
        else if(amount==null||amount<=0){showSaleError("Escribe una cantidad mayor que cero.");return}
        val dialog=AlertDialog.Builder(this).setTitle(if(pending==null)"Confirmar venta" else "Confirmar venta pendiente")
            .setMessage("$amount × ${product.base.name}${variant?.let{" · ${it.label}"}?:""}\nPrecio por unidad: ${priceLabel(variant?.priceClp?:product.base.priceClp)}\nLugar: ${place.ifBlank{"No indicado"}}\nEl servidor verificará el stock.")
            .setNegativeButton("Volver",null).setPositiveButton("Confirmar"){_,_->
                action("Confirmando venta…"){
                    val data=pending?:JSONObject().put("productId",product.base.id).put("variantId",variant?.id?:JSONObject.NULL).put("quantity",amount).put("place",place)
                    pending=data;workspace.saveSaleDraft(shopId,data);lockPending()
                    try{
                        val soldQty=data.getInt("quantity")
                        val soldProductId=data.getString("productId")
                        val soldVariantId=data.nullableString("variantId")
                        RepositoryProvider.sales().registerSale(shopId,soldProductId,soldVariantId,soldQty,data.getString("place"))
                        workspace.clearSaleDraft(shopId);pending=null
                        products=workspace.sync(shopId).products
                        selectedProductIndex=products.indexOfFirst{it.base.id==soldProductId}.coerceAtLeast(0)
                        val updatedProd=products.getOrNull(selectedProductIndex)
                        selectedVariantIndex=if(soldVariantId!=null && updatedProd!=null) updatedProd.variants.indexOfFirst{it.id==soldVariantId}.coerceAtLeast(0) else 0
                        choices(R.id.sv_product,products.map{it.base.name},selectedProductIndex)
                        variants()
                        lockPending()
                        status("Venta registrada. El stock fue actualizado. Puedes registrar otra venta.")
                        Toast.makeText(this@SalesActivity,"Venta registrada en tu tienda.",Toast.LENGTH_SHORT).show()
                        showUndoBanner(product,soldQty)
                        findViewById<EditText>(R.id.sv_quantity).setText("1")
                    }catch(e:BackendException){
                        if(e.status in 400..499 && e.status !in listOf(408,429)){workspace.clearSaleDraft(shopId);pending=null;lockPending()}
                        val msg=e.message?:"No pudimos completar la venta."
                        Toast.makeText(this@SalesActivity,msg,Toast.LENGTH_LONG).show()
                        findViewById<TextView>(R.id.sv_price)?.text=msg
                        throw e
                    }catch(_:IOException){
                        val msg="No tenemos confirmación de esta venta. Conservamos los datos. Pulsa Reintentar cuando vuelva la conexión; no se duplicará."
                        Toast.makeText(this@SalesActivity,msg,Toast.LENGTH_LONG).show()
                        status(msg)
                    }
                }
            }
        if(pending!=null){
            dialog.setNeutralButton("Descartar pendiente"){_,_->
                workspace.clearSaleDraft(shopId);pending=null;lockPending();variants()
                status("Venta pendiente descartada. Elige producto, variante y cantidad.")
            }
        }
        dialog.show()
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
