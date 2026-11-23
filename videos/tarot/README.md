# A História do Tarô: das cartas Visconti-Sforza até hoje

Vídeo vertical (1080x1920, 30 fps, cerca de 2min42) em animação ilustrada 2D, com narração feminina suave, trilha renascentista e legendas.

- `a_historia_do_taro.mp4`: vídeo final
- `legendas.srt`: legendas com tempos
- `make_video.py`: gerador (desenho vetorial com skia, voz Kokoro `pf_dora`, música e efeitos sintetizados)

## Gerar de novo

```bash
pip install kokoro-onnx skia-python numpy pillow   # e ffmpeg; no Linux também libegl1
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
python3 make_video.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin --out out/
```

Importa funções de áudio de `../superpoder/make_video.py`. Em `SCENES`, o campo `say` é o texto lido pela voz (com grafia fonética para nomes estrangeiros) e `cap` é a legenda.

## English version (soft ASMR voice)

- `the_history_of_tarot.mp4`: English version, about 3min32
- `subtitles_en.srt`: English subtitles

```bash
python3 make_video.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin \
  --lang en --asmr --voice "af_heart:0.6,af_nicole:0.4" --speed 0.86 --out out_en/
```

`--asmr` turns on the close, warm voice chain (proximity EQ, de-esser, gentle compression), darker and quieter music, candle ambience and card sounds. The voice is a blend of two Kokoro voices: `af_heart` and the whispery `af_nicole`.
