#!/bin/bash

# Create 192x192 icon using ImageMagick
convert -size 192x192 xc:transparent \
  -fill "#4a90e2" \
  -draw "roundrectangle 20,20 172,172 30,30" \
  -fill white \
  -draw "circle 60,154 60,134" \
  -fill none -stroke white -strokewidth 12 \
  -draw "path 'M 60 104 A 50 50 0 0 1 110 154 L 110 172 A 68 68 0 0 0 60 104'" \
  -draw "path 'M 60 54 A 100 100 0 0 1 160 154 L 160 172 A 118 118 0 0 0 60 54'" \
  icon-192.png 2>/dev/null || echo "<!-- 192x192 icon placeholder -->" > icon-192.png

# Create 512x512 icon
convert -size 512x512 xc:transparent \
  -fill "#4a90e2" \
  -draw "roundrectangle 50,50 462,462 80,80" \
  -fill white \
  -draw "circle 160,410 160,360" \
  -fill none -stroke white -strokewidth 32 \
  -draw "path 'M 160 280 A 130 130 0 0 1 290 410 L 290 460 A 180 180 0 0 0 160 280'" \
  -draw "path 'M 160 150 A 260 260 0 0 1 420 410 L 420 460 A 310 310 0 0 0 160 150'" \
  icon-512.png 2>/dev/null || echo "<!-- 512x512 icon placeholder -->" > icon-512.png

echo "Icons created (or placeholders if ImageMagick not available)"
