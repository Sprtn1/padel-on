# Padel On — direct-download builds

Every native build now uses the official **assets/logo.svg** as its app icon. Capacitor generates Android adaptive icons, iOS app icons, and branded launch screens; Windows embeds a multi-size Padel On icon in the executable and titlebar. Rebuild to receive the new branding.

The **website remains unchanged**. Supabase data and staff accounts are shared with the mobile and Windows applications. No App Store, Google Play, or Windows Store listings are used.

Go to GitHub → **Actions** → **Direct-download Padel On apps** → **Run workflow**. Under the completed run, open **Artifacts**.

- **PadelOn-Android-APK**: download/unzip \`app-debug.apk\`, then install on Android after allowing installation from that source. This initial **debug-signed** APK is for internal testing. The signing key is generated on the build runner, so installing a subsequent build may require uninstalling the previous APK first. Supabase data is unaffected, but device-local sign-in/drafts can be lost.
- **PadelOn-Windows-EXE**: download/unzip \`PadelOn-1.0.0-x64.exe\` and run it. It is a portable application, not a store installer, and displays the latest live Padel On website. An unsigned EXE may prompt Windows SmartScreen; distribute only from your own trusted repository.
- **PadelOn-iOS-Xcode-Project**: this is **not an installable IPA**. A signed \`.ipa\` cannot be produced without the owner's Apple signing credentials and target-device provisioning. On a Mac with Xcode, open \`ios/App/App.xcodeproj\`, choose an Apple development team, and run on a connected registered iPhone. For an ad hoc IPA distributed beyond that Mac, use an Apple Developer Program membership, an Apple distribution certificate, and a provisioning profile containing the intended iPhone UDIDs. Then select **Product → Archive → Distribute App → Ad Hoc / Release Testing**. Do not put certificates/passwords in the repository.

Android and iOS package a snapshot of the public JavaScript/CSS bundle using Capacitor. New website features need a rebuilt APK/IPA; both continue to use the same Supabase database. The Windows EXE loads the live HTTPS website, so content changes appear when it reloads.

**Keep signing secrets out of GitHub files.** For production Android updates, create a persistent release signing key and store it securely before distributing a release APK. Test authentication, file/PDF export, and mobile layouts on a physical device before giving builds to staff.

### Native branding

Branding source: `assets/logo.svg` (same white and green logo as the website). The mobile build runs `@capacitor/assets` after `cap add`/`cap sync` and generates platform-native launcher icons and launch images with a dark green backdrop. Android 12+ uses the operating system splash-screen layout. The Windows build runs `packaging/windows/generate-icon.mjs` to create a multi-resolution `build/icon.ico`; `electron-builder` updates the executable resources without code-signing. Neither generated graphics nor signing keys are committed. Update the source SVG and rebuild all packages to propagate visual changes.
