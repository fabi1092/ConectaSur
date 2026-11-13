import java.util.Properties

plugins { id("com.android.application") }
// Configuracion local de cliente; Studio y contrasenas nunca se incluyen en el APK.
val supabase = Properties().apply {
    val config = rootProject.file("supabase.properties")
    if (config.exists()) config.inputStream().use { load(it) }
}
val demoBuild = providers.gradleProperty("conectaDemo").orNull == "true"
val firebase = Properties().apply {
    val config = rootProject.file("firebase.properties")
    if (config.exists()) config.inputStream().use { load(it) }
}
fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
android {
    namespace = "cl.surcode.conectasur"
    compileSdk = 36
    defaultConfig {
        applicationId = "cl.surcode.conectasur"
        minSdk = 26
        targetSdk = 36
        versionCode = 7
        versionName = "0.5.3-google-firebase"
        buildConfigField("String", "SUPABASE_URL", quoted(if (demoBuild) "" else supabase.getProperty("SUPABASE_URL", "")))
        buildConfigField("String", "SUPABASE_ANON_KEY", quoted(if (demoBuild) "" else supabase.getProperty("SUPABASE_ANON_KEY", "")))
        for (key in listOf("FIREBASE_API_KEY", "FIREBASE_APP_ID", "FIREBASE_PROJECT_ID", "GOOGLE_WEB_CLIENT_ID")) {
            buildConfigField("String", key, quoted(if(demoBuild) "" else firebase.getProperty(key, "")))
        }
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    buildFeatures { buildConfig = true }
    buildTypes { release { isMinifyEnabled = false } }
    lint { abortOnError = true; warningsAsErrors = false; htmlReport = true; xmlReport = true }
}
dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.5.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")
    implementation("androidx.activity:activity:1.11.0")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.fragment:fragment-ktx:1.8.9")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.4")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.google.zxing:core:3.5.3")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:core:1.7.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
}
