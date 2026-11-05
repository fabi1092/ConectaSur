package cl.surcode.conectasur.domain

enum class ContactMode(val wire: String, val label: String) {
    WHATSAPP("whatsapp", "WhatsApp"), FORM("form", "Formulario"), BOTH("both", "WhatsApp y formulario");
    val hasWhatsApp get() = this != FORM
    val hasForm get() = this != WHATSAPP
    companion object { fun from(value: String) = entries.find { it.wire == value } ?: FORM }
}

fun whatsappNumber(value: String): String? {
    if (!value.matches(Regex("[+0-9 ()-]+"))) return null
    var digits = value.filter { it in '0'..'9' }
    if (digits.length == 9 && digits.startsWith("9")) digits = "56$digits"
    return digits.takeIf { it.matches(Regex("[1-9][0-9]{7,14}")) }
}

data class ShopMessage(val id: String, val shopId: String, val name: String, val contact: String,
    val body: String, val createdAt: String, val read: Boolean)

interface ShopMessageRepository {
    suspend fun send(id: String, shopId: String, name: String, contact: String, body: String)
    suspend fun inbox(shopId: String, before: ShopMessage? = null): List<ShopMessage>
    suspend fun markRead(id: String)
}
