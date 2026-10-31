package cl.surcode.conectasur

import android.content.Context
import android.graphics.Matrix
import android.util.AttributeSet
import android.widget.ImageView

/** ImageView compatible con Design; muestra el logo horizontal sin modificar el archivo original. */
class ConectaSurLogoView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : ImageView(context, attrs, defStyleAttr) {
    init {
        scaleType = ScaleType.MATRIX
        setImageResource(R.drawable.conectasur_brand)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        val source = drawable ?: return
        val cropScale = minOf(w / 1020f, h / 268f)
        val scaleX = cropScale * 1600f / source.intrinsicWidth
        val scaleY = cropScale * 872f / source.intrinsicHeight
        imageMatrix = Matrix().apply {
            setScale(scaleX, scaleY)
            postTranslate((w - 1020f * cropScale) / 2 - 120f * cropScale,
                (h - 268f * cropScale) / 2 - 228f * cropScale)
        }
    }
}
