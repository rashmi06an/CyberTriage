#!/bin/bash
# =============================================================================
# resign-dmg.sh
# Ad-hoc signs the CyberTriage app bundle and repackages it as a DMG.
# This bypasses the "file is damaged" Gatekeeper error without needing
# an Apple Developer account.
#
# Usage:  bash scripts/resign-dmg.sh
#    or:  npm run resign
# =============================================================================

set -euo pipefail

APP_PATH="release/mac-arm64/CyberTriage.app"
VOLUME_NAME="CyberTriage"
OUTPUT_DMG="release/CyberTriage-1.0.0-arm64-signed.dmg"
WORK_DIR="/tmp/cybertriage_sign_$$"

echo "=== CyberTriage Ad-Hoc Re-Signing Script ==="
echo ""

# ── Cleanup trap ──────────────────────────────────────────────────────────────
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

# ── 1. Verify app bundle exists ──────────────────────────────────────────────
if [ ! -d "$APP_PATH" ]; then
  echo "❌ App bundle not found at: $APP_PATH"
  echo "   Run 'npm run electron:build' first."
  exit 1
fi
echo "✅ Found app bundle: $APP_PATH"

# ── 2. Copy app to a clean temp location ──────────────────────────────────────
echo ""
echo "📋 Copying app to clean work directory..."
mkdir -p "$WORK_DIR"
ditto "$APP_PATH" "$WORK_DIR/CyberTriage.app"
echo "   Done: $WORK_DIR/CyberTriage.app"

# ── 3. Strip ALL extended attributes from every file in the bundle ────────────
# This removes com.apple.FinderInfo, com.apple.provenance, com.apple.quarantine
# etc. which would cause "resource fork, Finder information, or similar detritus
# not allowed" errors during codesign.
echo ""
echo "🧹 Stripping all extended attributes..."
find "$WORK_DIR/CyberTriage.app" -exec xattr -c {} \; 2>/dev/null || true
dot_clean -m "$WORK_DIR/CyberTriage.app" 2>/dev/null || true
find "$WORK_DIR/CyberTriage.app" -name ".DS_Store" -delete 2>/dev/null || true
echo "   Done."

# ── 4. Ad-hoc sign nested binaries (engine, dylibs, frameworks, helpers) ─────
echo ""
echo "🔏 Signing nested binaries..."

# PyInstaller engine binary
find "$WORK_DIR/CyberTriage.app/Contents/Resources/engine" -type f 2>/dev/null | while read -r f; do
  if file "$f" | grep -qE 'Mach-O|executable|dynamic'; then
    codesign --force --sign "-" --timestamp=none "$f" 2>/dev/null && \
      echo "   Signed engine binary: $(basename "$f")" || true
  fi
done

# .dylib files
find "$WORK_DIR/CyberTriage.app" -name "*.dylib" -type f | while read -r f; do
  codesign --force --sign "-" --timestamp=none "$f" 2>/dev/null && \
    echo "   Signed dylib: $(basename "$f")" || true
done

# .so files
find "$WORK_DIR/CyberTriage.app" -name "*.so" -type f | while read -r f; do
  codesign --force --sign "-" --timestamp=none "$f" 2>/dev/null && \
    echo "   Signed .so: $(basename "$f")" || true
done

# Framework bundles
find "$WORK_DIR/CyberTriage.app" -name "*.framework" -type d | while read -r fw; do
  codesign --force --sign "-" --timestamp=none "$fw" 2>/dev/null && \
    echo "   Signed framework: $(basename "$fw")" || true
done

# Helper .app bundles
find "$WORK_DIR/CyberTriage.app" -name "*.app" -type d | while read -r helper; do
  codesign --force --deep --sign "-" --timestamp=none "$helper" 2>/dev/null && \
    echo "   Signed helper: $(basename "$helper")" || true
done

# ── 5. Sign the main app bundle ───────────────────────────────────────────────
echo ""
echo "🔏 Signing main app bundle..."
codesign --force --deep --sign "-" --timestamp=none "$WORK_DIR/CyberTriage.app"
echo "   ✅ App bundle signed."

# ── 6. Verify signature ───────────────────────────────────────────────────────
echo ""
echo "🔍 Verifying signature..."
if codesign --verify --deep "$WORK_DIR/CyberTriage.app" 2>&1; then
  echo "   ✅ Signature valid."
