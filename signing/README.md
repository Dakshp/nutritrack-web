# Android signing keystore

`release.keystore` signs every APK built by the `android-apk` GitHub Actions
workflow. Android only allows an app to update in place when the new APK is
signed with the SAME key as the installed one - so as long as this file never
changes, every future APK installs over the previous one with all data kept.

- Alias: `nutritrack`
- Store/key password: `nutritrack-release`
- Package id it signs: `com.dakshp.nutritrack.v2`

DO NOT regenerate or replace this file: every phone with the app installed
would then refuse updates until the app is uninstalled (losing its data).

Security note: this repo is public, so this key is public too. That is a
deliberate convenience tradeoff for a personal side-loaded app - the only
realistic risk is that someone could build an APK that installs over your
copy, but they would still need you to download and install it yourself.
To harden later: make the repo private, or move the keystore into a GitHub
Actions secret (base64 of THIS file, not a new one) and delete it from git
history.
