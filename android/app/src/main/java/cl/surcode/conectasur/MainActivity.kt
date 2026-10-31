package cl.surcode.conectasur

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { ConectaSurBase() }
    }
}

@Composable private fun ConectaSurBase() {
    val forest=Color(0xFF1A7B6E)
    val cream=Color(0xFFFAF7F2)
    val ink=Color(0xFF183A34)
    MaterialTheme(colorScheme=lightColorScheme(primary=forest,background=cream,onBackground=ink,surface=cream,onSurface=ink)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.safeDrawingPadding().padding(24.dp),verticalArrangement=Arrangement.spacedBy(24.dp)) {
                Spacer(Modifier.height(24.dp))
                val logo=ImageBitmap.imageResource(R.drawable.conectasur_brand)
                Canvas(Modifier.fillMaxWidth().aspectRatio(1020f/268f).semantics {
                    contentDescription="ConectaSur por SurCode";role=Role.Image
                }) {
                    drawImage(logo,srcOffset=IntOffset(120,228),srcSize=IntSize(1020,268),
                        dstSize=IntSize(size.width.toInt(),size.height.toInt()))
                }
                Spacer(Modifier.height(16.dp))
                Text("Tu emprendimiento,\nmás cerca",style=MaterialTheme.typography.headlineLarge,fontWeight=FontWeight.SemiBold)
                Text("Un lugar para mostrar tus productos y conectar con tu comunidad.",style=MaterialTheme.typography.bodyLarge)
                Text("Puerto Montt · Alerce",style=MaterialTheme.typography.titleMedium,color=forest)
            }
        }
    }
}
