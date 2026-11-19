package cl.surcode.conectasur

import android.app.Application
import cl.surcode.conectasur.ui.FirebasePushManager

class ConectaSurApp : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebasePushManager.ensureInitialized(this)
        FirebasePushManager.createChannels(this)
    }
}
