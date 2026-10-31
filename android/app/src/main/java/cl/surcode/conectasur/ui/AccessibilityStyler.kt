package cl.surcode.conectasur.ui

import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CompoundButton
import android.widget.EditText
import android.widget.TextView
import cl.surcode.conectasur.R
import cl.surcode.conectasur.data.AccessibilitySettings

fun applyAccessibility(view: View, settings: AccessibilitySettings) {
    if (view is TextView) {
        val base = (view.getTag(R.id.base_text_size) as? Float) ?: view.textSize.also {
            view.setTag(R.id.base_text_size, it)
        }
        view.setTextSize(TypedValue.COMPLEX_UNIT_PX, base * settings.textScale)
    }
    if (view is Button || view is CompoundButton || view is EditText) {
        val base = (view.getTag(R.id.base_min_height) as? Int) ?: view.minimumHeight.also {
            view.setTag(R.id.base_min_height, it)
        }
        val dp = if (settings.largeButtons) 72 else 56
        view.minimumHeight = maxOf(base, (dp * view.resources.displayMetrics.density).toInt())
    }
    if (view is ViewGroup) for (i in 0 until view.childCount) applyAccessibility(view.getChildAt(i), settings)
}
