#!/usr/bin/env bash
# sync-apk.sh — copies the latest debug APK into frontend/public/downloads/
# and updates the version JSON.
#
# Usage (from project root):
#   bash scripts/sync-apk.sh
#
# Run AFTER: cd android && ./gradlew clean assembleDebug

set -e
cd "$(dirname "$0")/.."

APK_SRC="android/app/build/outputs/apk/debug/app-debug.apk"
APK_DST="frontend/public/downloads/trade-with-tayyab-v1.1.apk"
VERSION_JSON="frontend/public/downloads/apk-version.json"

echo ""
echo "========================================"
echo "  Trade With Tayyab — APK Sync Script  "
echo "========================================"
echo ""

if [ ! -f "$APK_SRC" ]; then
  echo "❌  APK not found at: $APK_SRC"
  echo "    Run './gradlew clean assembleDebug' inside the android/ folder first."
  exit 1
fi

SRC_SIZE=$(du -sh "$APK_SRC" | cut -f1)
echo "✅  Source APK: $APK_SRC ($SRC_SIZE)"

mkdir -p "$(dirname "$APK_DST")"
cp -f "$APK_SRC" "$APK_DST"
echo "✅  Copied to : $APK_DST"

# Extract version from build.gradle
VERSION_CODE=$(grep -oP 'versionCode\s+\K\d+' android/app/build.gradle | head -1)
VERSION_NAME=$(grep -oP 'versionName\s+"\K[^"]+' android/app/build.gradle | head -1)
UPDATED_AT=$(date +%Y-%m-%d)
FILE_SIZE=$(du -sh "$APK_DST" | cut -f1)

cat > "$VERSION_JSON" <<EOF
{
  "versionCode": $VERSION_CODE,
  "versionName": "$VERSION_NAME",
  "appId": "com.TradewithTayyab.app",
  "fileName": "trade-with-tayyab.apk",
  "fileSize": "$FILE_SIZE",
  "updatedAt": "$UPDATED_AT"
}
EOF

echo "✅  Version JSON: v$VERSION_NAME (code $VERSION_CODE)"
echo ""
echo "========================================"
echo "  Sync Complete!"
echo "  Next:"
echo "    git add frontend/public/downloads/"
echo "    git commit -m 'chore: update APK to v$VERSION_NAME'"
echo "    git push"
echo "========================================"
echo ""