else
  echo "   ⚠️  Ad-hoc signature applied (expected for unsigned apps)."
fi

# ── 7. Stage DMG contents (app + Applications shortcut) ───────────────────────
# Just the app and a drag-target to /Applications — no README, no clutter. The
# window is laid out (step 8) so it opens straight to the classic
# "drag CyberTriage → Applications" view.
echo ""
echo "🗂  Staging DMG layout..."
STAGE_DIR="$WORK_DIR/dmg"
mkdir -p "$STAGE_DIR"
ditto "$WORK_DIR/CyberTriage.app" "$STAGE_DIR/CyberTriage.app"
ln -s /Applications "$STAGE_DIR/Applications"
echo "   Done."

# ── 8. Build a laid-out DMG (icon view, app ⇢ Applications) ────────────────────
echo ""
echo "📦 Building DMG with drag-to-Applications layout..."
rm -f "$OUTPUT_DMG"

RW_DMG="$WORK_DIR/rw.dmg"

# Size the read-write image from the staged contents plus generous slack so the
# copy and Finder metadata always fit.
STAGE_KB=$(du -sk "$STAGE_DIR" | cut -f1)
DMG_MB=$(( STAGE_KB / 1024 + 120 ))

hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$STAGE_DIR" \
  -ov \
  -format UDRW \
  -fs HFS+ \
  -size "${DMG_MB}m" \
  "$RW_DMG" >/dev/null

# Mount at the DEFAULT /Volumes location. Finder can only script a disk it has
# registered there — a custom /tmp mountpoint is invisible to `tell disk "…"`,
# which is why auto-arrange was silently skipped before. Capture both the device
# node (for detach) and the real mount point (Finder may append " 1" on clashes).
ATTACH_OUT=$(hdiutil attach "$RW_DMG" -readwrite -noverify -noautoopen)
DEV_NODE=$(echo "$ATTACH_OUT" | grep -Eo '^/dev/disk[0-9]+' | head -1)
MOUNT_POINT=$(echo "$ATTACH_OUT" | grep -Eo '/Volumes/.*$' | head -1)
VOL_NAME_ACTUAL=$(basename "$MOUNT_POINT")
sleep 2  # let Finder register the new volume before scripting it

# Arrange the window via AppleScript. Wrapped in a guard so a denied Automation
# permission (or a headless run) still yields a valid, working DMG.
echo "   Arranging icons on \"$VOL_NAME_ACTUAL\"..."
osascript <<EOF || echo "   ⚠️  Could not auto-arrange (Automation permission?); DMG still works."
tell application "Finder"
  tell disk "$VOL_NAME_ACTUAL"
    open
    delay 1
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 160, 740, 520}
    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 112
    set text size of theViewOptions to 12
    set position of item "CyberTriage.app" of container window to {140, 175}
    set position of item "Applications" of container window to {400, 175}
    update without registering applications
    delay 2
    close
  end tell
end tell
EOF

sync
sleep 1
hdiutil detach "$DEV_NODE" >/dev/null 2>&1 || hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || \
  { sleep 3; hdiutil detach "$DEV_NODE" -force >/dev/null 2>&1; } || true

# Convert the laid-out read-write image to a compressed, read-only DMG.
hdiutil convert "$RW_DMG" -format UDZO -imagekey zlib-level=9 -ov -o "$OUTPUT_DMG" >/dev/null

echo "   ✅ DMG created: $OUTPUT_DMG"

# ── 8. Sign the DMG itself ────────────────────────────────────────────────────
echo ""
echo "🔏 Signing DMG..."
codesign --force --sign "-" --timestamp=none "$OUTPUT_DMG"
xattr -d com.apple.quarantine "$OUTPUT_DMG" 2>/dev/null || true
echo "   ✅ DMG signed."

# ── 9. File size info ─────────────────────────────────────────────────────────
SIZE=$(du -sh "$OUTPUT_DMG" | cut -f1)

echo ""
echo "============================================================"
echo "✅ Ready to distribute!"
echo "   File : $OUTPUT_DMG"
echo "   Size : $SIZE"
echo ""
echo "📋 Tell recipients:"
echo "   If macOS still shows a warning on their machine:"
echo "   → Right-click the .app → 'Open' (works first time)"
echo "   OR open Terminal and run:"
echo "   → xattr -d com.apple.quarantine /path/to/CyberTriage.app"
echo "============================================================"
