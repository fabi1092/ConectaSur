plugins { id("com.android.application") }
// Firebase solo se activa si existe android/app/google-services.json (ese archivo NO se sube a GitHub).
if (file("google-services.json").exists()) { apply(plugin = "com.google.gms.google-services") }
android {
    namespace = "cl.surcode.conectasur"
    compileSdk = 36
    defaultConfig {
        applicationId = "cl.surcode.conectasur"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0-demo"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    buildTypes { release { isMinifyEnabled = false } }
    lint { abortOnError = true; warningsAsErrors = false; htmlReport = true; xmlReport = true }
}
dependencies {
    implementation("androidx.activity:activity:1.11.0")
    implementation("androidx.fragment:fragment-ktx:1.8.6")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")
    implementation(platform("com.google.firebase:firebase-bom:34.16.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-storage")
    // GHSA-xxph-c9ww-hj94: actualizar la Guava transitiva de Firestore.
    implementation("com.google.guava:guava:33.7.2-android")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:core:1.7.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
}
