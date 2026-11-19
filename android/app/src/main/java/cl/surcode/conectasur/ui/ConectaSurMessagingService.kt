package cl.surcode.conectasur.ui

import cl.surcode.conectasur.data.NotificationConsentStore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class ConectaSurMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        NotificationConsentStore(applicationContext).saveTokenIfConsented(token)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        val data = remoteMessage.data
        val type = data["type"]
        val title = remoteMessage.notification?.title ?: data["title"]
        val body = remoteMessage.notification?.body ?: data["body"]
        val fairId = data["fair_id"] ?: data["fairId"]
        val fairName = data["fair_name"] ?: data["fairName"]
        val shopId = data["shop_id"] ?: data["shopId"]
        FirebasePushManager.showIncomingNotification(
            context = applicationContext,
            type = type,
            rawTitle = title,
            rawBody = body,
            fairId = fairId,
            fairName = fairName,
            shopId = shopId
        )
    }
}
