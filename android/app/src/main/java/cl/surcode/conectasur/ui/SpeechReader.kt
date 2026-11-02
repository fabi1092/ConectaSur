package cl.surcode.conectasur.ui

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.widget.Toast
import cl.surcode.conectasur.R

class SpeechReader(private val context: Context, private val state: (Boolean) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private var engine: TextToSpeech? = null
    private var ready = false
    private var pending: Pair<String, Float>? = null
    private var closed = false
    var active = false
        private set
    private fun update(value: Boolean) { active = value; state(value) }
    fun read(text: String, slow: Boolean) {
        stop()
        pending = cl.surcode.conectasur.domain.chileanSpeech(text) to if (slow) 0.75f else 1f
        update(true)
        if (engine == null) {
            engine = TextToSpeech(context) { status -> main.post {
                if (!closed) {
                    ready = status == TextToSpeech.SUCCESS
                    if (ready) playPending() else unavailable()
                }
            } }
            engine?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(id: String?) = Unit
                override fun onDone(id: String?) { main.post { if (!closed) update(false) } }
                @Deprecated("Required by TextToSpeech")
                override fun onError(id: String?) { main.post { if (!closed) unavailable() } }
            })
        } else if (ready) playPending() else unavailable()
    }
    private fun playPending() {
        val request = pending ?: return
        pending = null
        val tts = engine ?: return unavailable()
        val voice = tts.voices?.filter { it.locale.language == "es" && !it.isNetworkConnectionRequired }
            ?.sortedBy { if (it.locale.country == "CL") 0 else 1 }?.firstOrNull() ?: return unavailable()
        tts.voice = voice
        tts.setSpeechRate(request.second)
        if (tts.speak(request.first, TextToSpeech.QUEUE_FLUSH, null, "screen") == TextToSpeech.ERROR) unavailable()
    }
    private fun unavailable() { pending = null; update(false); Toast.makeText(context, R.string.voice_unavailable, Toast.LENGTH_LONG).show() }
    fun stop() { pending = null; engine?.stop(); update(false) }
    fun close() { closed = true; pending = null; engine?.stop(); engine?.shutdown(); engine = null }
}
