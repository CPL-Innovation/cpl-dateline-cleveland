#!/bin/sh
# Fetch the box-first layout detector weights into models/ (gitignored) and set
# up the Python env detect.py runs in. Idempotent: skips any file already present
# with the right checksum.
#
#   american-stories-layout.onnx  NealCaren/american-stories-onnx — a mirror of the
#                                 American Stories (Dell et al. 2023) Dropbox release.
#                                 Upstream publishes NO licence for these weights:
#                                 evaluation use only; never commit or redistribute.
#   pp-doclayout-v3.onnx          PaddlePaddle/PP-DocLayoutV3_onnx — Apache-2.0.
set -eu
cd "$(dirname "$0")/.."
mkdir -p models

fetch() { # <file> <url> <md5>
  if [ -f "models/$1" ] && [ "$(md5 -q "models/$1" 2>/dev/null || md5sum "models/$1" | cut -d' ' -f1)" = "$3" ]; then
    echo "ok       models/$1"; return
  fi
  echo "fetching models/$1"
  curl -fL --progress-bar -o "models/$1.part" "$2"
  sum="$(md5 -q "models/$1.part" 2>/dev/null || md5sum "models/$1.part" | cut -d' ' -f1)"
  if [ "$sum" != "$3" ]; then rm -f "models/$1.part"; echo "checksum mismatch for $1 ($sum)" >&2; exit 1; fi
  mv "models/$1.part" "models/$1"
}

fetch american-stories-layout.onnx \
  https://huggingface.co/NealCaren/american-stories-onnx/resolve/main/layout_model_new.onnx \
  21d242c66ac3611b47cb46b7f5a99f68
fetch pp-doclayout-v3.onnx \
  https://huggingface.co/PaddlePaddle/PP-DocLayoutV3_onnx/resolve/main/inference.onnx \
  51b5bd14414408eb31b29a8aaca3c2c7

uv sync --quiet --project detect
echo "detectors ready"
