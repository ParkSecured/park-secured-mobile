# ParkSecured Mobile

Expo/React Native mobile app for employee access in the ParkSecured system.

## Live configuration

```text
Cloud API:     https://park-secured-cloud-r62j.onrender.com/api
Web dashboard: https://park-secure-vrxr.onrender.com/
```

The app uses `EXPO_PUBLIC_CLOUD_URL` when provided. If the variable is missing, it falls back to the cloud API above.

## Main flow

1. The employee logs in with the cloud API.
2. The app receives and stores an `accessSeed`.
3. On Android/iOS, the app sends the access code to the ESP32 gate over Bluetooth.
4. On web, Bluetooth is disabled and the app falls back to HTTP validation against the cloud API.

## Development

```bash
npm install
npx expo start
```

## TypeScript check

```bash
npx tsc --noEmit
```
