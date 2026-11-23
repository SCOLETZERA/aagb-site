# "Nesse mundo, todo mundo tem um número em cima da cabeça"

Vídeo viral vertical (1080x1920, cerca de 80 s) em **3D**, com personagens em blocos no estilo dos jogos de blocos. Todos os modelos são originais e gerados por código.

**Lição:** *Não importa quantas pessoas te seguem. Importa quantas ficam quando você cai. Seja o 1 de alguém.*

- `o_numero_em_cima_da_cabeca.mp4`: vídeo final
- `legendas.srt`: legendas
- `engine3d.py`: mini motor 3D em OpenGL (moderngl). Tem sol, sombras, céu, neblina, rostos e "studs" procedurais e funciona sem GPU (Mesa llvmpipe).
- `world.py`: personagens articulados em blocos e o cenário da escola
- `make_video.py`: roteiro, câmeras, animação, narração (Kokoro `pm_alex`) e mixagem

```bash
pip install moderngl kokoro-onnx numpy pillow   # e ffmpeg; no Linux também libegl1 e libegl-mesa0
python3 make_video.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin --out out/
```

Usa as funções de legenda, trilha e efeitos de `../superpoder/make_video.py`.
