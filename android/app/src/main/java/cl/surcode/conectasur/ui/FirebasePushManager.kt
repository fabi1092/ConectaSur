package cl.surcode.conectasur.ui

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.result.ActivityResultLauncher
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import cl.surcode.conectasur.BuildConfig
import cl.surcode.conectasur.MainActivity
import cl.surcode.conectasur.R
import cl.surcode.conectasur.data.AccessibilityPreferences
import cl.surcode.conectasur.data.NotificationConsentStore
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object FirebasePushManager {
    const val CHANNEL_INVITATIONS = "conectasur_invitations"
    const val CHANNEL_FOLLOWERS = "conectasur_followers"
    const val EXTRA_PUSH_TYPE = "push_type"
    const val EXTRA_FAIR_ID = "fair_id"
    const val EXTRA_FAIR_NAME = "fair_name"
    const val EXTRA_SHOP_ID = "shop_id"

    fun ensureInitialized(context: Context): Boolean {
        val appContext = context.applicationContext
        if (FirebaseApp.getApps(appContext).any { it.name == FirebaseApp.DEFAULT_APP_NAME }) return true
        val apiKey = BuildConfig.FIREBASE_API_KEY.trim()
        val appId = BuildConfig.FIREBASE_APP_ID.trim()
        val projectId = BuildConfig.FIREBASE_PROJECT_ID.trim()
        if (apiKey.isBlank() || appId.isBlank() || projectId.isBlank()) return false
        val senderId = NotificationConsentStore.extractGcmSenderId(appId)
        val options = FirebaseOptions.Builder()
            .setApiKey(apiKey)
            .setApplicationId(appId)
            .setProjectId(projectId)
            .apply { if (!senderId.isNullOrBlank()) setGcmSenderId(senderId) }
            .build()
        return runCatching {
            FirebaseApp.initializeApp(appContext, options)
            true
        }.getOrDefault(false)
    }

    fun createChannels(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val invitations = NotificationChannel(
            CHANNEL_INVITATIONS,
            "Invitaciones y ferias",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Invitaciones a ferias, recordatorios y avisos para emprendedoras."
        }
        val followers = NotificationChannel(
            CHANNEL_FOLLOWERS,
            "Tiendas y asociaciones seguidas",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Avisos cuando una tienda o asociación que sigues confirma una feria."
        }
        manager.createNotificationChannel(invitations)
        manager.createNotificationChannel(followers)
    }

    fun hasSystemPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun statusSummary(context: Context): String {
        val store = NotificationConsentStore(context)
        if (!store.isConsented()) {
            return "Avisos desactivados. No recibirás notificaciones hasta dar tu consentimiento."
        }
        if (!hasSystemPermission(context)) {
            return "Consentimiento guardado, pero falta autorizar el permiso de notificaciones del teléfono."
        }
        val tokenReady = store.lastToken() != null
        return if (tokenReady) {
            "Avisos activados con tu permiso. Horario: ${store.formatScheduleLabel()}. Puedes darte de baja cuando quieras."
        } else {
            "Avisos activados. Horario: ${store.formatScheduleLabel()}. Registrando dispositivo para recibir notificaciones."
        }
    }

    fun requestConsentAndEnable(
        activity: Activity,
        permissionLauncher: ActivityResultLauncher<String>,
        reasonMessage: String = "ConectaSur puede enviarte avisos sobre invitaciones a ferias y confirmaciones de tiendas o asociaciones que sigas. Puedes darte de baja cuando quieras desde Ajustes.",
        onStatusChanged: () -> Unit = {}
    ) {
        val store = NotificationConsentStore(activity)
        val dialog = AlertDialog.Builder(activity)
            .setTitle("Permitir avisos y notificaciones")
            .setMessage(reasonMessage)
            .setPositiveButton("Aceptar avisos") { _, _ ->
                store.grantConsent()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasSystemPermission(activity)) {
                    permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    fetchAndStoreToken(activity) { onStatusChanged() }
                }
                onStatusChanged()
            }
            .setNegativeButton("Ahora no", null)
            .create()
        dialog.setOnShowListener {
            applyAccessibility(dialog.window!!.decorView, AccessibilityPreferences(activity.applicationContext).read())
        }
        dialog.show()
    }

    fun onPermissionResult(context: Context, granted: Boolean, onStatusChanged: () -> Unit = {}) {
        val store = NotificationConsentStore(context)
        if (granted && store.isConsented()) {
            fetchAndStoreToken(context) { onStatusChanged() }
        }
        onStatusChanged()
    }

    fun fetchAndStoreToken(context: Context, onComplete: (String?) -> Unit = {}) {
        val appContext = context.applicationContext
        val store = NotificationConsentStore(appContext)
        if (!store.isConsented() || !ensureInitialized(appContext)) {
            onComplete(null)
            return
        }
        runCatching {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                val token = if (task.isSuccessful) task.result?.takeIf { it.isNotBlank() } else null
                if (token != null) {
                    store.saveTokenIfConsented(token)
                    if (cl.surcode.conectasur.data.RepositoryProvider.supabaseReady()) {
                        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                            runCatching {
                                cl.surcode.conectasur.data.RepositoryProvider.push().setNotificationConsent(true)
                                cl.surcode.conectasur.data.RepositoryProvider.push().registerDeviceToken(token)
                            }
                        }
                    }
                }
                onComplete(token)
            }
        }.onFailure { onComplete(null) }
    }

    fun optOut(context: Context, onStatusChanged: () -> Unit = {}) {
        val appContext = context.applicationContext
        val consentStore = NotificationConsentStore(appContext)
        val oldToken = consentStore.lastToken()
        consentStore.revokeConsent()
        NotificationManagerCompat.from(appContext).cancelAll()
        if (cl.surcode.conectasur.data.RepositoryProvider.supabaseReady()) {
            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                runCatching {
                    if (!oldToken.isNullOrBlank()) {
                        cl.surcode.conectasur.data.RepositoryProvider.push().unregisterDeviceToken(oldToken)
                    }
                    cl.surcode.conectasur.data.RepositoryProvider.push().setNotificationConsent(false)
                }
            }
        }
        if (ensureInitialized(appContext)) {
            runCatching {
                FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener { onStatusChanged() }
            }.onFailure { onStatusChanged() }
        } else {
            onStatusChanged()
        }
    }

    fun showIncomingNotification(
        context: Context,
        type: String?,
        rawTitle: String?,
        rawBody: String?,
        fairId: String?,
        fairName: String?,
        shopId: String?
    ) {
        val appContext = context.applicationContext
        val consentStore = NotificationConsentStore(appContext)
        if (!consentStore.shouldDeliverNotificationNow()) return
        if (!hasSystemPermission(appContext)) return
        createChannels(appContext)

        val channelId = if (type == "fair_invitation") CHANNEL_INVITATIONS else CHANNEL_FOLLOWERS
        val (title, body) = NotificationConsentStore.buildFairNotificationText(rawTitle, rawBody, fairName, type)

        val openIntent = Intent(appContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            type?.let { putExtra(EXTRA_PUSH_TYPE, it) }
            fairId?.let { putExtra(EXTRA_FAIR_ID, it) }
            fairName?.let { putExtra(EXTRA_FAIR_NAME, it) }
            shopId?.let { putExtra(EXTRA_SHOP_ID, it) }
        }
        val requestCode = ((fairId ?: shopId ?: type ?: "default").hashCode() and 0x7FFFFFFF)
        val pendingIntent = PendingIntent.getActivity(
            appContext,
            requestCode,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(appContext, channelId)
            .setSmallIcon(R.drawable.ic_location)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(appContext, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) {
            NotificationManagerCompat.from(appContext).notify(requestCode + 100, notification)
        }
    }
}
