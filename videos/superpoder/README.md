# "Nesse mundo, todos têm um superpoder"

Vídeo vertical (1080x1920, 30 fps, ~89 s) no estilo dos vídeos virais de jogos de blocos, com lição de vida.

- `nesse_mundo_todos_tem_um_superpoder.mp4`: vídeo final com narração, trilha e efeitos
- `legendas.srt`: legendas/roteiro com tempos
- `make_video.py`: gerador. Personagens, cenários, legendas, trilha e efeitos são todos gerados por código.

**Lição:** *Talento é o que você recebe. Caráter é o que você constrói. Não espere ganhar um poder. Torne-se um.*

## Gerar de novo

```bash
pip install piper-tts numpy pillow   # e ffmpeg instalado
curl -LO https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-pt-br-edresson-low.tar.gz
tar xzf voice-pt-br-edresson-low.tar.gz
python3 make_video.py --voice pt-br-edresson-low.onnx --out out/
# prévia rápida de alguns quadros: --preview 5 20 40
```

Para mudar a história, edite a lista `SCENES` (texto narrado) e as funções `sc_*` (animação de cada cena).
