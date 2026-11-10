package cl.surcode.conectasur

import android.content.Context
import android.util.AttributeSet
import android.widget.ImageView

/**
 * ImageView que muestra el logo horizontal oficial de ConectaSur centrado y proporcionado.
 */
class ConectaSurLogoView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : ImageView(context, attrs, defStyleAttr) {
    init {
        scaleType = ScaleType.FIT_CENTER
        setImageResource(R.drawable.conectasur_logo)
    }
}
