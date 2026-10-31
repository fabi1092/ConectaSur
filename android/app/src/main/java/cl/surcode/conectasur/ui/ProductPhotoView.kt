package cl.surcode.conectasur.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Matrix
import android.util.AttributeSet
import android.widget.ImageView

/** Keeps the upper part of the visit photographs visible when filling a product card. */
class ProductPhotoView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null, defStyleAttr: Int = 0
) : ImageView(context, attrs, defStyleAttr) {
    init { scaleType = ScaleType.MATRIX }
    override fun onDraw(canvas: Canvas) {
        drawable?.let { photo ->
            if (width > 0 && height > 0 && photo.intrinsicWidth > 0 && photo.intrinsicHeight > 0) {
                val scale = maxOf(width.toFloat() / photo.intrinsicWidth, height.toFloat() / photo.intrinsicHeight)
                imageMatrix = Matrix().apply {
                    setScale(scale, scale)
                    postTranslate((width - photo.intrinsicWidth * scale) / 2, 0f)
                }
            }
        }
        super.onDraw(canvas)
    }
}
