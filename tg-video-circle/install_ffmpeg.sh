#!/bin/bash
set -e

echo "⚙ Installing ffmpeg..."
apt-get update -y
apt-get install -y ffmpeg
echo "✅ ffmpeg installed!"
