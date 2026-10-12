#!/usr/bin/env bash
# Exits 1 and prints hits if the pre-Glass palette/tokens are still used in the given paths.
! grep -rnEi '(bg|text|border|ring|from|to|via|outline|fill|stroke|decoration|caret)-(indigo|blue|violet|surface|inset|raised|selected|overlay|drawer)\b|shadow-(float|overlay|toast|tooltip|glow-ai)\b|#8b8cff|#a5a6ff|#c7c8ff|#5b5cd6|rgba\(139, ?140, ?255|#0b0c10|#80849a|#4fd1a1|#e8b86a|#f07a6e|#6cb6ff|#e889c4|#b48cff|#a3a6b4|--(topbar-h|bottombar-h|sidebar-w|rail-w|drawer-w)' "$@"
