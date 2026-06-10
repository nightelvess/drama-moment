# Android quick start

This Android project is a lightweight WebView shell for the existing Node web app.

## Run with Android Studio

1. Start the backend from the project root:

```powershell
node server.js
```

2. Open the `android` folder in Android Studio.
3. Sync Gradle.
4. Run `app` on an Android emulator.

The default URL is:

```text
http://10.0.2.2:3000/
```

`10.0.2.2` is the Android emulator alias for the host machine.

## Real device

For a phone connected to the same Wi-Fi network, start the backend on a reachable host:

```powershell
$env:HOST='0.0.0.0'; node server.js
```

Then change `WEB_APP_URL` in:

```text
android/app/build.gradle
```

Example:

```gradle
buildConfigField "String", "WEB_APP_URL", "\"http://192.168.1.10:3000/\""
```

Use your computer's LAN IP, not `localhost` or `10.0.2.2`, for a real phone.

## Server deployment

After deployment, change `WEB_APP_URL` to the server URL:

```gradle
buildConfigField "String", "WEB_APP_URL", "\"https://your-domain.com/\""
```

Use HTTPS for production. The cleartext HTTP config is only for local testing.
