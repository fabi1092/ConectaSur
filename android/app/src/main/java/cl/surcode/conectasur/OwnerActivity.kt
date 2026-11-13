package cl.surcode.conectasur

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.*
import androidx.biometric.BiometricPrompt
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.domain.*
import cl.surcode.conectasur.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Base de pantallas privadas: sesión por perfil, bloqueo opcional y ayudas existentes. */
abstract class OwnerActivity : FragmentActivity() {
    protected val settings by lazy { AccessibilityPreferences(applicationContext).read() }
    protected val workspace by lazy { RepositoryProvider.ownerWorkspace() }
    protected lateinit var owner: Session
    protected val shopId get() = requireNotNull(owner.shopId)
    protected val content get() = findViewById<FrameLayout>(R.id.owner_container)
    private val biometric by lazy { BiometricStoreLock(applicationContext) }
    private lateinit var reader: SpeechReader
    private var authorized=false
    private var prompting=false
    private var busy=false
    protected abstract val titleText: String
    protected abstract fun onOwnerReady()
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(if(settings.highContrast)R.style.Theme_ConectaSur_HighContrast else R.style.Theme_ConectaSur)
        super.onCreate(savedInstanceState)
        if (!BuildConfig.DEBUG) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContentView(R.layout.activity_owner)
        RepositoryProvider.initialize(applicationContext)
        findViewById<TextView>(R.id.owner_title).text=titleText
        ViewCompat.setAccessibilityHeading(findViewById(R.id.owner_title),true)
        findViewById<TextView>(R.id.owner_status).accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE
        findViewById<Button>(R.id.owner_back).setOnClickListener { finish() }
        findViewById<Button>(R.id.owner_unlock).setOnClickListener { unlock() }
        reader=SpeechReader(this){active->findViewById<Button>(R.id.owner_read).text=if(active)"Detener lectura" else "Escuchar esta pantalla"}
        findViewById<Button>(R.id.owner_read).setOnClickListener {
            if(reader.active)reader.stop() else {
                fun words(v: View): String = when(v) {
                    is EditText-> v.text.toString()
                    is TextView->v.text.toString()
                    is ViewGroup->(0 until v.childCount).map {v.getChildAt(it)}.filter {it.isVisible}.joinToString(". ") {words(it)}
                    else->""
                }
                reader.read(titleText+". "+findViewById<TextView>(R.id.owner_status).text+". "+if(authorized)words(content) else "",settings.slowVoice)
            }
        }
        val root=findViewById<View>(R.id.owner_root)
        ViewCompat.setOnApplyWindowInsetsListener(root){v,insets-> val safe=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime());v.setPadding(safe.left,safe.top,safe.right,safe.bottom);insets}
        wireBottomNav()
        applyAccessibility(root,settings)
    }
    private fun wireBottomNav() {
        val navHome = findViewById<Button>(R.id.owner_nav_home) ?: return
        val navProducts = findViewById<Button>(R.id.owner_nav_products)
        val navSales = findViewById<Button>(R.id.owner_nav_sales)
        val navHelp = findViewById<Button>(R.id.owner_nav_help)
        navProducts?.isSelected = this is ProductManagerActivity || this is ProductEditorActivity
        navSales?.isSelected = this is SalesActivity
        navHome.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java).putExtra("screen", "home").addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            finish()
        }
        navProducts?.setOnClickListener {
            if (this !is ProductManagerActivity) {
                startActivity(Intent(this, ProductManagerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
                finish()
            }
        }
        navSales?.setOnClickListener {
            if (this !is SalesActivity) {
                startActivity(Intent(this, SalesActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
                if (this !is ProductManagerActivity) finish()
            }
        }
        navHelp?.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java).putExtra("screen", "help").addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            finish()
        }
    }
    override fun onStart() { super.onStart();content.isVisible=false;if(biometric.enabled && !BiometricStoreLock.isSessionUnlocked()){status("Tu tienda está protegida. Pulsa Desbloquear con huella.");findViewById<View>(R.id.owner_unlock).isVisible=true}else validate() }
    private fun validate() = lifecycleScope.launch {
        try {
            val session=RepositoryProvider.auth().currentSession()
            if(!lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)) return@launch
            if(session?.role!=Role.EMPRENDEDORA || session.shopId.isNullOrBlank()){status("Ingresa con una cuenta de emprendedora desde Mi tienda.");return@launch}
            owner=session;authorized=true;content.isVisible=true;findViewById<View>(R.id.owner_unlock).isVisible=false
            onOwnerReady();applyAccessibility(content,settings)
        }catch(cancelled:CancellationException){throw cancelled}
        catch(e:Exception){status(e.message?:"No pudimos comprobar tu acceso.")}
    }
    private fun unlock() {
        if(prompting)return
        try {
            val cipher=biometric.unlockCipher();prompting=true
            val prompt=BiometricPrompt(this,ContextCompat.getMainExecutor(this),object:BiometricPrompt.AuthenticationCallback(){
                override fun onAuthenticationSucceeded(result:BiometricPrompt.AuthenticationResult){prompting=false;if(result.cryptoObject?.cipher?.let(biometric::finishUnlock)==true)validate()else status("Ingresa nuevamente desde Mi tienda.")}
                override fun onAuthenticationError(code:Int,text:CharSequence){prompting=false;status("Desbloqueo cancelado. Puedes volver a Mi tienda e ingresar con contraseña.")}
            })
            prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle("Desbloquear mi tienda").setAllowedAuthenticators(BIOMETRIC_STRONG).setNegativeButtonText("Cancelar").build(),BiometricPrompt.CryptoObject(cipher))
        }catch(_:Exception){prompting=false;status("La huella no está disponible. Vuelve a Mi tienda e ingresa con contraseña.")}
    }
    protected fun status(message: String){findViewById<TextView>(R.id.owner_status).text=message}
    protected fun speakFeedback(message: String){if(::reader.isInitialized)reader.read(message,settings.slowVoice)}
    protected fun screen(layout:Int){content.removeAllViews();layoutInflater.inflate(layout,content,true);applyAccessibility(content,settings)}
    protected fun action(message:String,block:suspend ()->Unit){
        if(busy || !authorized)return
        busy=true;status(message);findViewById<View>(R.id.owner_progress).isVisible=true
        lifecycleScope.launch {
            try{block()}catch(cancelled:CancellationException){throw cancelled}catch(e:Exception){status(e.message?:"No pudimos completar la operación. Tus datos se conservan.")}
            finally{busy=false;findViewById<View>(R.id.owner_progress).isVisible=false}
        }
    }
    override fun onStop(){authorized=false;content.isVisible=false;reader.stop();super.onStop()}
    override fun onDestroy(){reader.close();super.onDestroy()}
    protected fun choices(id:Int,values:List<String>,selected:Int=0){findViewById<Spinner>(id).apply{adapter=ArrayAdapter(this@OwnerActivity,android.R.layout.simple_spinner_dropdown_item,values);setSelection(selected.coerceAtLeast(0))}}
    protected fun text(id:Int)=findViewById<EditText>(id).text.toString().trim()
    protected fun checked(id:Int)=findViewById<CheckBox>(id).isChecked
    protected fun option(id:Int)=findViewById<Spinner>(id).selectedItemPosition
    protected fun click(id:Int,block:()->Unit){findViewById<Button>(id).setDebouncedClickListener(500L){block()}}
    companion object {
        val modes=listOf("Regular: contar unidades","Pieza única: una sola unidad","A pedido: sin stock","Regular: sin contar unidades")
        val modeValues=listOf(StockMode.UNITS,StockMode.UNIQUE,StockMode.ON_REQUEST,StockMode.UNLIMITED)
        val soldOutLabels=listOf("Ocultar del catálogo","Mostrar Agotado","Pasar a A pedido")
        val soldOutValues=listOf("HIDE","SHOW","ORDER")
    }
}
