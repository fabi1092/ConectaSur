package cl.surcode.conectasur

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.speech.RecognizerIntent
import android.util.Base64
import android.view.View
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.domain.*
import cl.surcode.conectasur.ui.*
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

class ProductEditorActivity : OwnerActivity() {
    override val titleText="Crear o editar producto"
    private var initialized=false
    private var binding=false
    private lateinit var draft:JSONObject
    private var step=0
    private var photoTarget="main"
    private var cameraUri:Uri?=null
    private var deferredPhoto:Uri?=null
    private var dictationField="description"
    private val types=mutableListOf("artesania","ropa","alimento","planta","hogar","otro")
    private val typeNames=mutableListOf("Artesanía (incluye flores tejidas y fibras vegetales)","Ropa y tejidos","Alimentos","Planta viva","Hogar y accesorios","Otro producto")
    private val specific=mutableMapOf(
        "artesania" to listOf("Material","Técnica","Medidas"),"ropa" to listOf("Material","Cuidados"),
        "alimento" to listOf("Ingredientes","Alérgenos","Contenido o porción","Conservación","Fecha de elaboración o vencimiento"),
        "planta" to listOf("Especie","Cuidados","Tamaño"),"hogar" to listOf("Material","Medidas","Cuidados"),"otro" to listOf("Características"))
    private val gallery=registerForActivityResult(ActivityResultContracts.GetContent()){uri->if(uri!=null)encodePhoto(uri)}
    private val camera=registerForActivityResult(ActivityResultContracts.TakePicture()){success->if(success)cameraUri?.let(::encodePhoto)}
    private val dictation=registerForActivityResult(ActivityResultContracts.StartActivityForResult()){result->
        val phrase=result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if(phrase!=null && initialized){draft.put(dictationField,phrase);val id=if(dictationField=="name")R.id.pe_name else R.id.pe_description;findViewById<EditText>(id).setText(phrase);persist()}
    }
    override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);photoTarget=savedInstanceState?.getString("photoTarget")?:"main";cameraUri=savedInstanceState?.getString("cameraUri")?.let(Uri::parse);dictationField=savedInstanceState?.getString("dictationField")?:"description"}
    override fun onOwnerReady(){
        if(initialized)return
        action("Recuperando tu borrador…"){
            val existing=workspace.draft(shopId);val requested=intent.getStringExtra("productId")
            if(existing!=null && (requested==null || existing.optString("id")==requested))draft=existing
            else if(requested!=null){
                val rows=workspace.cached(shopId).ifEmpty{workspace.sync(shopId).products}
                val item=rows.find{it.base.id==requested}?:throw IllegalArgumentException("No encontramos ese producto.")
                draft=fromProduct(item)
            }else{
                val defaults=workspace.configuration(shopId).getJSONObject("default_products")
                draft=JSONObject().put("id",UUID.randomUUID().toString()).put("step",0).put("name","").put("description","")
                    .put("category","Artesanías").put("price","").put("productType","artesania").put("attributes",JSONObject())
                    .put("mode",defaults.getString("stockMode")).put("soldOut",defaults.getString("soldOut")).put("visible",defaults.getBoolean("visible"))
                    .put("showPrice",defaults.getBoolean("showPrice")).put("quantity","1").put("photo","").put("variants",JSONArray())
            }
            val definitions=workspace.productTypes(shopId)
            for(i in 0 until definitions.length()) { val value=definitions.getJSONObject(i);val id=value.getString("id")
                if(id !in types){types.add(id);typeNames.add(value.getString("name"));specific[id]=value.optJSONObject("fields")?.keys()?.asSequence()?.toList().orEmpty()}
            }
            val currentType=draft.optString("productType")
            if(currentType !in types){types.add(currentType);typeNames.add(currentType);specific[currentType]=draft.optJSONObject("attributes")?.keys()?.asSequence()?.toList().orEmpty()}
            initialized=true;step=draft.optInt("step",0).coerceIn(0,3);build();persist();deferredPhoto?.let{deferredPhoto=null;encodePhoto(it)};status("Borrador recuperable. Puedes avanzar o volver sin perder los datos.")
        }
    }
    private fun fromProduct(p:OwnerProduct)=JSONObject().put("id",p.base.id).put("step",1).put("name",p.base.name).put("description",p.base.description)
        .put("category",p.base.category).put("price",p.base.priceClp.toString()).put("productType",p.base.productType.ifBlank{"artesania"}).put("attributes",JSONObject(p.base.attributes))
        .put("mode",p.base.stockMode.name).put("quantity",p.base.quantity?.toString()?:"").put("soldOut",p.base.soldOut).put("visible",p.base.visible).put("showPrice",p.base.showPrice)
        .put("photo",p.base.photo).put("variants",JSONArray().apply{p.variants.forEach{put(JSONObject().put("id",it.id).put("label",it.label).put("quantity",it.quantity.toString()).put("priceClp",it.priceClp?.toString()?:"").put("photo",it.photo?:""))}})
    private fun persist(){if(initialized && !binding){draft.put("step",step);workspace.saveDraft(shopId,draft)}}
    private fun build(){
        binding=true;screen(R.layout.screen_product_editor)
        fun bind(id:Int,key:String){findViewById<EditText>(id).setText(draft.optString(key));findViewById<EditText>(id).doAfterTextChanged{if(!binding){draft.put(key,it.toString());persist()}}}
        bind(R.id.pe_name,"name");bind(R.id.pe_description,"description");bind(R.id.pe_category,"category");bind(R.id.pe_price,"price");bind(R.id.pe_quantity,"quantity")
        choices(R.id.pe_type,typeNames,types.indexOf(draft.optString("productType")))
        choices(R.id.pe_mode,modes,modeValues.indexOf(StockMode.valueOf(draft.getString("mode"))))
        choices(R.id.pe_soldout,soldOutLabels,soldOutValues.indexOf(draft.getString("soldOut")))
        findViewById<CheckBox>(R.id.pe_visible).apply{isChecked=draft.getBoolean("visible");setOnCheckedChangeListener{_,v->if(!binding){draft.put("visible",v);persist()}}}
        findViewById<CheckBox>(R.id.pe_show_price).apply{isChecked=draft.getBoolean("showPrice");setOnCheckedChangeListener{_,v->if(!binding){draft.put("showPrice",v);persist()}}}
        fun spinner(id:Int,callback:(Int)->Unit){findViewById<Spinner>(id).onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,i:Int,n:Long){if(!binding)callback(i)}}}
        spinner(R.id.pe_type){i->draft.put("productType",types[i]);renderAttributes();persist()}
        spinner(R.id.pe_mode){i->draft.put("mode",modeValues[i].name);availability();persist()}
        spinner(R.id.pe_soldout){i->draft.put("soldOut",soldOutValues[i]);persist()}
        click(R.id.pe_camera){photoTarget="main";takePhoto()};click(R.id.pe_gallery){photoTarget="main";gallery.launch("image/*")}
        click(R.id.pe_dictate){AlertDialog.Builder(this).setTitle("¿Qué deseas dictar?").setItems(arrayOf("Nombre","Descripción")){_,i->
            dictationField=if(i==0)"name" else "description"
            try{dictation.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_LANGUAGE,"es-CL"))}
            catch(_:Exception){status("El dictado no está disponible en este teléfono. Puedes usar el micrófono del teclado o escribir.")}
        }.show()}
        click(R.id.pe_add_variant){
            val rows=draft.getJSONArray("variants")
            if(rows.length()>=20){status("Puedes agregar hasta 20 variantes por producto.");return@click}
            rows.put(JSONObject().put("id",UUID.randomUUID().toString()).put("label","").put("quantity","1").put("priceClp","").put("photo",""));persist();renderVariants()
        }
        click(R.id.pe_previous){step=(step-1).coerceAtLeast(0);persist();showStep()}
        click(R.id.pe_next){step=(step+1).coerceAtMost(3);persist();showStep()}
        click(R.id.pe_save){save()}
        click(R.id.pe_discard){AlertDialog.Builder(this).setTitle("Descartar este borrador").setMessage("Lo ingresado sin guardar se eliminará de este teléfono. El producto publicado no cambia.").setNegativeButton("Conservar",null).setPositiveButton("Descartar"){_,_->initialized=false;workspace.discardDraft(shopId);finish()}.show()}
        renderAttributes();renderVariants();renderPhoto();availability();binding=false;showStep()
    }
    private fun renderAttributes(){
        val box=findViewById<LinearLayout>(R.id.pe_attributes);box.removeAllViews()
        val attrs=draft.getJSONObject("attributes")
        specific[draft.optString("productType")].orEmpty().forEach{label->
            val id=View.generateViewId();box.addView(TextView(this).apply{text=label;textSize=18f;labelFor=id})
            box.addView(EditText(this).apply{this.id=id;hint=label;setText(attrs.optString(label));textSize=18f;minHeight=(56*resources.displayMetrics.density).toInt();isSaveEnabled=false
                doAfterTextChanged{attrs.put(label,it.toString());persist()}})
        }
        applyAccessibility(box,settings)
    }
    private fun renderVariants(){
        val box=findViewById<LinearLayout>(R.id.pe_variants);box.removeAllViews();val rows=draft.getJSONArray("variants")
        for(i in 0 until rows.length()){
            val data=rows.getJSONObject(i);val row=layoutInflater.inflate(R.layout.item_variant_editor,box,false)
            fun bind(id:Int,key:String){row.findViewById<EditText>(id).apply{setText(data.optString(key));doAfterTextChanged{data.put(key,it.toString());persist()}}}
            bind(R.id.pv_label,"label");bind(R.id.pv_price,"priceClp");bind(R.id.pv_quantity,"quantity")
            row.findViewById<TextView>(R.id.pv_photo_status).text=if(data.optString("photo").isBlank())"Usará la foto principal." else "Foto propia lista."
            row.findViewById<Button>(R.id.pv_photo).setOnClickListener{photoTarget=data.getString("id");gallery.launch("image/*")}
            row.findViewById<Button>(R.id.pv_remove).setOnClickListener{AlertDialog.Builder(this).setTitle("Quitar variante").setMessage("Se quitará esta opción del borrador.").setNegativeButton("Conservar",null).setPositiveButton("Quitar"){_,_->rows.remove(i);persist();renderVariants()}.show()}
            box.addView(row);applyAccessibility(row,settings)
        }
    }
    private fun availability(){
        val mode=StockMode.valueOf(draft.getString("mode"));val tracked=mode in listOf(StockMode.UNITS,StockMode.UNIQUE)
        findViewById<View>(R.id.pe_quantity).isVisible=tracked && draft.getJSONArray("variants").length()==0
        findViewById<View>(R.id.pe_soldout).isVisible=mode==StockMode.UNITS
        findViewById<View>(R.id.pe_soldout_label).isVisible=mode==StockMode.UNITS
    }
    private fun showStep(){
        for(i in 0..3)findViewById<View>(listOf(R.id.pe_step_0,R.id.pe_step_1,R.id.pe_step_2,R.id.pe_step_3)[i]).isVisible=i==step
        findViewById<TextView>(R.id.pe_step).text="Paso ${step+1} de 4: "+listOf("Foto","Datos del producto","Variantes","Disponibilidad y publicación")[step]
        findViewById<View>(R.id.pe_previous).isVisible=step>0;findViewById<View>(R.id.pe_next).isVisible=step<3;findViewById<View>(R.id.pe_save).isVisible=step==3
        findViewById<TextView>(R.id.pe_review).text="${draft.optString("name")}\nPrecio: ${draft.optString("price")} pesos chilenos\n${draft.getJSONArray("variants").length()} variantes.\nSolo se publicará cuando confirmes Guardar producto."
        (findViewById<View>(R.id.pe_step).parent?.parent as? ScrollView)?.smoothScrollTo(0,0)
        availability()
    }
    private fun takePhoto(){
        try{
            val file=File(File(cacheDir,"product_photos").apply{mkdirs()},"producto-${UUID.randomUUID()}.jpg").apply{createNewFile()}
            cameraUri=FileProvider.getUriForFile(this,"$packageName.files",file);camera.launch(requireNotNull(cameraUri))
        }catch(_:Exception){status("No se pudo abrir la cámara. Puedes elegir una foto de la galería.")}
    }
    private fun encodePhoto(uri:Uri){if(!initialized){deferredPhoto=uri;return};lifecycleScope.launch{
        try{
            val bytes=LogoEncoder.jpeg(contentResolver,uri);val encoded="data:image/jpeg;base64,"+Base64.encodeToString(bytes,Base64.NO_WRAP)
            if(photoTarget=="main")draft.put("photo",encoded)else{val rows=draft.getJSONArray("variants");for(i in 0 until rows.length()){val row=rows.getJSONObject(i);if(row.getString("id")==photoTarget)row.put("photo",encoded)}}
            persist();renderPhoto();if(photoTarget!="main")renderVariants()
            if(uri==cameraUri){val fileName=uri.lastPathSegment?.substringAfterLast('/');if(fileName!=null && Regex("producto-[a-fA-F0-9-]+\\.jpg").matches(fileName))File(File(cacheDir,"product_photos"),fileName).delete();cameraUri=null}
            status("Foto comprimida y guardada en tu borrador.")
        }catch(e:Exception){status(e.message?:"No se pudo preparar la foto. Tu borrador se conserva.")}
    }}
    private fun renderPhoto(){
        val photo=draft.optString("photo");val image=findViewById<ImageView>(R.id.pe_photo)
        if(photo.startsWith("data:")){val bytes=Base64.decode(photo.substringAfter(','),Base64.NO_WRAP);image.setImageBitmap(android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.size))}
        else PublicImageLoader.load(lifecycleScope,image,photo,BuildConfig.SUPABASE_URL)
        findViewById<TextView>(R.id.pe_photo_status).text=if(photo.isBlank())"Aún no eliges una foto." else "Foto lista. Revisa que el producto se vea completo."
    }
    private fun product():OwnerProduct{
        val name=draft.optString("name").trim();require(name.length in 1..120){"Escribe un nombre de hasta 120 letras."}
        val price=draft.optString("price").toLongOrNull();require(price!=null && price in 0..9007199254740991L){"Escribe un precio válido en pesos chilenos."}
        require(draft.optString("description").length<=1000 && draft.optString("category").length<=120){"La descripción o categoría es demasiado larga."}
        if(draft.optBoolean("visible"))require(draft.optString("photo").isNotBlank()){ "Elige una foto antes de publicar. Puedes conservar el borrador sin publicarlo." }
        val mode=StockMode.valueOf(draft.getString("mode"));val rows=draft.getJSONArray("variants")
        require(mode!=StockMode.UNIQUE || rows.length()==0){"Una pieza única no tiene variantes. Quita las variantes o elige Regular."}
        val variants=(0 until rows.length()).map{i->val v=rows.getJSONObject(i);val label=v.optString("label").trim();require(label.length in 1..120){"Escribe un nombre para cada variante."}
            val amount=if(mode in listOf(StockMode.ON_REQUEST,StockMode.UNLIMITED))0 else v.optString("quantity").toIntOrNull();require(amount!=null && amount>=0){"Revisa las unidades de cada variante."}
            val ownPrice=v.optString("priceClp").takeIf{it.isNotBlank()}?.let{it.toLongOrNull()?:throw IllegalArgumentException("Revisa el precio de cada variante.")};require(ownPrice==null||ownPrice in 0..9007199254740991L){"El precio de la variante no es válido."}
            Variant(v.getString("id"),label,amount,ownPrice,v.optString("photo").takeIf{it.isNotBlank()})}
        val quantity=when(mode){StockMode.ON_REQUEST,StockMode.UNLIMITED->null;else->if(variants.isNotEmpty()){val total=variants.sumOf{it.quantity.toLong()};require(total<=Int.MAX_VALUE){"Demasiadas unidades."};total.toInt()}else draft.optString("quantity").toIntOrNull()}
        require(mode in listOf(StockMode.ON_REQUEST,StockMode.UNLIMITED) || (quantity!=null && quantity>=0)){"Revisa la cantidad disponible."}
        require(mode!=StockMode.UNIQUE || quantity in 0..1){"Una pieza única puede tener cero o una unidad."}
        val attrs=draft.getJSONObject("attributes");val attributes=attrs.keys().asSequence().associateWith{attrs.getString(it)}
        return OwnerProduct(CatalogProduct(draft.getString("id"),shopId,name,draft.optString("description"),draft.optString("category"),price,draft.getBoolean("showPrice"),mode,quantity,draft.getBoolean("visible"),draft.getString("photo"),draft.getString("productType"),attributes,draft.getString("soldOut")),variants)
    }
    private fun save(){
        val item=try{product()}catch(e:Exception){status(e.message?:"Revisa los datos del producto.");return}
        action("Guardando producto y fotos…"){
            val result=workspace.save(shopId,item);workspace.discardDraft(shopId);initialized=false
            Toast.makeText(this,if(result.offline)"Producto guardado sin conexión. Se enviará al volver la red." else "Producto guardado en tu catálogo.",Toast.LENGTH_LONG).show();finish()
        }
    }
    override fun onStop(){persist();super.onStop()}
    override fun onSaveInstanceState(outState:Bundle){outState.putString("photoTarget",photoTarget);outState.putString("cameraUri",cameraUri?.toString());outState.putString("dictationField",dictationField);super.onSaveInstanceState(outState)}
}