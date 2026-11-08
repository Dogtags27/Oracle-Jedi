#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <domain> <office-gmail> <upload-url>" >&2
  exit 1
fi

domain=$(printf '%s' "$1" | tr 'A-Z' 'a-z' | sed -E 's#^https?://##; s#/.*$##; s#^www\.##')
gmail=$(printf '%s' "$2" | tr 'A-Z' 'a-z')
upload="${3%/}"

printf '%s' "$domain" | grep -Eq '^[a-z0-9-]+(\.[a-z0-9-]+)+$' || { echo "domain looks wrong: $domain" >&2; exit 1; }
printf '%s' "$gmail" | grep -Eq '^[a-z0-9.+_-]+@gmail\.com$' || { echo "office-gmail must be a @gmail.com address" >&2; exit 1; }
printf '%s' "$upload" | grep -Eq '^https://[^[:space:]|]+$' || { echo "upload-url must start with https://" >&2; exit 1; }

here=$(cd "$(dirname "$0")" && pwd)
rm -rf "$here/dist"
cp -R "$here/site" "$here/dist"

find "$here/dist" -type f -print0 | while IFS= read -r -d '' f; do
  sed -i.bak -e "s|{{DOMAIN}}|$domain|g" -e "s|{{OFFICE_GMAIL}}|$gmail|g" -e "s|{{UPLOAD_URL}}|$upload|g" "$f"
  rm -f "$f.bak"
done

if grep -rqF '{{' "$here/dist"; then
  echo "a placeholder was not replaced" >&2
  exit 1
fi

squashed=$(find "$here/dist" -type f -exec cat {} + | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9')
for bad in 5550142 maplestreettaxdocs maplestreettaxhelp; do
  case "$squashed" in
    *"$bad"*)
      echo "'$bad' belongs to the training sample and must never appear on the office site" >&2
      exit 1
      ;;
  esac
done

if grep -qF '"placeholder"' "$here/dist/.well-known/handoff.json"; then
  echo "warning: demo-office/site/.well-known/handoff.json is still the placeholder. Replace it with the file from the office dashboard and build again." >&2
fi

echo "built $here/dist for https://$domain (office Gmail $gmail, upload -> $upload)"
