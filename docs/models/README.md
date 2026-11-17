# AXELR Whisper Models Directory

This directory stores local ASR models for AXELR's offline speech recognition. Models are automatically downloaded on first use, or can be manually downloaded from the links below.

## Supported Models
| Model Size | Download URL | SHA256 Checksum | File Size |
|------------|--------------|-----------------|-----------|
| tiny.en | https://ggml.ggerganov.com/ggml-model-whisper-tiny-en-q4_0.bin | aaf347b34566462563d5388200e6d39f33817d117641705a1567c3643c43375a | 67 MB |
| base.en | https://ggml.ggerganov.com/ggml-model-whisper-base-en-q4_0.bin | 7d1975e5e2d17f08505e762389825f5d342302321586911e712379d545f10b6a | 143 MB |
| small.en | https://ggml.ggerganov.com/ggml-model-whisper-small-en-q4_0.bin | 1f8a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b | 466 MB |

## Auto-Download
AXELR automatically downloads the required model on first run. The auto-download process:
1. Checks if the model file exists in this directory
2. Downloads in 256KB chunks with progress tracking
3. Verifies SHA256 checksum before use
4. Cleans up partial files if download fails

## Manual Installation
To manually install a model:
1. Download the model file from the URL above
2. Place it in this directory
3. Verify the SHA256 checksum matches
4. Update your localAsrModelURL in settings to point to the file

## Compatibility
Models are GGML format (Whisper.cpp) optimized for browser-based inference. Only use the exact versions listed above to ensure compatibility with AXELR's StreamingModelLoader.